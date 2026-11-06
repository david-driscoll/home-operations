import * as compute from "@pulumi/azure-native/compute/index.js";
import * as network from "@pulumi/azure-native/network/index.js";
import type { Provider } from "@pulumi/azure-native/provider.js";
import * as resources from "@pulumi/azure-native/resources/index.js";
import { ComponentResource, type ComponentResourceOptions, type Input, type Output, output } from "@pulumi/pulumi";
import { AZURE_EDGE_IMAGE, AZURE_EDGE_OS_DISK_GB, AZURE_EDGE_OS_DISK_TYPE, AZURE_EDGE_REGIONS, AZURE_EDGE_VM_SIZE, type AzureEdgeRegion, nsgInboundRules } from "./edgeVm.ts";

export interface AzureEdgeVmArgs {
  region: AzureEdgeRegion;
  /** The VM's computer name and tailnet hostname, e.g. `netbird-azure-eus2`. */
  hostname: string;
  /** Opened inbound from the Internet; everything else is denied. */
  publicPorts: { tcp: readonly number[]; udp: readonly number[] };
  /** cloud-init. Day-0 only: Azure cannot change customData after create. */
  userData: Input<string>;
  /** The break-glass admin's key (`az vm run-command` is the other path). Port 22 is not public. */
  sshPublicKey: Input<string>;
  provider: Provider;
}

/**
 * One netbird-edge VM on Azure, in a resource group of its own region.
 *
 * Why a group per region: Azure keeps a group's metadata in the group's
 * region, and an outage there blocks changes to everything in it. The standby
 * exists for exactly that outage, so its resources must not be managed
 * through the primary's region.
 */
export class AzureEdgeVm extends ComponentResource {
  public readonly resourceGroup: resources.ResourceGroup;
  public readonly publicIp: network.PublicIPAddress;
  public readonly publicIp6: network.PublicIPAddress;
  public readonly vm: compute.VirtualMachine;
  public readonly publicIpAddress: Output<string>;
  /** The VM's static public IPv6 address. */
  public readonly publicIpv6Address: Output<string>;
  public readonly privateIpAddress: Output<string>;
  /** Changes when the VM is replaced: NetbirdServer's hostKey. */
  public readonly vmId: Output<string>;

  constructor(name: string, args: AzureEdgeVmArgs, opts?: ComponentResourceOptions) {
    super("custom:azure:EdgeVm", name, {}, opts);
    const region = AZURE_EDGE_REGIONS[args.region];
    const location = args.region;
    const cro = { parent: this, provider: args.provider };
    const tags = { "managed-by": "pulumi", stack: "netbird-edge" };

    this.resourceGroup = new resources.ResourceGroup(`${name}-rg`, { resourceGroupName: `netbird-${region.short}`, location, tags }, cro);
    const resourceGroupName = this.resourceGroup.name;

    const nsg = new network.NetworkSecurityGroup(
      `${name}-nsg`,
      {
        resourceGroupName,
        location,
        networkSecurityGroupName: `${args.hostname}-public`,
        securityRules: nsgInboundRules(args.publicPorts).map(rule => ({ ...rule })),
        tags,
      },
      cro,
    );

    // The subnet inline: a separate Subnet resource and a VNet that does not
    // list it fight over the VNet's subnets on every update. Dual-stack: both
    // families in the VNet's address space and in the one subnet
    // (edgeVm.ts AZURE_EDGE_REGIONS says where the IPv6 ranges come from).
    const vnet = new network.VirtualNetwork(
      `${name}-vnet`,
      {
        resourceGroupName,
        location,
        virtualNetworkName: `${args.hostname}-vnet`,
        addressSpace: { addressPrefixes: [region.vnetCidr, region.vnetCidr6] },
        subnets: [{ name: "edge", addressPrefixes: [region.subnetCidr, region.subnetCidr6] }],
        tags,
      },
      cro,
    );

    // Standard SKU, static: the address DNS points at, kept across a VM
    // replacement. Standard is closed to inbound until the NSG allows it.
    this.publicIp = new network.PublicIPAddress(
      `${name}-ip`,
      {
        resourceGroupName,
        location,
        publicIpAddressName: `${args.hostname}-ip`,
        sku: { name: "Standard", tier: "Regional" },
        publicIPAllocationMethod: "Static",
        publicIPAddressVersion: "IPv4",
        tags,
      },
      // Losing it means re-pointing DNS and every relay address; never deleted by accident.
      { ...cro, protect: true },
    );

    // The IPv6 twin: Standard, static, kept across a VM replacement like the
    // IPv4 address. Inbound is closed until the NSG allows it, and the NSG's
    // rules (source `*`) open the same public ports on both families.
    this.publicIp6 = new network.PublicIPAddress(
      `${name}-ip6`,
      {
        resourceGroupName,
        location,
        publicIpAddressName: `${args.hostname}-ip6`,
        sku: { name: "Standard", tier: "Regional" },
        publicIPAllocationMethod: "Static",
        publicIPAddressVersion: "IPv6",
        tags,
      },
      { ...cro, protect: true },
    );

    const nic = new network.NetworkInterface(
      `${name}-nic`,
      {
        resourceGroupName,
        location,
        networkInterfaceName: `${args.hostname}-nic`,
        networkSecurityGroup: { id: nsg.id },
        ipConfigurations: [
          {
            name: "primary",
            primary: true,
            privateIPAllocationMethod: "Dynamic",
            subnet: { id: vnet.subnets.apply(subnets => subnets?.[0]?.id ?? "") },
            publicIPAddress: { id: this.publicIp.id },
          },
          // A NIC's IPv6 configuration is never its primary; the guest takes
          // the address by DHCPv6 (stacks/netbird-edge, `<host>-ipv6-dhcp`).
          {
            name: "ipv6",
            primary: false,
            privateIPAddressVersion: "IPv6",
            privateIPAllocationMethod: "Dynamic",
            subnet: { id: vnet.subnets.apply(subnets => subnets?.[0]?.id ?? "") },
            publicIPAddress: { id: this.publicIp6.id },
          },
        ],
        tags,
      },
      cro,
    );

    this.vm = new compute.VirtualMachine(
      `${name}-vm`,
      {
        resourceGroupName,
        location,
        vmName: args.hostname,
        hardwareProfile: { vmSize: AZURE_EDGE_VM_SIZE },
        storageProfile: {
          imageReference: { ...AZURE_EDGE_IMAGE },
          osDisk: {
            name: `${args.hostname}-os`,
            createOption: "FromImage",
            diskSizeGB: AZURE_EDGE_OS_DISK_GB,
            managedDisk: { storageAccountType: AZURE_EDGE_OS_DISK_TYPE },
            // The disk holds nothing a restore cannot rebuild (Garage has the store).
            deleteOption: "Delete",
          },
        },
        osProfile: {
          computerName: args.hostname,
          adminUsername: "netbird-admin",
          customData: output(args.userData).apply(u => Buffer.from(u).toString("base64")),
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: { publicKeys: [{ path: "/home/netbird-admin/.ssh/authorized_keys", keyData: args.sshPublicKey }] },
            provisionVMAgent: true,
          },
        },
        networkProfile: { networkInterfaces: [{ id: nic.id, primary: true }] },
        // Managed boot diagnostics: the serial log and Serial Console, the
        // break-glass when Tailscale never comes up.
        diagnosticsProfile: { bootDiagnostics: { enabled: true } },
        tags,
      },
      {
        ...cro,
        // The NIC (and so the static IP) belongs to one VM at a time.
        deleteBeforeReplace: true,
        // customData cannot change after create (Azure rejects it), and a
        // rotated Tailscale key in it must not replace a running server.
        ignoreChanges: ["osProfile.customData", "osProfile.linuxConfiguration.ssh"],
      },
    );

    this.publicIpAddress = this.publicIp.ipAddress.apply(ip => {
      if (!ip) throw new Error(`${args.hostname}: the static public IP has no address yet`);
      return ip;
    });
    this.publicIpv6Address = this.publicIp6.ipAddress.apply(ip => {
      if (!ip) throw new Error(`${args.hostname}: the static public IPv6 has no address yet`);
      return ip;
    });
    this.privateIpAddress = nic.ipConfigurations.apply(configs => configs?.[0]?.privateIPAddress ?? "");
    this.vmId = this.vm.vmId;

    this.registerOutputs({ publicIpAddress: this.publicIpAddress, publicIpv6Address: this.publicIpv6Address, privateIpAddress: this.privateIpAddress });
  }
}

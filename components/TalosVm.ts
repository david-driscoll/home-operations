import { remote } from "@pulumi/command";
import { ComponentResource, type ComponentResourceOptions, mergeOptions } from "@pulumi/pulumi";
import type { ProxmoxHost } from "./ProxmoxHost.ts";

// A Talos Linux node as a Proxmox VM. Pulumi owns the VM's shape (CPU, memory,
// NIC, passed-through PCI devices) and the install ISO; Talos itself is still
// configured from talos/talconfig.yaml, and upgrades still go through tuppr.
//
// Built from `qm` over SSH rather than the proxmoxve VM resource, like every
// other guest in this repo: hostpci with a raw PCI address is root@pam-only,
// and the provider's API token is not root.
//
// There is deliberately no delete command. Removing this from the stack
// forgets the VM; it never destroys a control plane's disks.
export interface TalosVmArgs {
  host: ProxmoxHost;
  vmId: number;
  cores: number;
  memoryMiB: number;
  /** Boot disk (Talos STATE/EPHEMERAL, and so etcd) size on `storage`. */
  diskGiB: number;
  /** Proxmox storage for the boot and EFI disks. */
  storage: string;
  bridge: string;
  /** Fixed so talconfig.yaml's deviceSelector.hardwareAddr can match it. */
  macAddress: string;
  /** factory.talos.dev ISO for the node's schematic; only used to install. */
  isoUrl: string;
  /** Host PCI addresses passed through whole, e.g. an NVMe for Longhorn. */
  pciDevices?: string[];
  /** Power the VM on. Leave false until the host has the memory for it. */
  start?: boolean;
}

export class TalosVm extends ComponentResource {
  public readonly vmId: number;

  constructor(name: string, args: TalosVmArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:TalosVm", name, opts);
    const cro = { parent: this };
    const connection = args.host.remoteConnection;
    this.vmId = args.vmId;

    // factory URLs end in .../<schematic>/<version>/metal-amd64.iso, so the
    // schematic and version make a stable, unique local name.
    const [schematic, version] = args.isoUrl.split("/").slice(-3, -1);
    const isoName = `talos-${version}-${schematic.slice(0, 12)}.iso`;
    const isoPath = `/var/lib/vz/template/iso/${isoName}`;
    const iso = new remote.Command(
      `${name}-iso`,
      {
        connection,
        create: `[ -f ${isoPath} ] || { wget -q -O ${isoPath}.part '${args.isoUrl}' && mv ${isoPath}.part ${isoPath}; }`,
      },
      cro,
    );

    // Everything `qm set` can change on an existing VM; `qm create` adds the
    // disks, which are never touched again. Changes land on the next boot.
    const settings = [
      `--name ${name}`,
      "--cpu host",
      "--sockets 1",
      `--cores ${args.cores}`,
      `--memory ${args.memoryMiB}`,
      // Ballooning reclaims guest memory behind kubelet's back.
      "--balloon 0",
      `--net0 virtio=${args.macAddress},bridge=${args.bridge}`,
      ...(args.pciDevices ?? []).map((address, index) => `--hostpci${index} ${address},pcie=1`),
      `--ide2 local:iso/${isoName},media=cdrom`,
      // Empty disk falls through to the ISO on first boot; once Talos has
      // installed, the disk boots and the ISO is ignored.
      "--boot 'order=scsi0;ide2'",
      "--agent enabled=1",
      "--onboot 1",
      "--ostype l26",
    ].join(" ");

    const vm = new remote.Command(
      `${name}-vm`,
      {
        connection,
        create: [
          `qm status ${args.vmId} >/dev/null 2>&1 ||`,
          `qm create ${args.vmId} --machine q35 --bios ovmf`,
          `--efidisk0 ${args.storage}:1,efitype=4m,pre-enrolled-keys=0`,
          `--scsihw virtio-scsi-single --scsi0 ${args.storage}:${args.diskGiB},ssd=1,discard=on,iothread=1`,
          settings,
        ].join(" "),
        // A changed `create` runs `update` in place. No `triggers`: they would
        // replace the resource, and its create is a no-op once the VM exists.
        update: `qm set ${args.vmId} ${settings}`,
      },
      mergeOptions(cro, { dependsOn: [iso] }),
    );

    if (args.start) {
      new remote.Command(
        `${name}-start`,
        {
          connection,
          create: `qm status ${args.vmId} | grep -q running || qm start ${args.vmId}`,
        },
        mergeOptions(cro, { dependsOn: [vm] }),
      );
    }
  }
}

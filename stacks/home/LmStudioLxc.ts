import { ProxmoxHost } from "./ProxmoxHost.ts";
import pulumi, { asset, ComponentResource, Input, interpolate, mergeOptions, Output, output, runtime, unknown } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { getContainerHostnames } from "./helper.ts";
import { StandardDns } from "./StandardDns.ts";
import { DeviceKey, DeviceTags, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { getTailscaleClient, installTailscale, installTailscaleLxc } from "@components/tailscale.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import proxmox from "@muhlba91/pulumi-proxmoxve";
import { OPClient } from "@components/op.ts";
import * as tls from "@pulumi/tls";
import { TailscaleIp } from "@openapi/tailscale-grants.js";
import { awaitOutput, copyFileToRemote } from "@components/helpers.ts";
import { dns } from "@components/constants.ts";

export interface LmStudioLxcArgs {
  globals: GlobalResources;
  host: ProxmoxHost;
  vmId: number;
  cluster: Input<ClusterDefinition>;
  tailscaleArgs?: Parameters<typeof installTailscale>[0]["args"];
  registerTailscaleService(service: string): void;
}

export class LmStudioLxc extends ComponentResource {
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleIpAddress: Output<TailscaleIp>;
  public readonly hostname: Output<string>;
  public readonly device: Output<GetDeviceResult>;
  public readonly internalIpAddress: Output<string>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly cluster: Output<ClusterDefinition>;
  public readonly shortName: string | undefined;
  public readonly tailscaleName: Output<string>;
  public readonly vmId: Output<number>;

  constructor(
    name: string,
    private readonly args: LmStudioLxcArgs,
  ) {
    super("home:lmstudio:LmStudioLxc", name, {}, { parent: args.host });

    const cro = { parent: this };
    const cluster = output(args.cluster);
    this.cluster = cluster;
    this.shortName = args.host.shortName ?? name;

    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("lmstudio", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;
    this.tailscaleName = tailscaleName;

    // Derive Tailscale IP from host (e.g., 100.111.10.x01 for lmstudio)
    const tailscaleIpParts = args.host.tailscaleIpAddress.split(".");
    this.tailscaleIpAddress = interpolate`${tailscaleIpParts[0]}.${tailscaleIpParts[1]}.${tailscaleIpParts[2]}.${parseInt(tailscaleIpParts[3]) + 1}` as Output<TailscaleIp>;

    // Create LXC container with sufficient resources for LLM workloads
    const container = new proxmox.ct.Container(
      `${name}-container`,
      {
        nodeName: args.host.name,
        vmId: args.vmId,
        description: `LM Studio Container for ${cluster.title}`,
        unprivileged: false,
        features: {
          nesting: true,
        },
        operatingSystem: {
          templateFileId: "local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst",
          type: "ubuntu",
        },
        // GPU workload resource requirements
        cpu: {
          cores: 4, // Adjust based on your hardware
        },
        memory: {
          dedicated: 6 * 1024, // 6GB for LLM workloads
          swap: 1024,
        },
        disk: {
          datastoreId: "local-lvm",
          size: 100, // 200GB for models and temp data
        },
        networkInterfaces: [
          {
            name: "eth0",
            bridge: "vmbr0",
            firewall: false,
          },
        ],
        initialization: {
          hostname: name,
          dns: {
            servers: dns.internalIps,
          },
        },
        started: true,
        startOnBoot: true,
      },
      mergeOptions(cro, { provider: args.host.rootPveProvider }),
    );

    this.vmId = container.vmId;
    // After container creation, inject AMD GPU passthrough config then (re)start the container.
    // Using pct.conf directly avoids the provider treating vzcreate warnings as errors.
    const configureGpuPassthrough = new remote.Command(
      `${name}-configure-gpu`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`
CONF=/etc/pve/lxc/${this.vmId}.conf

# Get dynamic major:minor numbers for the AMD GPU devices
RENDERD_MAJ=\$(stat -c '%t' /dev/dri/renderD128 2>/dev/null | xargs printf '%d')
RENDERD_MIN=\$(stat -c '%T' /dev/dri/renderD128 2>/dev/null | xargs printf '%d')
KFD_MAJ=\$(stat -c '%t' /dev/kfd 2>/dev/null | xargs printf '%d')
KFD_MIN=\$(stat -c '%T' /dev/kfd 2>/dev/null | xargs printf '%d')

add_if_missing() {
  grep -qxF "$1" "$CONF" || echo "$1" >> "$CONF"
}

add_if_missing "lxc.apparmor.profile: unconfined"
add_if_missing "lxc.cgroup2.devices.allow: c \${RENDERD_MAJ}:\${RENDERD_MIN} rwm"
add_if_missing "lxc.cgroup2.devices.allow: c \${KFD_MAJ}:\${KFD_MIN} rwm"
add_if_missing "lxc.mount.entry: /dev/dri/renderD128 dev/dri/renderD128 none bind,optional,create=file"
add_if_missing "lxc.mount.entry: /dev/kfd dev/kfd none bind,optional,create=file"

# Restart the container to apply the new config
pct stop ${this.vmId} 2>/dev/null || true
sleep 2
pct start ${this.vmId}
echo "AMD GPU passthrough configured and container restarted"
`,
      },
      mergeOptions(cro, { dependsOn: [container] }),
    );
    // Get container IP address
    const getIpCommand = new remote.Command(
      `${name}-get-ip-address`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${this.vmId} -- ip -4 addr show dev eth0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1`,
      },
      mergeOptions(cro, { dependsOn: [configureGpuPassthrough] }),
    );

    const internalIpAddress = (this.internalIpAddress = getIpCommand.stdout.apply((ip) => ip.trim()));

    // Configure SSH environment for Tailscale
    // const configureSshEnv = new remote.Command(
    //   `${name}-configure-ssh-env`,
    //   {
    //     connection: args.host.remoteConnection,
    //     create: interpolate`pct exec ${this.vmId} -- mkdir -p /etc/ssh/sshd_config.d/ && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
    //     delete: interpolate`pct exec ${this.vmId} -- rm -f /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
    //   },
    //   mergeOptions(cro, { dependsOn: [getIpCommand] }),
    // );

    // Install dependencies
    const installDeps = new remote.Command(
      `${name}-install-deps`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${this.vmId} -- apt-get update && apt-get install -y curl wget jq ca-certificates`,
      },
      mergeOptions(cro, { dependsOn: [getIpCommand] }),
    );

    // Install Tailscale
    const tailscaleSet = installTailscaleLxc({
      connection: args.host.remoteConnection,
      name,
      parent: this,
      tailscaleName: tailscaleHostname,
      globals: args.globals,
      args: { acceptDns: true, acceptRoutes: false, ssh: true, ...args.tailscaleArgs },
      vmId: this.vmId,
      dependsOn: [installDeps],
    });

    // Install LM Studio headless (llmster)
    const installLmStudio = new remote.Command(
      `${name}-install-lmstudio`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${this.vmId} -- curl -fsSL https://lmstudio.ai/install.sh | bash && pct exec ${this.vmId} -- lms --version`,
      },
      mergeOptions(cro, { dependsOn: [installDeps] }),
    );

    // Create systemd service for LM Studio
    const lmstudioServiceConfig = interpolate`[Unit]
Description=LM Studio Headless Server (${cluster.title})
After=network.target

[Service]
Type=simple
User=root
ExecStart=/root/.local/bin/lms start --listen 0.0.0.0:1234
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lmstudio

[Install]
WantedBy=multi-user.target
`;

    const copySystemdFile = copyFileToRemote(`${name}-copy-systemd`, {
      connection: {
        host: tailscaleHostname,
        user: "root",
      },
      remotePath: "/etc/systemd/system/lmstudio.service",
      content: lmstudioServiceConfig,
      parent: this,
      dependsOn: [tailscaleSet, installLmStudio],
    });

    // Enable and start LM Studio service
    const startLmStudioService = new remote.Command(
      `${name}-start-service`,
      {
        connection: {
          host: tailscaleHostname,
          user: "root",
        },
        create: `systemctl daemon-reload && systemctl enable lmstudio && systemctl start lmstudio && sleep 5 && systemctl status lmstudio`,
      },
      mergeOptions(cro, { dependsOn: [copySystemdFile] }),
    );

    // Get Tailscale device
    const device = (this.device = runtime.isDryRun()
      ? (output(unknown) as ReturnType<typeof getDeviceOutput>)
      : getDeviceOutput(
          { hostname: tailscaleHostname },
          {
            provider: args.globals.tailscaleProvider,
            parent: this,
            dependsOn: [tailscaleSet],
          },
        ));

    // Create device tags
    const deviceTags = new DeviceTags(
      `${name}-tags`,
      {
        tags: ["tag:lmstudio"],
        deviceId: device.apply((z) => z.id),
      },
      {
        provider: args.globals.tailscaleProvider,
        parent: this,
        retainOnDelete: true,
      },
    );

    // Create device key
    const deviceKey = new DeviceKey(
      `${name}-key`,
      {
        keyExpiryDisabled: true,
        deviceId: device.apply((z) => z.id),
      },
      {
        provider: args.globals.tailscaleProvider,
        parent: this,
      },
    );

    // Register Tailscale service
    args.registerTailscaleService(`lmstudio-${args.host.shortName ?? args.host.name}`);

    // Store connection info in 1Password
    const op = new OPClient();
    const lmstudioInfo = new OnePasswordItem(
      `${name}-info`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: interpolate`LM Studio: ${name}`,
        tags: ["lmstudio", "ai", "llm"],
        sections: {
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: tailscaleHostname },
              username: { type: TypeEnum.String, value: "root" },
            },
          },
          api: {
            fields: {
              endpoint: { type: TypeEnum.String, value: interpolate`http://${tailscaleHostname}:1234/v1` },
              description: { type: TypeEnum.String, value: "OpenAI-compatible API for local LLM inference" },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          internalIpAddress: { type: TypeEnum.String, value: internalIpAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      { parent: this },
    );

    this.remoteConnection = {
      host: tailscaleHostname,
      user: "root",
    };
  }
}

export function getLmStudioProperties() {
  return {
    vmId: { description: "VM ID in Proxmox (e.g., 301, 401)" },
    cluster: { description: "Cluster definition for this LXC" },
    enableGpuPassthrough: { description: "GPU passthrough must be configured in Proxmox manually" },
  };
}

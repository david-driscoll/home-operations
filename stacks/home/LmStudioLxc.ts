import { ProxmoxHost } from "./ProxmoxHost.ts";
import pulumi, { asset, ComponentResource, Input, interpolate, mergeOptions, Output, output, runtime, unknown } from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { getContainerHostnames } from "./helper.ts";
import { StandardDns } from "./StandardDns.ts";
import { DeviceKey, DeviceTags, getDeviceOutput, GetDeviceResult } from "@pulumi/tailscale";
import { getTailscaleClient, installTailscale } from "@components/tailscale.ts";
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
        unprivileged: false, // Must be privileged for GPU passthrough
        operatingSystem: {
          templateFileId: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst",
          type: "ubuntu",
        },
        // GPU workload resource requirements
        cpu: {
          cores: 6, // Adjust based on your hardware
        },
        memory: {
          dedicated: 8196, // 8GB for LLM workloads
          swap: 4096,
        },
        disk: {
          datastoreId: "local-lvm",
          size: 200, // 200GB for models and temp data
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
      },
      mergeOptions(cro, { provider: args.host.pveProvider }),
    );

    this.vmId = container.vmId;

    // Configure GPU device passthrough on the host
    // This adds the necessary cgroup2 device permissions and mount entries for AMD GPU
    const configureGpuPassthrough = new remote.Command(
      `${name}-configure-gpu`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`
# Get the major and minor device numbers
RENDERD_MAJOR=\$(stat -c '%t' /dev/dri/renderD128 | xargs printf '%d')
RENDERD_MINOR=\$(stat -c '%T' /dev/dri/renderD128 | xargs printf '%d')
KFD_MAJOR=\$(stat -c '%t' /dev/kfd | xargs printf '%d')
KFD_MINOR=\$(stat -c '%T' /dev/kfd | xargs printf '%d')

# Backup the container config
cp /etc/pve/lxc/${this.vmId}.conf /etc/pve/lxc/${this.vmId}.conf.backup

# Add GPU device passthrough configuration
cat >> /etc/pve/lxc/${this.vmId}.conf << 'EOF'

# AMD GPU passthrough configuration
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: c \$RENDERD_MAJOR:\$RENDERD_MINOR rwm
lxc.cgroup2.devices.allow: c \$KFD_MAJOR:\$KFD_MINOR rwm
lxc.mount.entry: /dev/dri/renderD128 dev/dri/renderD128 none bind,optional,create=file
lxc.mount.entry: /dev/kfd dev/kfd none bind,optional,create=file
EOF

echo "GPU passthrough configuration added successfully"
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
    const configureSshEnv = new remote.Command(
      `${name}-configure-ssh-env`,
      {
        connection: {
          host: tailscaleHostname,
          user: "root",
        },
        create: interpolate`mkdir -p /etc/ssh/sshd_config.d/ && echo 'AcceptEnv TS_AUTHKEY' > /etc/ssh/sshd_config.d/99-tailscale.conf && systemctl restart sshd`,
      },
      mergeOptions(cro, { dependsOn: [getIpCommand] }),
    );

    // Install dependencies
    const installDeps = new remote.Command(
      `${name}-install-deps`,
      {
        connection: {
          host: tailscaleHostname,
          user: "root",
        },
        create: interpolate`apt-get update && apt-get install -y curl wget jq ca-certificates`,
      },
      mergeOptions(cro, { dependsOn: [configureSshEnv] }),
    );

    // Install LM Studio headless (llmster)
    const installLmStudio = new remote.Command(
      `${name}-install-lmstudio`,
      {
        connection: {
          host: tailscaleHostname,
          user: "root",
        },
        create: interpolate`curl -fsSL https://lmstudio.ai/install.sh | bash && lms --version`,
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
      dependsOn: [installLmStudio],
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

    // Install Tailscale
    const tailscaleSet = installTailscale({
      connection: {
        host: tailscaleHostname,
        user: "root",
      },
      name,
      parent: this,
      tailscaleName: tailscaleHostname,
      globals: args.globals,
      args: { acceptDns: true, acceptRoutes: false, ssh: true, ...args.tailscaleArgs },
    });

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

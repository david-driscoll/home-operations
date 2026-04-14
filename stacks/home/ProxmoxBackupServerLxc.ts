import { FullItem } from "@1password/connect";
import { getTailscaleSection, clientIdPair } from "@components/helpers.ts";
import { getTailscaleClient, installTailscaleLxc } from "@components/tailscale.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { remote, types } from "@pulumi/command";
import { GetDeviceResult, getDeviceOutput } from "@pulumi/tailscale";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, log, mergeOptions, Output, output, runtime, unknown } from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import * as authentik from "@pulumi/authentik";
import { TailscaleIp } from "@openapi/tailscale-grants.js";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { createDnsSection, StandardDns } from "./StandardDns.ts";
import { getContainerHostnames } from "./helper.ts";
import { CommunityScriptLxcVars, POST_PBS_INSTALL_URL, runCommunityScriptLxc, runCommunityScriptTool } from "./lxc.ts";
import { AuthentikOutputs } from "@components/authentik.ts";
import { ApplicationCertificate } from "@components/authentik/application-certificate.ts";
import { DockgeLxc } from "./DockgeLxc.ts";

export interface PbsPostInstallArgs {
  /** Set to false to skip post-install entirely. Defaults to true. */
  enabled?: boolean;
  /** Reboot the container after post-install completes. Handled via pct reboot. Defaults to false. */
  rebootAfter?: boolean;
}

export interface ProxmoxBackupServerLxcArgs {
  globals: GlobalResources;
  outputs: AuthentikOutputs;
  /** Cluster definition used to derive the OIDC issuer URL and Traefik CNAME hostname. */
  cluster: Input<Pick<ClusterDefinition, "authentikDomain" | "rootDomain">>;
  /** When provided, a Traefik dynamic config for PBS is written to this Dockge instance. */
  dockge: DockgeLxc;
  host: ProxmoxHost;
  vmId: number;
  ipAddress?: TailscaleIp;
  tailscaleIpAddress?: TailscaleIp;
  tailscaleArgs?: {
    advertiseTags: string[];
    acceptDns?: Input<boolean>;
    acceptRoutes?: Input<boolean>;
    ssh?: Input<boolean>;
    advertiseExitNode?: Input<boolean>;
    relayServerPort?: Input<number>;
  };
  lxcVars?: Partial<Omit<CommunityScriptLxcVars, "ctid" | "hostname">>;
  /** Post-install configuration. Runs after Tailscale is set up. */
  postInstall?: PbsPostInstallArgs;
}

function toBase64(value: Output<string>) {
  return value.apply((text) => Buffer.from(text, "utf8").toString("base64"));
}

function deriveContainerTailscaleIp(hostIp: TailscaleIp, lastOctet: number): TailscaleIp {
  const [first, second, third] = hostIp.split(".");
  if (!first || !second || !third) {
    throw new Error(`Unable to derive container Tailscale IP from ${hostIp}`);
  }
  return `${first}.${second}.${third}.${lastOctet}` as TailscaleIp;
}

export class ProxmoxBackupServerLxc extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly device: Output<GetDeviceResult>;
  public readonly dns: StandardDns;
  public readonly ipAddress: Output<TailscaleIp>;
  public readonly sshKey: tls.PrivateKey;
  public readonly oidcClientId: Output<string>;
  public readonly oidcClientSecret: Output<string>;
  public readonly oidcIssuerUrl: Output<string>;

  constructor(name: string, args: ProxmoxBackupServerLxcArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:ProxmoxBackupServerLxc", name, {}, mergeOptions(opts, { parent: args.host }));

    const cro = { parent: this };
    const tailscaleOptions = {
      advertiseTags: args.tailscaleArgs?.advertiseTags ?? [],
      ...(args.tailscaleArgs ?? {}),
      acceptDns: true,
      acceptRoutes: false,
      ssh: true,
      advertiseExitNode: false,
    };
    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("pbs", args.host, args.globals);
    this.hostname = hostname;
    this.sshKey = new tls.PrivateKey(
      `${name}-ssh-key`,
      {
        algorithm: "ED25519",
      },
      cro,
    );

    const createPbsLxc = runCommunityScriptLxc(
      `${name}-create-pbs`,
      {
        connection: args.host.remoteConnection,
        script: "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/proxmox-backup-server.sh",
        vars: {
          ctid: args.vmId,
          hostname: name,
          unprivileged: 1,
          cpu: 4,
          ram: 8192,
          disk: 128,
          os: "debian",
          version: 13,
          ipv6_method: "none",
          mount_fs: "nfs",
          ...(args.ipAddress ? { net: `${args.ipAddress}/16`, gateway: "10.10.0.1" } : {}),
          ...(args.lxcVars ?? {}),
        },
      },
      cro,
    );

    const mountHostData = new remote.Command(
      `${name}-mount-host-data`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`if pct config ${args.vmId} >/dev/null 2>&1; then mkdir -p /data && pct set ${args.vmId} -mp0 /data,mp=/data; else echo "Skipping /data mount until CT ${args.vmId} exists"; fi`,
        update: interpolate`if pct config ${args.vmId} >/dev/null 2>&1; then mkdir -p /data && pct set ${args.vmId} -mp0 /data,mp=/data; else echo "Skipping /data mount until CT ${args.vmId} exists"; fi`,
      },
      mergeOptions(cro, { dependsOn: createPbsLxc ? [createPbsLxc] : [] }),
    );

    const setHostname = new remote.Command(
      `${name}-set-hostname`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`if pct config ${args.vmId} >/dev/null 2>&1; then pct exec ${args.vmId} -- hostnamectl set-hostname ${name}; else echo "Skipping hostname update until CT ${args.vmId} exists"; fi`,
        update: interpolate`if pct config ${args.vmId} >/dev/null 2>&1; then pct exec ${args.vmId} -- hostnamectl set-hostname ${name}; else echo "Skipping hostname update until CT ${args.vmId} exists"; fi`,
      },
      mergeOptions(cro, { dependsOn: [mountHostData] }),
    );

    const deviceInfo = installTailscaleLxc({
      connection: args.host.remoteConnection,
      name: tailscaleName,
      ipAddress: args.tailscaleIpAddress ?? deriveContainerTailscaleIp(args.host.tailscaleIpAddress, 200 + args.vmId),
      parent: this,
      vmId: args.vmId,
      globals: args.globals,
      dependsOn: [setHostname],
      args: tailscaleOptions,
    });

    const authorizedKeyBase64 = toBase64(output(this.sshKey.publicKeyOpenssh).apply((key) => `${key.trim()}\n`));
    const sshConfigBase64 = toBase64(output(["PubkeyAuthentication yes", "PasswordAuthentication no", "KbdInteractiveAuthentication no", "PermitRootLogin prohibit-password", ""].join("\n")));
    const configureRootSshCommand = all([authorizedKeyBase64, sshConfigBase64]).apply(([authorizedKey, sshConfig]) =>
      [
        `pct exec ${args.vmId} -- bash -lc "install -d -m 700 /root/.ssh`,
        `printf '%s' '${authorizedKey}' | base64 -d > /root/.ssh/authorized_keys`,
        `chmod 600 /root/.ssh/authorized_keys`,
        `install -d -m 755 /etc/ssh/sshd_config.d`,
        `printf '%s' '${sshConfig}' | base64 -d > /etc/ssh/sshd_config.d/99-root-key-only.conf`,
        `chmod 644 /etc/ssh/sshd_config.d/99-root-key-only.conf`,
        `systemctl enable --now ssh`,
        `(systemctl restart ssh || systemctl restart sshd)"`,
      ].join(" && "),
    );
    const configureRootSsh = new remote.Command(
      `${name}-configure-root-ssh`,
      {
        connection: args.host.remoteConnection,
        create: configureRootSshCommand,
        update: configureRootSshCommand,
        triggers: [output(this.sshKey.publicKeyFingerprintSha256)],
      },
      mergeOptions(cro, { dependsOn: [] }),
    );

    const cluster = output(args.cluster);
    const { clientId, clientSecret } = clientIdPair(name, { options: cro });
    const signingKey = new ApplicationCertificate(name, { globals: args.globals }, cro);
    const issuerUrl = cluster.apply((c) => `https://${c.authentikDomain}/application/o/${name}/`);
    const externalUrl = cluster.apply((c) => `https://pbs.${c.rootDomain}`);

    this.oidcClientId = clientId;
    this.oidcClientSecret = clientSecret;
    this.oidcIssuerUrl = issuerUrl;

    const oidcProvider = new authentik.ProviderOauth2(
      name,
      {
        authorizationFlow: args.outputs.flows.implicitConsentFlow,
        authenticationFlow: args.outputs.flows.authenticationFlow,
        invalidationFlow: args.outputs.flows.providerLogoutFlow,
        clientId,
        clientSecret,
        signingKey: signingKey.signingKey.id,
        allowedRedirectUris: [{ matching_mode: "regex", url: "https://.*\\?oidccode" }],
        includeClaimsInIdToken: true,
      },
      cro,
    );

    new authentik.Application(
      name,
      {
        slug: name,
        name: interpolate`Proxmox Backup Server - ${args.host.title}`,
        protocolProvider: oidcProvider.id.apply((id) => parseFloat(id)),
        metaLaunchUrl: externalUrl,
        openInNewTab: true,
        group: "Infrastructure",
      },
      cro,
    );

    const externalHostname = externalUrl.apply((u) => new URL(u).hostname);
    args.dockge.registerExternalService(
      {
        name,
        hostname: externalHostname,
        port: 8007,
      },
      [],
    );
    new StandardDns(`${name}-external`, { hostname: externalHostname, ipAddress: args.dockge.ipAddress, type: "A" }, args.globals, cro);

    const realmId = "authentik";
    const oidcScript = interpolate`
REALM_ID="${realmId}"
ISSUER_URL="${issuerUrl}"
CLIENT_ID="${clientId}"
CLIENT_SECRET="${clientSecret}"

if proxmox-backup-manager openid list 2>/dev/null | grep -q "\\"$REALM_ID\\""; then
  proxmox-backup-manager openid update "$REALM_ID" \\
    --issuer-url "$ISSUER_URL" \\
    --client-id "$CLIENT_ID" \\
    --client-secret "$CLIENT_SECRET"
else
  proxmox-backup-manager openid register "$REALM_ID" \\
    --issuer-url "$ISSUER_URL" \\
    --client-id "$CLIENT_ID" \\
    --client-secret "$CLIENT_SECRET" \\
    --autocreate-users true
fi
echo "PBS OIDC configured for realm: $REALM_ID"
`;
    new remote.Command(
      `${name}-configure-oidc`,
      {
        connection: args.host.remoteConnection,
        create: oidcScript.apply((s) => `bash -seuo pipefail <<'__PBS_OIDC__'\n${s.trim()}\n__PBS_OIDC__`),
        triggers: [clientId, issuerUrl],
      },
      mergeOptions(cro, { dependsOn: [] }),
    );

    // const postInstallRun = runCommunityScriptTool(
    //   `${name}-post-install`,
    //   {
    //     connection: args.host.remoteConnection,
    //     vmId: args.vmId,
    //     script: "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/tools/pve/post-pbs-install.sh",
    //   },
    //   mergeOptions(cro, { dependsOn: [tailscaleSet] }),
    // );

    // if (args.postInstall?.rebootAfter) {
    //   new remote.Command(
    //     `${name}-post-install-reboot`,
    //     {
    //       connection: args.host.remoteConnection,
    //       create: interpolate`pct reboot ${args.vmId}`,
    //       update: interpolate`pct reboot ${args.vmId}`,
    //       triggers: [postInstallRun],
    //     },
    //     mergeOptions(cro, { dependsOn: postInstallRun ? [postInstallRun] : [tailscaleSet] }),
    //   );
    // }

    const ipAddress = (this.ipAddress = args.ipAddress
      ? output(args.ipAddress)
      : (new remote.Command(
          `${name}-get-ip-address`,
          {
            connection: args.host.remoteConnection,
            create: interpolate`pct exec ${args.vmId} -- ip -4 addr show dev eth0 | grep -oP '(?<=inet\\s)\\d+(\\.\\d+){3}' | head -n1`,
          },
          mergeOptions(cro, { dependsOn: [setHostname] }),
        ).stdout as Output<TailscaleIp>));

    this.dns = new StandardDns(name, { hostname: this.hostname, ipAddress, type: "A" }, args.globals, mergeOptions(cro, { dependsOn: [setHostname] }));

    this.device = runtime.isDryRun()
      ? (output(unknown) as ReturnType<typeof getDeviceOutput>)
      : getDeviceOutput(
          { name: tailscaleName },
          {
            provider: args.globals.tailscaleProvider,
            parent: this,
            dependsOn: [],
          },
        );

    new OnePasswordItem(
      `${args.host.name}-pbs`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: interpolate`Proxmox Backup Server LXC: ${args.host.title}`,
        tags: ["pbs", "lxc", "backup"],
        sections: {
          dns: createDnsSection(this.dns),
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: hostname },
              username: { type: TypeEnum.String, value: "root" },
              privateKey: { type: TypeEnum.Concealed, value: this.sshKey.privateKeyOpenssh },
              publicKey: { type: TypeEnum.String, value: this.sshKey.publicKeyOpenssh },
              fingerprint: { type: TypeEnum.String, value: this.sshKey.publicKeyFingerprintSha256 },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.ipAddress },
          webUrl: { type: TypeEnum.String, value: interpolate`https://${this.hostname}:8007` },
        },
      },
      mergeOptions(cro, { dependsOn: [] }),
    );
  }
}

export function getProxmoxBackupServerLxcProperties(instance: ProxmoxBackupServerLxc) {
  return output({
    hostname: instance.hostname,
    ipAddress: instance.ipAddress,
  });
}

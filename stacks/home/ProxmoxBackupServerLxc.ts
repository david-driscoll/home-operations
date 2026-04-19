import { FullItem } from "@1password/connect";
import { getTailscaleSection, clientIdPair, pushLxcDefinition } from "@components/helpers.ts";
import { getTailscaleClient, installTailscaleLxc } from "@components/tailscale.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { remote, types } from "@pulumi/command";
import { GetDeviceResult, getDeviceOutput } from "@pulumi/tailscale";
import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, log, mergeOptions, Output, output, Resource, runtime, unknown } from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import * as authentik from "@pulumi/authentik";
import { TailscaleIp } from "@openapi/tailscale-grants.js";
import { ClusterDefinition, GlobalResources } from "../../components/globals.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { createDnsSection, StandardDns } from "./StandardDns.ts";
import { getContainerHostnames } from "./helper.ts";
import { CommunityScriptLxcVars, runCommunityScriptLxc } from "./lxc.ts";
import { AuthentikOutputs } from "@components/authentik.ts";
import { ApplicationDefinitionSchema } from "@openapi/application-definition.js";
import { ApplicationCertificate } from "@components/authentik/application-certificate.ts";
import { DockgeLxc } from "./DockgeLxc.ts";
import { Tailscale } from "@components/constants.ts";

export interface ProxmoxBackupServerLxcArgs {
  globals: GlobalResources;
  outputs: AuthentikOutputs;
  /** Cluster definition used to derive the OIDC issuer URL and Traefik CNAME hostname. */
  cluster: Input<ClusterDefinition>;
  /** When provided, a Traefik dynamic config for PBS is written to this Dockge instance. */
  dockge: DockgeLxc;
  host: ProxmoxHost;
  vmId: number;
  ipAddress?: TailscaleIp;
  tailscaleArgs?: Partial<Parameters<typeof installTailscaleLxc>[0]["args"]>;
  lxcVars?: Partial<Omit<CommunityScriptLxcVars, "ctid" | "hostname">>;
  dependsOn?: Input<Resource>[];
}

export class ProxmoxBackupServerLxc extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly tailscaleHostname: Output<string>;
  public readonly dns: StandardDns;
  public readonly oidcClientId: Output<string>;
  public readonly oidcClientSecret: Output<string>;
  public readonly oidcIssuerUrl: Output<string>;
  private readonly mountPoints: remote.Command[] = [];
  private resources!: Input<Resource>[];
  private readonly lxcName: string;

  constructor(
    name: string,
    private readonly args: ProxmoxBackupServerLxcArgs,
    opts?: ComponentResourceOptions,
  ) {
    super("home:proxmox:ProxmoxBackupServerLxc", name, {}, mergeOptions(opts, { parent: args.host }));

    this.lxcName = name;

    const cro = { parent: this };
    const { hostname, tailscaleHostname, tailscaleName } = getContainerHostnames("pbs", args.host, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;

    const createPbsLxc = runCommunityScriptLxc(
      `${name}-create-pbs`,
      {
        connection: args.host.remoteConnection,
        script: "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/proxmox-backup-server.sh",
        vars: {
          ctid: args.vmId,
          hostname: name,
          unprivileged: 1,
          cpu: 2,
          ram: 2048,
          disk: 32,
          // os: "debian",
          // version: 13,
          ipv6_method: "none",
          mount_fs: "nfs",
          ...(args.ipAddress ? { net: `${args.ipAddress}/16`, gateway: "10.10.0.1" } : {}),
          ...(args.lxcVars ?? {}),
        } as CommunityScriptLxcVars,
      },
      cro,
    );

    this.resources = [createPbsLxc, ...(args.dependsOn ?? [])];

    const setHostname = new remote.Command(
      `${name}-set-hostname`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- hostnamectl set-hostname ${name}`,
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, ...(args.dependsOn ?? [])] }),
    );

    // Inline the post-install actions without whiptail / curl dependency:
    //  1. Fix Debian apt sources (auto-detects bookworm vs trixie)
    //  2. Disable pbs-enterprise repo, enable pbs-no-subscription
    //  3. Remove subscription nag
    //  4. apt update + dist-upgrade
    const postInstallScript = `set -euo pipefail
CODENAME="$(awk -F'=' '/^VERSION_CODENAME=/{print $2}' /etc/os-release)"
case "$CODENAME" in
bookworm)
  cat >/etc/apt/sources.list <<'__SOURCES__'
deb http://deb.debian.org/debian bookworm main contrib
deb http://deb.debian.org/debian bookworm-updates main contrib
deb http://security.debian.org/debian-security bookworm-security main contrib
__SOURCES__
  if [ -f /etc/apt/sources.list.d/pbs-enterprise.list ]; then
    sed -i 's/^deb /# deb /' /etc/apt/sources.list.d/pbs-enterprise.list
  else
    echo '# deb https://enterprise.proxmox.com/debian/pbs bookworm pbs-enterprise' >/etc/apt/sources.list.d/pbs-enterprise.list
  fi
  if ! grep -rq 'pbs-no-subscription' /etc/apt/sources.list.d/ 2>/dev/null; then
    echo 'deb http://download.proxmox.com/debian/pbs bookworm pbs-no-subscription' >/etc/apt/sources.list.d/pbs-install-repo.list
  fi
  ;;
trixie)
  rm -f /etc/apt/sources.list.d/*.list
  cat >/etc/apt/sources.list.d/debian.sources <<'__SOURCES__'
Types: deb
URIs: http://deb.debian.org/debian/
Suites: trixie trixie-updates
Components: main contrib non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: http://security.debian.org/debian-security/
Suites: trixie-security
Components: main contrib non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
__SOURCES__
  if [ -f /etc/apt/sources.list.d/pbs-enterprise.sources ]; then
    sed -i '/^Enabled:/d' /etc/apt/sources.list.d/pbs-enterprise.sources
    echo 'Enabled: false' >>/etc/apt/sources.list.d/pbs-enterprise.sources
  else
    cat >/etc/apt/sources.list.d/pbs-enterprise.sources <<'__SOURCES__'
Types: deb
URIs: https://enterprise.proxmox.com/debian/pbs
Suites: trixie
Components: pbs-enterprise
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
Enabled: false
__SOURCES__
  fi
  if ! grep -rq 'pbs-no-subscription' /etc/apt/sources.list.d/ 2>/dev/null; then
    cat >/etc/apt/sources.list.d/proxmox.sources <<'__SOURCES__'
Types: deb
URIs: http://download.proxmox.com/debian/pbs
Suites: trixie
Components: pbs-no-subscription
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
__SOURCES__
  fi
  ;;
*)
  echo "Unsupported PBS codename: $CODENAME" >&2; exit 1 ;;
esac

# Remove subscription nag
echo 'DPkg::Post-Invoke { "if [ -s /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js ] && ! grep -q -F NoMoreNagging /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js; then sed -i '"'"'/data\\.status/{s/\\!//;s/active/NoMoreNagging/}'"'"' /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js; fi"; };' >/etc/apt/apt.conf.d/no-nag-script
apt --reinstall install proxmox-widget-toolkit -y -q &>/dev/null || true

apt-get update -q
apt-get -y dist-upgrade -q
echo "PBS post-install complete"`;

    const postInstallRun = new remote.Command(
      `${name}-post-install`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- bash << '__POST_INSTALL__'\n${postInstallScript}\n__POST_INSTALL__`,
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, ...(args.dependsOn ?? [])] }),
    );

    const postInstallReboot = new remote.Command(
      `${name}-post-install-reboot`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct reboot ${args.vmId}`,
        triggers: [postInstallRun.id],
      },
      mergeOptions(cro, { dependsOn: [postInstallRun] }),
    );

    const cluster = output(args.cluster);
    const { clientId, clientSecret } = clientIdPair(name, { options: cro });
    const signingKey = new ApplicationCertificate(name, { globals: args.globals }, cro);
    const issuerUrl = cluster.apply((c) => `https://${c.authentikDomain}/application/o/${name}/`);
    const externalUrl = cluster.apply((c) => `https://pbs.${c.rootDomain}`);

    const deviceInfo = installTailscaleLxc({
      connection: args.host.remoteConnection,
      parent: this,
      name: tailscaleName,
      globals: args.globals,
      installTailscale: true,
      args: {
        ...args.tailscaleArgs,
        advertiseTags: (args.tailscaleArgs?.advertiseTags ?? []).concat([Tailscale.tag.apps, Tailscale.tag.backups]),
        acceptDns: true,
        acceptRoutes: false,
        ssh: true,
      },
      vmId: args.vmId,
      dependsOn: [setHostname, createPbsLxc, postInstallRun, postInstallReboot],
    });
    this.resources.push(deviceInfo);

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
    this.dns = new StandardDns(`${name}-external`, { hostname: externalHostname, ipAddress: args.dockge.tailscaleIpAddress, record: args.dockge.hostname, type: "CNAME" }, args.globals, cro);

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
        create: all([output(args.vmId), oidcScript]).apply(([vmId, script]) => `pct exec ${vmId} -- bash << '__PBS_OIDC__'\n${script.trim()}\n__PBS_OIDC__`),
        triggers: [clientId, issuerUrl],
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, ...(args.dependsOn ?? [])] }),
    );

    new OnePasswordItem(
      `${args.host.name}-pbs`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: interpolate`Proxmox Backup Server LXC: ${args.host.title}`,
        tags: ["pbs", "lxc", "backup"],
        sections: {
          // dns: createDnsSection(this.dns),
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: hostname },
              username: { type: TypeEnum.String, value: "root" },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          webUrl: { type: TypeEnum.String, value: interpolate`https://${this.hostname}:8007` },
        },
      },
      mergeOptions(cro, { dependsOn: [...(args.dependsOn ?? [])] }),
    );

    const definition = all([cluster, this.oidcClientId, this.oidcClientSecret]).apply(
      ([c, clientId, clientSecret]) =>
        ({
          apiVersion: "home.driscoll.tech/v1",
          kind: "ApplicationDefinition",
          metadata: { name: this.lxcName },
          spec: {
            name: `Proxmox Backup Server - ${c.title}`,
            slug: this.lxcName,
            category: c.title,
            url: `https://pbs.${c.rootDomain}`,
            authentik: {
              oauth2: {
                clientId,
                clientSecret,
                clientType: "confidential",
                allowedRedirectUris: [{ matching_mode: "regex", url: "https://.*\\?oidccode" }],
                includeClaimsInIdToken: true,
              },
            },
            gatus: [
              {
                name: `pbs-${c.key}`,
                url: `https://${c.rootDomain}/`,
                method: "GET",
                conditions: ["[STATUS] == 200"],
              },
            ],
          },
        }) as ApplicationDefinitionSchema,
    );

    pushLxcDefinition(`${this.lxcName}-app-def`, {
      definition,
      vmId: this.args.vmId,
      connection: this.args.host.remoteConnection,
      parent: this,
      dependsOn: [...this.resources],
    });
  }

  public addHostMount(path: string, containerPath?: string) {
    const mp = new remote.Command(
      `${this.args.host.name}-pbs-${path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-")}-mount`,
      {
        connection: this.args.host.remoteConnection,
        create: interpolate`pct set ${this.args.vmId} -mp${this.mountPoints.length} ${path},mp=${containerPath ?? path}`,
      },
      { parent: this, dependsOn: [...this.mountPoints, ...this.resources] },
    );
    this.mountPoints.push(mp);
    return mp;
  }
}

export function getProxmoxBackupServerLxcProperties(instance: ProxmoxBackupServerLxc) {
  return output({
    hostname: instance.hostname,
  });
}

import { FullItem } from "@1password/connect";
import { getTailscaleIp, installTailscaleLxc } from "@components/tailscale.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { remote, types } from "@pulumi/command";
import { all, asset, ComponentResource, ComponentResourceOptions, Input, interpolate, mergeOptions, Output, output, Resource } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as purrl from "@pulumiverse/purrl";
import * as random from "@pulumi/random";
import * as pbs from "@pulumi/pbs";
import { TailscaleIp } from "@openapi/tailscale-grants.js";
import { GlobalResources } from "./globals.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { StandardDns } from "./StandardDns.ts";
import { getContainerHostnames } from "./helpers.ts";
import { CommunityScriptLxcVars, runCommunityScriptLxc } from "./lxc.ts";
import { AuthentikOutputs } from "@components/authentik.ts";
import { getUsersOutput as getTailscaleUsersOutput } from "@pulumi/tailscale";
import { ApplicationCertificate } from "@components/authentik/application-certificate.ts";
import { DockgeLxc } from "./DockgeLxc.ts";
import { Tailscale } from "@components/constants.ts";
import { PrivateKey } from "@pulumi/tls";
import { ClusterDefinition, Meta } from "./store/index.ts";

export interface ProxmoxBackupServerLxcArgs {
  globals: GlobalResources;
  outputs: Input<AuthentikOutputs>;
  /** Cluster definition used to derive the OIDC issuer URL and Traefik CNAME hostname. */
  cluster: Input<ClusterDefinition & Meta>;
  /** When provided, a Traefik dynamic config for PBS is written to this Dockge instance. */
  dockge: DockgeLxc;
  host: ProxmoxHost;
  vmId: Input<number>;
  ipAddress?: TailscaleIp;
  tailscaleArgs?: Partial<Parameters<typeof installTailscaleLxc>[0]["args"]>;
  lxcVars?: Partial<Omit<CommunityScriptLxcVars, "ctid" | "hostname">>;
  dependsOn?: Input<Resource>[];
  tags: Input<string[]>;
}

export class ProxmoxBackupServerLxc extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly tailscaleHostname: Output<string>;
  public readonly dns: Output<StandardDns>;

  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly tailscaleName: Output<string>;
  public readonly tailscaleIpAddress: Output<string>;
  private readonly mountPoints: remote.Command[] = [];
  private resources!: Input<Resource>[];
  private readonly lxcName: string;
  public readonly provider: pbs.Provider;

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
    this.tailscaleName = tailscaleName;

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
        update: interpolate`pct exec ${args.vmId} -- hostnamectl set-hostname ${name}`,
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
    const signingKey = new ApplicationCertificate(name, { globals: args.globals }, cro);
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
    this.resources.push(deviceInfo.apply((z) => z.resource));

    const externalHostname = externalUrl.apply((u) => new URL(u).hostname);
    const { dns } = args.dockge.registerExternalService(
      {
        name,
        hostname: externalHostname,
        backend: interpolate`https://${tailscaleHostname}:8007`,
      },
      [],
    );

    this.dns = dns;

    this.remoteConnection = {
      host: tailscaleHostname,
      user: "root",
    };

    const oidc = all([cluster])
      .apply(([c]) =>
        args.host.applicationManager.createApplication(
          output({
            apiVersion: "home.driscoll.tech/v1",
            kind: "ApplicationDefinition",
            metadata: { name: `pbs` },
            spec: {
              name: interpolate`${c.title} PBS`,
              // slug: this.lxcName,
              icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/proxmox-light.svg",
              category: c.title,
              url: interpolate`https://pbs.${c.rootDomain}`,
              authentik: {
                oauth2: {
                  clientType: "confidential",
                  allowedRedirectUris: [{ matching_mode: "strict", url: interpolate`https://pbs.${c.rootDomain}` }],
                  includeClaimsInIdToken: true,
                  propertyMappings: ["proxmox_groups", "openid", "email", "profile"],
                },
              },
              gatus: [
                {
                  name: interpolate`${c.key}-pbs`,
                  url: interpolate`https://pbs.${c.rootDomain}/`,
                  method: "GET",
                  conditions: ["[STATUS] == 200"],
                },
              ],
            },
          }),
        ),
      )
      .apply((a) => {
        if (!(a.provider && !a.isProxy)) {
          throw new Error("Failed to create OIDC application in Authentik");
        }
        return a;
      })!;
    const rootPassword = new random.RandomPassword(`${name}-root-password`, { length: 64, special: true }, cro);
    new remote.Command(
      `${name}-set-root-password`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`echo 'root:${rootPassword.result}' | pct exec ${args.vmId} -- chpasswd`,
        update: interpolate`echo 'root:${rootPassword.result}' | pct exec ${args.vmId} -- chpasswd`,
        triggers: [rootPassword.result],
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, ...(args.dependsOn ?? [])] }),
    );

    const realmId = "authentik";
    const oidcScript = interpolate`
REALM_ID="${realmId}"
ISSUER_URL="${oidc.config.issuerUrl}"
CLIENT_ID="${oidc.clientId}"
CLIENT_SECRET="${oidc.clientSecret}"

if proxmox-backup-manager openid list 2>/dev/null | grep -q "\\"$REALM_ID\\""; then
  proxmox-backup-manager openid update "$REALM_ID" \\
    --issuer-url "$ISSUER_URL" \\
    --client-id "$CLIENT_ID" \\
    --client-key "$CLIENT_SECRET" \\
    --username-claim email \\
    --scopes "openid,email,profile"
else
  proxmox-backup-manager openid create "$REALM_ID" \\
    --issuer-url "$ISSUER_URL" \\
    --client-id "$CLIENT_ID" \\
    --client-key "$CLIENT_SECRET" \\
    --username-claim email \\
    --scopes "openid,email,profile" \\
    --autocreate true
fi
echo "PBS OIDC configured for realm: $REALM_ID"
`;
    new remote.Command(
      `${name}-configure-oidc`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- bash << '__PBS_OIDC__'\n${oidcScript}\n__PBS_OIDC__`,
        delete: interpolate`pct exec ${args.vmId} -- proxmox-backup-manager openid delete ${realmId}`,
        triggers: [oidc.clientId, oidc.clientSecret, oidc.config.issuerUrl],
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, ...(args.dependsOn ?? [])] }),
    );

    // TSIDP (Tailscale Identity Provider) as a backup OIDC realm for PBS
    const tsidpClientId = pulumi.interpolate`pbs-${args.globals.tailscaleDomain}`;
    const tsidpClientSecret = new random.RandomPassword(`${name}-tsidp-client-secret`, { length: 32, special: false }, cro);
    const tsidpDcr = new purrl.Purrl(
      `${name}-tsidp-dcr`,
      {
        name: `PBS TSIDP Dynamic Client Registration`,
        responseCodes: ["201"],
        url: pulumi.interpolate`https://idp.${args.globals.tailscaleDomain}/register`,
        method: "POST",
        body: pulumi.jsonStringify({
          client_name: pulumi.interpolate`Proxmox Backup Server (${cluster.apply((c) => c.title)})`,
          client_id: tsidpClientId,
          client_secret: tsidpClientSecret.result,
          redirect_uris: [interpolate`https://pbs.${cluster.rootDomain}`, interpolate`https://pbs.${args.globals.tailscaleDomain}`],
        }),
        headers: { "Content-Type": "application/json" },
      },
      cro,
    );

    const tsidpRealm = "tsidp";
    const tsidpScript = pulumi.interpolate`
REALM_ID="${tsidpRealm}"
ISSUER_URL="https://idp.${args.globals.tailscaleDomain}"
CLIENT_ID="${tsidpClientId}"
CLIENT_SECRET="${tsidpClientSecret.result}"

if proxmox-backup-manager openid list 2>/dev/null | grep -q "\\"$REALM_ID\\""; then
  proxmox-backup-manager openid update "$REALM_ID" \\
    --issuer-url "$ISSUER_URL" \\
    --client-id "$CLIENT_ID" \\
    --client-key "$CLIENT_SECRET" \\
    --username-claim email \\
    --scopes "openid,email,profile"
else
  proxmox-backup-manager openid create "$REALM_ID" \\
    --issuer-url "$ISSUER_URL" \\
    --client-id "$CLIENT_ID" \\
    --client-key "$CLIENT_SECRET" \\
    --username-claim email \\
    --scopes "openid,email,profile" \\
    --autocreate true
fi
echo "PBS TSIDP realm configured"
`;
    new remote.Command(
      `${name}-configure-tsidp`,
      {
        connection: args.host.remoteConnection,
        create: interpolate`pct exec ${args.vmId} -- bash << '__PBS_TSIDP__'\n${tsidpScript}\n__PBS_TSIDP__`,
        delete: interpolate`pct exec ${args.vmId} -- proxmox-backup-manager openid delete ${tsidpRealm}`,
        triggers: [tsidpClientSecret.result],
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, tsidpDcr, ...(args.dependsOn ?? [])] }),
    );

    // Pre-create PBS groups with ACLs.
    // PBS does not support groups-claim in OIDC, so groups must be configured manually.
    // New OIDC users start with no permissions until an admin adds them to a group.
    // Pre-populate the admins group with current Tailscale admin users so they have
    // access immediately without waiting for a manual group assignment.
    // NOTE: Authentik admin pre-population is omitted — terraform-provider-authentik
    // v2026.2.0 has a bug in dataSourceUsersRead (groupsByNames causes a Go panic).
    const tailscaleAdmins = getTailscaleUsersOutput({ role: "admin" }, { provider: args.globals.tailscaleProvider, parent: this });
    const groupsScript = all([output(args.vmId), tailscaleAdmins]).apply(([vmId, tsAdmins]) => {
      const tsidpEntries = tsAdmins
        .users!.map((u) => {
          const userId = `${u.loginName}@tsidp`;
          return [`proxmox-backup-manager user create "${userId}" 2>/dev/null || true`, `proxmox-backup-manager user modify "${userId}" --groups admins 2>/dev/null || true`].join("\n");
        })
        .join("\n");

      return `pct exec ${vmId} -- bash << '__PBS_GROUPS__'
# Create groups (idempotent)
proxmox-backup-manager group create admins --comment "Administrators" 2>/dev/null || true
proxmox-backup-manager group create users --comment "Read-only users" 2>/dev/null || true

# Assign ACLs at root path
proxmox-backup-manager acl update / --group admins --role Admin 2>/dev/null || true
proxmox-backup-manager acl update / --group users  --role Audit 2>/dev/null || true

# Pre-populate admins group with current Tailscale admin users
${tsidpEntries}
echo "PBS groups, ACLs, and admin users configured"
__PBS_GROUPS__`;
    });
    new remote.Command(
      `${name}-configure-groups`,
      {
        connection: args.host.remoteConnection,
        create: groupsScript,
        update: groupsScript,
        triggers: [groupsScript],
      },
      mergeOptions(cro, { dependsOn: [createPbsLxc, ...(args.dependsOn ?? [])] }),
    );

    // Install jq
    const installJq = new remote.Command(
      `${name}-install-jq`,
      {
        connection: args.host.remoteConnection,
        create: "command -v jq >/dev/null 2>&1 || apt-get install -y jq restic rclone",
      },
      mergeOptions(cro, { dependsOn: [] }),
    );

    // Copy Tailscale cron script
    const tailscaleCron = new remote.CopyToRemote(
      `${name}-tailscale-cron`,
      {
        connection: { host: tailscaleHostname, user: "root" },
        remotePath: "/etc/cron.weekly/tailscale",
        source: new asset.FileAsset("scripts/tailscale-pbs.sh"),
      },
      mergeOptions(cro, { dependsOn: [...this.resources, installJq] }),
    );
    // Set executable permissions and run cron script
    const tailscaleSetCert = new remote.Command(
      `${name}-install-set`,
      {
        connection: { host: tailscaleHostname, user: "root" },
        create: "chmod 755 /etc/cron.weekly/tailscale && /etc/cron.weekly/tailscale",
      },
      mergeOptions(cro, { dependsOn: [tailscaleCron] }),
    );
    this.resources.push(tailscaleCron);
    this.resources.push(tailscaleSetCert);

    const backrestPrivateKey = new PrivateKey(`${name}-backrest-private-key`, { algorithm: "ED25519" }, cro);

    new OnePasswordItem(
      `${args.host.name}-pbs`,
      {
        category: FullItem.CategoryEnum.Login,
        urls: output([{ href: externalUrl }, { href: interpolate`https://${name}.${args.globals.tailscaleDomain}` }, { href: interpolate`https://${this.tailscaleHostname}:8007` }]),
        title: interpolate`Proxmox Backup Server LXC: ${args.host.title}`,
        tags: output(args.tags).apply((tags) => [...tags, "pbs", "lxc", "backup"]),
        sections: {
          // dns: createDnsSection(this.dns),
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: this.tailscaleHostname },
              username: { type: TypeEnum.String, value: "root" },
              password: { type: TypeEnum.Concealed, value: rootPassword.result },
            },
          },
          backrest: {
            fields: {
              publicKey: { type: TypeEnum.Concealed, value: backrestPrivateKey.publicKeyPem },
              privateKey: { type: TypeEnum.Concealed, value: backrestPrivateKey.privateKeyPem },
              privateKeyId: { type: TypeEnum.String, value: backrestPrivateKey.id },
            },
          },
        },
        fields: {
          name: { type: TypeEnum.String, value: name },
          username: { type: TypeEnum.String, value: "root" },
          password: { type: TypeEnum.Concealed, value: rootPassword.result },
          cluster: { type: TypeEnum.String, value: cluster.meta.title },
          dockge: { type: TypeEnum.String, value: interpolate`DockgeLxc: ${args.dockge.cluster.title}` },
          hostname: { type: TypeEnum.String, value: this.tailscaleHostname },
          webUrl: { type: TypeEnum.String, value: interpolate`https://${name}.${args.globals.tailscaleDomain}` },
        },
      },
      mergeOptions(cro, { dependsOn: [...(args.dependsOn ?? [])] }),
    );

    this.tailscaleIpAddress = deviceInfo.deviceInfo.addresses.apply((z) => z[0]);
    this.provider = new pbs.Provider(
      `${name}-provider`,
      {
        username: `root@pam`,
        password: rootPassword.result,
        endpoint: interpolate`https://${tailscaleHostname}:8007`,
        insecure: true,
      },
      { parent: this, dependsOn: [createPbsLxc, postInstallRun, postInstallReboot] },
    );
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

  public addDatastore(args: { name: string; path: string; comment: string }) {
    const folder = new remote.Command(
      `${args.name}-backrest-config`,
      {
        connection: this.args.host.remoteConnection,
        create: interpolate`mkdir -p "${args.path}" && chown 165534:165534 "${args.path}"`,
      },
      {
        parent: this,
        dependsOn: [...this.mountPoints, ...this.resources],
      },
    );
    return new pbs.Datastore(
      `${this.lxcName}-${args.name}`,
      {
        name: args.name,
        comment: args.comment,
        path: args.path,
        gcSchedule: "weekly",
      },
      { parent: this, provider: this.provider, dependsOn: [folder, ...this.mountPoints, ...this.resources] },
    );
  }
}

export function getProxmoxBackupServerLxcProperties(instance: ProxmoxBackupServerLxc) {
  return output({
    hostname: instance.hostname,
  });
}

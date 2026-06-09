import { ComponentResource, ComponentResourceOptions, Input, Output, mergeOptions, interpolate, output, asset } from "@pulumi/pulumi";
import proxmox, { Provider as ProxmoxVEProvider } from "@muhlba91/pulumi-proxmoxve";
import { remote, types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as purrl from "@pulumiverse/purrl";
import { GlobalResources } from "./globals.ts";
import { createPeerRelayRule, updateTailscaleProxmox } from "./tailscale.ts";
import { OPClient } from "./op.ts";
import { clientIdPair, getHostnames } from "./helpers.ts";
import { createDnsSection, StandardDns } from "./StandardDns.ts";
import * as yaml from "yaml";
import type { TruenasVm } from "./TruenasVm.ts";
import { addUptimeGatus, copyFileToRemote, getTailscaleSection } from "@components/helpers.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { TailscaleCidr, TailscaleIp, TailscaleTags } from "@openapi/tailscale-grants.js";
import { Tailscale } from "@components/constants.ts";
import { AuthentikApplicationManager, AuthentikOutputs } from "@components/authentik.ts";
import { GatusDefinition } from "@openapi/application-definition.js";
import { getProviderOauth2ConfigOutput, ProviderOauth2 } from "@pulumi/authentik";
import { ClusterDefinition, CredentialDefinition } from "./store/index.ts";

export type OPClientItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;

export interface ProxmoxHostArgs {
  title?: Input<string>;
  globals: GlobalResources;
  proxmox: Input<CredentialDefinition & { arch: string }>;
  tailscaleIpAddress: TailscaleIp;
  tailscaleTags?: TailscaleTags[];
  tailscaleSubnetRoutes: TailscaleCidr[];
  remote: boolean;
  internalIpAddress?: TailscaleIp;
  installTailscale?: boolean;
  truenas?: TruenasVm;
  cluster: Input<ClusterDefinition>;
  shortName?: string;
  peerRelay?: "unifi" | boolean;
  tailscaleArgs?: Partial<Parameters<typeof updateTailscaleProxmox>[0]["args"]>;
  authentikOutputs: Input<AuthentikOutputs>;
  vmIdRange: { start: number; end: number };
}

export class ProxmoxHost extends ComponentResource {
  public readonly name: string;
  public readonly internalIpAddress: TailscaleIp;
  public readonly tailscaleIpAddress: TailscaleIp;
  public readonly pveProvider: ProxmoxVEProvider;
  public readonly backupVolumes?: Output<pulumi.Unwrap<ReturnType<TruenasVm["addClusterBackup"]>>>;
  public readonly tailscaleHostname: Output<string>;
  public readonly tailscaleName: Output<string>;
  public readonly hostname: Output<string>;
  public readonly arch: Output<string>;
  public readonly remote: boolean;
  public readonly dns: Output<StandardDns>;
  public readonly cluster: Output<ClusterDefinition>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly title: Output<string>;
  public readonly shortName?: string;
  public readonly applicationManager: AuthentikApplicationManager;
  public readonly vmIdRange: { randomVmIds: true; randomVmIdStart: number; randomVmIdEnd: number };
  constructor(
    name: string,
    private args: ProxmoxHostArgs,
    opts?: ComponentResourceOptions,
  ) {
    super("home:proxmox:ProxmoxHost", name, opts);

    this.name = name;
    const cluster = output(args.cluster);
    this.cluster = cluster;
    this.title = output(args.title ?? cluster.title);
    if (args.remote) {
      this.internalIpAddress = args.tailscaleIpAddress;
    } else {
      if (args.internalIpAddress === undefined) {
        throw new Error("internalIpAddress must be provided for non-remote Proxmox hosts");
      }
      this.internalIpAddress = args.internalIpAddress;
    }
    this.tailscaleIpAddress = args.tailscaleIpAddress;
    this.remote = args.remote;
    this.shortName = args.shortName;

    const { hostname, tailscaleHostname } = getHostnames(name, args.globals);
    this.hostname = hostname;
    this.tailscaleHostname = tailscaleHostname;
    this.tailscaleName = output(name);

    const cro = { parent: this };
    args.installTailscale ??= true;

    const apiCredential = output(args.proxmox);
    this.arch = apiCredential.apply((z) => z.arch);

    this.dns = this.hostname.apply((g) => {
      return StandardDns.create(`${name}-dns`, { hostname: g, ipAddress: output(this.internalIpAddress), type: "A" }, args.globals, cro);
    });

    this.vmIdRange = {
      randomVmIds: true,
      randomVmIdStart: args.vmIdRange.start,
      randomVmIdEnd: args.vmIdRange.end,
    };
    // Create ProxmoxVE Provider
    this.pveProvider = new ProxmoxVEProvider(
      `${name}-pve-provider`,
      {
        ...this.vmIdRange,
        endpoint: interpolate`https://${this.tailscaleHostname}:8006/`,
        apiToken: interpolate`${apiCredential.apply((z) => z.username)}=${apiCredential.apply((z) => z.credential)}`,
        ssh: {
          username: "root",
          password: args.globals.proxmoxCredential.password,
        },
      },
      cro,
    );

    if (args.truenas) {
      this.backupVolumes = pulumi.output(args.truenas.addClusterBackup(name, this));
    }

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.tailscaleHostname,
      user: args.globals.proxmoxCredential.username,
      password: args.globals.proxmoxCredential.password,
    });

    if (args.installTailscale) {
      const snippetsCommand = new remote.Command(
        `${name}-snippets`,
        {
          connection,
          create: `pvesm set local --content images,rootdir,vztmpl,backup,iso,snippets`,
        },
        cro,
      );

      updateTailscaleProxmox({
        connection,
        parent: this,
        name: this.tailscaleName,
        ipAddress: this.tailscaleIpAddress,
        globals: args.globals,
        dependsOn: [],
        args: {
          advertiseTags: [Tailscale.tag.proxmox, Tailscale.tag.exitNode, ...(args.peerRelay ? [Tailscale.tag.peerRelay] : [])].concat(args.tailscaleTags ?? []),
          acceptDns: false,
          acceptRoutes: false,
          ssh: true,
          relayServerPort:
            args.peerRelay === "unifi"
              ? createPeerRelayRule(this.internalIpAddress, args.globals).result
              : args.peerRelay
                ? new random.RandomInteger(`tailscale-relay-port-${this.internalIpAddress}`, { min: 40000, max: 60000 }).result
                : undefined,
          advertiseRoutes: args.tailscaleSubnetRoutes,
          exitNodeAllowLanAccess: true,
          ...args.tailscaleArgs,
        },
      });
      // Configure SSH environment

      // Install jq
      const installJq = new remote.Command(
        `${name}-install-jq`,
        {
          connection: connection,
          create: interpolate`apt-get update && apt-get install -y jq restic rclone speedometer`,
        },
        mergeOptions(cro, { dependsOn: [] }),
      );

      // Copy Tailscale cron script
      const tailscaleCron = new remote.CopyToRemote(
        `${name}-tailscale-cron`,
        {
          connection: connection,
          remotePath: "/etc/cron.weekly/tailscale",
          source: new asset.FileAsset("scripts/tailscale.sh"),
        },
        mergeOptions(cro, { dependsOn: [installJq] }),
      );

      // Set executable permissions and run cron script
      const tailscaleSetCert = new remote.Command(
        `${name}-install-set`,
        {
          connection: connection,
          create: "chmod 755 /etc/cron.weekly/tailscale && /etc/cron.weekly/tailscale",
        },
        mergeOptions(cro, { dependsOn: [tailscaleCron] }),
      );

      // Install Alloy on this Proxmox host for metrics and log forwarding
      const installAlloy = new remote.Command(
        `${name}-install-alloy`,
        {
          connection,
          create: [
            "mkdir -p /etc/apt/keyrings",
            "wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor > /etc/apt/keyrings/grafana.gpg",
            'echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" | tee /etc/apt/sources.list.d/grafana.list',
            "apt-get update -qq",
            "apt-get install -y alloy",
          ].join(" && "),
        },
        mergeOptions(cro, { dependsOn: [tailscaleSetCert] }),
      );

      const alloyConfig = interpolate`logging {
  level  = "warn"
  format = "logfmt"
}

// Systemd journal logs → Loki
loki.source.journal "default" {
  forward_to = [loki.write.default.receiver]
  labels = {
    cluster     = "${cluster.apply((c) => c.key)}",
    environment = "homelab",
    region      = "home",
    hostname    = "${name}",
    job         = "proxmox/journal",
  }
}

loki.write "default" {
  endpoint {
    url = "http://loki.${args.globals.tailscaleDomain}:3100/loki/api/v1/push"
  }
}

// Host metrics via built-in node_exporter → Thanos
prometheus.exporter.unix "node" {}

prometheus.scrape "node" {
  targets    = prometheus.exporter.unix.node.targets
  forward_to = [prometheus.remote_write.thanos.receiver]
}

prometheus.remote_write "thanos" {
  endpoint {
    url = "http://thanos-receive.${args.globals.tailscaleDomain}:19291/api/v1/receive"
    queue_config {
      max_samples_per_send = 10000
    }
  }
  external_labels = {
    cluster     = "${cluster.apply((c) => c.key)}",
    environment = "homelab",
    region      = "home",
    hostname    = "${name}",
  }
}
`;

      const copyAlloyConfig = copyFileToRemote(`${name}-alloy-config`, {
        connection,
        remotePath: "/etc/alloy/config.alloy",
        dependsOn: [installAlloy],
        content: alloyConfig,
        triggers: [alloyConfig],
        parent: this,
      });

      new remote.Command(
        `${name}-enable-alloy`,
        {
          connection,
          create: "systemctl enable alloy && systemctl restart alloy",
        },
        mergeOptions(cro, { dependsOn: [copyAlloyConfig] }),
      );
    }
    const proxmoxInfo = new OnePasswordItem(
      `${this.name}-proxmox`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: pulumi.interpolate`ProxmoxHost: ${this.title}`,
        tags: ["proxmox", "host"],
        sections: {
          tailscale: getTailscaleSection(this),
          // dns: createDnsSection(this.dns),
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: this.tailscaleHostname },
              username: { type: TypeEnum.String, value: args.globals.proxmoxCredential.username },
              password: { type: TypeEnum.Concealed, value: args.globals.proxmoxCredential.password },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.internalIpAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      cro,
    );

    this.applicationManager = new AuthentikApplicationManager({
      globals: args.globals,
      clusterKey: name,
      outputs: args.authentikOutputs,
      cluster: cluster,
      loadFromResource(application, kind, { name }) {
        throw new Error("Not implemented");
      },
    });

    cluster.apply((clusterDefinition) => {
      // Register Proxmox VE as a native Authentik OAuth2 OIDC application.
      // This replaces the previous forward-proxy registration.
      const pveRedirectUri = interpolate`https://${this.tailscaleHostname}:8006/`;
      // PVE sends whatever URL the user accessed it from as redirect_uri (no override possible).
      // Include both the Tailscale direct URL and the external Traefik-proxied URL.
      const pveExternalUri = `https://pve.${clusterDefinition.rootDomain}`;
      const oidcApp = this.applicationManager.createApplication(
        output({
          metadata: { name: `pve-${clusterDefinition.key}`, namespace: clusterDefinition.key },
          spec: {
            name: interpolate`${this.title} Proxmox VE`,
            category: clusterDefinition.title,
            description: interpolate`Proxmox Virtual Environment for ${clusterDefinition.title}`,
            url: interpolate`https://${this.tailscaleHostname}:8006/`,
            icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/proxmox.svg",
            authentik: {
              oauth2: {
                clientType: "confidential",
                allowedRedirectUris: [
                  { matching_mode: "strict", url: pveRedirectUri },
                  { matching_mode: "strict", url: pveExternalUri },
                ],
                includeClaimsInIdToken: true,
                propertyMappings: ["proxmox_groups", "openid", "email", "profile"],
              },
            },
            gatus: [
              {
                name: interpolate`${this.title} Proxmox VE`,
                url: interpolate`https://${this.tailscaleHostname}:8006/`,
                method: "GET",
                conditions: ["[STATUS] == 200"],
              },
            ],
          },
        }),
      );

      // TSIDP (Tailscale Identity Provider) as a backup OIDC realm for PVE
      const tsidpClient = clientIdPair(`${name}-tsidp`, { options: { parent: this } });
      const tsidpDcr = new purrl.Purrl(
        `${name}-pve-tsidp-dcr`,
        {
          name: `PVE TSIDP Dynamic Client Registration`,
          responseCodes: ["201"],
          url: interpolate`https://idp.${args.globals.tailscaleDomain}/register`,
          method: "POST",
          body: pulumi.jsonStringify({
            client_name: `Proxmox VE (${clusterDefinition.title})`,
            client_id: tsidpClient.clientId,
            client_secret: tsidpClient.clientSecret,
            redirect_uris: [pveRedirectUri, pveExternalUri],
          }),
          headers: { "Content-Type": "application/json" },
        },
        { parent: this },
      );

      const appProvider: Output<ProviderOauth2> = oidcApp.apply((a) => a.provider! as unknown as ProviderOauth2);
      const providerConfig = getProviderOauth2ConfigOutput({ name: appProvider.name }, { parent: this });

      const realmScript = interpolate`
AUTHENTIK_ISSUER="${providerConfig.issuerUrl}"
AUTHENTIK_CLIENT_ID="${appProvider.clientId}"
AUTHENTIK_CLIENT_SECRET="${appProvider.clientSecret}"
TSIDP_CLIENT_ID="${tsidpClient.clientId}"
TSIDP_CLIENT_SECRET="${tsidpClient.clientSecret}"
TSIDP_ISSUER="https://idp.${args.globals.tailscaleDomain}"

configure_realm() {
  local realm="$1"
  local issuer="$2"
  local client_id="$3"
  local client_key="$4"
  local comment="$5"

  if pveum realm list --output-format json 2>/dev/null | grep -q "\\"$realm\\""; then
    pveum realm modify "$realm" \\
      --issuer-url "$issuer" \\
      --client-id "$client_id" \\
      --client-key "$client_key" \\
      --username-claim email \\
      --scopes "openid email profile" \\
      --groups-claim groups \\
      --groups-autocreate 1 \\
      --groups-overwrite 1
  else
    pveum realm add "$realm" --type openid \\
      --issuer-url "$issuer" \\
      --client-id "$client_id" \\
      --client-key "$client_key" \\
      --username-claim email \\
      --scopes "openid email profile" \\
      --groups-claim groups \\
      --groups-autocreate 1 \\
      --groups-overwrite 1 \\
      --autocreate 1 \\
      --comment "$comment"
  fi
}

configure_realm "authentik" "$AUTHENTIK_ISSUER" "$AUTHENTIK_CLIENT_ID" "$AUTHENTIK_CLIENT_SECRET" "Authentik SSO"
configure_realm "tsidp"     "$TSIDP_ISSUER"     "$TSIDP_CLIENT_ID"     "$TSIDP_CLIENT_SECRET"     "Tailscale TSIDP (backup)"

# Create groups and assign ACLs (idempotent; PVE appends -<realmid> suffix to OIDC group names)
for grp in admins-authentik users-authentik admins-tsidp users-tsidp; do
  pveum group add "$grp" 2>/dev/null || true
done

pveum acl modify / --groups admins-authentik --roles Administrator --propagate 1
pveum acl modify / --groups users-authentik  --roles PVEAuditor    --propagate 1
pveum acl modify / --groups admins-tsidp     --roles Administrator --propagate 1
pveum acl modify / --groups users-tsidp      --roles PVEAuditor    --propagate 1

echo "PVE OIDC realms, groups, and ACLs configured"
`;
      new remote.Command(
        `${name}-configure-pve-oidc`,
        {
          connection: this.remoteConnection,
          create: realmScript,
          triggers: [appProvider.clientId, appProvider.clientSecret, providerConfig.issuerUrl, tsidpClient.clientSecret],
        },
        { parent: this, dependsOn: [tsidpDcr] },
      );
    });
  }

  public addNfsMount(hostname: Input<string>, remotePath: string) {
    const resourceName = `${this.name}-${remotePath.substring(1).replace(/\//g, "-")}nfs`;
    return resourceName;
    // fails with provider for now, the items get created, but seems to be a serialization issue.
    // return new proxmox.storage.Nfs(
    //   resourceName,
    //   {
    //     server: hostname,
    //     export: remotePath,
    //     resourceId: resourceName,
    //     contents: ["rootdir"],
    //     options: "rw,nfsvers=4",
    //     nodes: [this.name],
    //   },
    //   {
    //     import: resourceName,
    //     parent: this,
    //     provider: this.pveProvider,
    //   },
    // );
  }
  public addUptimeGatus() {
    return addUptimeGatus(
      `proxmox-host-${this.name}`,
      this.args.globals,
      {
        endpoints: pulumi
          .output(this.applicationManager.applications)
          .apply((apps) => {
            apps.forEach((app) => pulumi.log.info(`Adding Gatus endpoints for application ${app.definition.spec.name} in cluster ${app.definition.spec.category}`, this));
            return apps;
          })
          .apply((instances) => instances.flatMap((z) => z.gatus).map((e) => yaml.parse(yaml.stringify(e, { lineWidth: 0 })) as GatusDefinition)),
      },
      this.applicationManager,
    );
  }
}

export function getProxmoxProperties(instance: ProxmoxHost) {
  return {
    tailscale: {
      ipAddress: instance.tailscaleIpAddress,
      hostname: instance.tailscaleHostname,
    },
    name: instance.name,
    hostname: instance.hostname,
    ipAddress: instance.internalIpAddress,
    remoteConnection: instance.remoteConnection!,
  };
}

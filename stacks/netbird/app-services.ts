/**
 * Section 11 of stacks/netbird: every tailnet app's NetBird twin,
 * `<host>.app.<root domain>` (docs/plans/netbird-mirror.md §N). apps.ts holds
 * the pure half and the picture; this declares:
 *
 *   1. the public DNS NetBird's custom-domain check needs: `*.app` and
 *      `validation.app`, CNAMEs to the proxy's cluster address. Cloudflare
 *      only and grey, like netbird-edge's names: Technitium's <root domain>
 *      zone forwards anything it has no override for, and NetBird peers get
 *      their records from management (private-service zones), not from here;
 *   2. `app.<root domain>` as a custom domain on that cluster;
 *   3. one private service per tailnet app, open to the groups its
 *      definition.yaml names, pointed at Traefik's netbird door;
 *   4. the `*.app` certificate's copy in OpenBao, for other hosts.
 *
 * DISCOVERY IS LIVE, like this stack's reads of NetBird itself: the tailnet
 * Ingresses in `network` and every ApplicationDefinition, from the Kubernetes
 * API (the Stack's ServiceAccount, kubernetes/apps/pulumi/netbird/rbac.yaml;
 * locally, the tailnet kubeproxy, as stacks/system reads them). That is what
 * Flux actually applied, with TAILSCALE_HOST and the definitions' variables
 * already substituted, so nothing here re-implements Flux's substitution or
 * keeps a list. A new app shows up on the next run (the Stack resyncs hourly),
 * and a removed one's service goes with it.
 *
 * As with nbidp (index.ts §10), management takes a domain and a service only
 * while the proxy is connected, so both wait for it; once they exist they stay
 * declared through a proxy restart.
 */
import { existsSync } from "node:fs";
import * as kubernetes from "@kubernetes/client-node";
import * as cloudflare from "@pulumi/cloudflare";
import * as netbird from "@pulumi/netbird";
import * as pulumi from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import type { GlobalResources, NetbirdApiCredential } from "components/globals.ts";
import { generateTailscaleKubeConfig } from "components/store/index.ts";
import { NetbirdPrivateService } from "dynamic/netbird/NetbirdPrivateService.ts";
import { appAccessGroups, appDomain, appHost, appServiceReady, appServiceRequest, definitionFor, type LiveDefinition, type LiveDomain, type LiveIngress, liveCustomDomain, tailnetApps } from "./apps.ts";
import type { LiveCluster, LiveService } from "./nbidp.ts";

/** kubernetes/apps/netbird-system/nbidp/app-wildcard-certificate.yaml's Secret. */
const WILDCARD_SECRET = { namespace: "netbird-system", name: "netbird-app-wildcard-tls" } as const;
/** Where other hosts read the `*.app` certificate (`secrets` mount). */
export const APP_WILDCARD_BAO_PATH = "apps/netbird/app-wildcard-tls";

const SERVICE_ACCOUNT_TOKEN = "/var/run/secrets/kubernetes.io/serviceaccount/token";

export interface AppServicesArgs {
  globals: GlobalResources;
  api: NetbirdApiCredential;
  /** globals.netbirdProvider. */
  provider: netbird.Provider;
  /** Every user group this stack creates, name to id. */
  userGroupIds: Record<string, pulumi.Input<string>>;
  /** The proxy's cluster address, `nbidp.<root domain>` (NB_PROXY_DOMAIN). */
  clusterAddress: string;
  root: string;
  dependsOn: pulumi.Resource[];
}

export function declareAppServices(args: AppServicesArgs): void {
  const { globals, clusterAddress, root } = args;
  const domain = appDomain(root);

  // ── 1. Public DNS ──────────────────────────────────────────────────────
  // zoneId as in StandardDns: it arrives as a secret and reads back plain.
  const cname = (name: string, recordName: string, comment: string) =>
    new cloudflare.DnsRecord(
      name,
      { zoneId: globals.cloudflareCredential.zoneId, name: recordName, type: "CNAME", content: clusterAddress, ttl: 300, proxied: false, comment },
      { provider: globals.cloudflareProvider, ignoreChanges: ["zoneId"] },
    );
  const records = [
    cname("netbird-app-wildcard", `*.${domain}`, "stacks/netbird: NetBird app names, on the nbidp proxy cluster"),
    // The wildcard covers it too; spelled out because it is what management checks.
    cname("netbird-app-validation", `validation.${domain}`, "stacks/netbird: NetBird custom-domain validation for the app names"),
  ];

  // ── 2-3. Custom domain and services ─────────────────────────────────────
  pulumi.all([args.api.managementUrl, args.api.token, pulumi.output(args.userGroupIds)]).apply(async ([managementUrl, token, groupIds]) => {
    const [clusters, services, domains] = await Promise.all([
      netbirdGet<LiveCluster[]>(managementUrl, token, "/api/reverse-proxies/clusters"),
      netbirdGet<LiveService[]>(managementUrl, token, "/api/reverse-proxies/services"),
      netbirdGet<LiveDomain[]>(managementUrl, token, "/api/reverse-proxies/domains"),
    ]);
    const clusterOnline = clusters.some(cluster => cluster.address === clusterAddress && cluster.online && cluster.private === true);
    const liveDomain = liveCustomDomain(domains, domain);

    if (!liveDomain && !clusterOnline) {
      pulumi.log.warn(`NetBird apps: no private proxy online for ${clusterAddress} yet (kubernetes/apps/netbird-system/nbidp). ${domain} and its services wait for it.`);
      return;
    }
    // Management checks `validation.<domain>` once, at create, and deletes a
    // domain still unvalidated 48 hours later. The records above exist first,
    // so the create normally validates; if it did not, every `up` asks again.
    const customDomain = new netbird.ReverseProxyDomain("app-domain", { domain, targetCluster: clusterAddress }, { provider: args.provider, dependsOn: [...args.dependsOn, ...records] });
    let domainValidated = liveDomain?.validated === true;
    if (liveDomain && !domainValidated && !pulumi.runtime.isDryRun()) domainValidated = await validateDomain(managementUrl, token, liveDomain.id, domain);
    if (!liveDomain)
      pulumi.log.warn(
        `NetBird apps: ${domain} is not registered with management yet. This run registers it if it is new; if management dropped it (unvalidated for 48h) while Pulumi still holds it, run \`pulumi refresh\`.`,
      );

    const { ingresses, definitions } = await discover(globals);
    const apps = tailnetApps(ingresses);
    // Never read an empty cluster as "every app was removed": that would
    // delete every service on a bad API answer.
    if (apps.length === 0) throw new Error("NetBird apps: found no tailnet Ingresses in `network`; refusing to delete every app service");

    if (!domainValidated) pulumi.log.warn(`NetBird apps: ${domain} is not validated yet; the ${apps.length} app services are declared on the first run after it is.`);
    let waiting = 0;
    for (const app of apps) {
      const host = appHost(app.host, root);
      const { groups, warnings } = appAccessGroups(definitionFor(app, definitions), app);
      for (const warning of warnings) pulumi.log.warn(`NetBird apps: ${warning}`);
      const ready = appServiceReady({ serviceExists: services.some(service => service.domain === host), clusterOnline, domainValidated });
      if (!ready) {
        waiting++;
        continue;
      }
      const accessGroupIds = groups.map(name => {
        const id = groupIds[name];
        if (!id) throw new Error(`NetBird apps: no id for user group ${name}`);
        return id;
      });
      new NetbirdPrivateService(`app-${app.host}`, { managementUrl, token, request: appServiceRequest({ host, clusterAddress, accessGroupIds }) }, { dependsOn: [...args.dependsOn, customDomain] });
    }
    if (waiting > 0 && domainValidated) pulumi.log.warn(`NetBird apps: ${waiting} app services wait for the private proxy for ${clusterAddress} to come back online.`);
  });

  // ── 4. The *.app certificate, for other hosts ────────────────────────────
  copyWildcardCertificate(globals);
}

/** The Kubernetes API: the Stack's own ServiceAccount in the cluster, the tailnet kubeproxy anywhere else. */
async function kubeConfig(globals: GlobalResources): Promise<kubernetes.KubeConfig> {
  const config = new kubernetes.KubeConfig();
  if (existsSync(SERVICE_ACCOUNT_TOKEN)) config.loadFromCluster();
  // Not components/helpers.ts's awaitOutput: importing that module declares a
  // `mkdirs` component in whatever stack imports it.
  else config.loadFromString(await new Promise<string>(resolve => generateTailscaleKubeConfig("equestria", globals.tailscaleDomain).apply(resolve)));
  return config;
}

async function discover(globals: GlobalResources): Promise<{ ingresses: LiveIngress[]; definitions: LiveDefinition[] }> {
  const config = await kubeConfig(globals);
  const [ingresses, definitions] = await Promise.all([
    config.makeApiClient(kubernetes.NetworkingV1Api).listNamespacedIngress({ namespace: "network" }),
    config.makeApiClient(kubernetes.CustomObjectsApi).listClusterCustomObject({ group: "driscoll.dev", version: "v1", plural: "applicationdefinitions" }) as Promise<{ items: LiveDefinition[] }>,
  ]);
  return { ingresses: ingresses.items as LiveIngress[], definitions: definitions.items };
}

/**
 * kubernetes/apps/netbird-system/nbidp/app-wildcard-certificate.yaml's Secret,
 * into OpenBao, where hosts other than the proxy read it.
 *
 * Copied here rather than pushed by ESO: ESO's OpenBao identity is read-only
 * by design (the eso-* policies), and a write grant for it would make the
 * cluster a writer of the shared store. This stack already writes OpenBao.
 * A missing Secret (before cert-manager's first issue) or a refused read
 * warns and skips; baoKvSecret's retainOnDelete keeps the last copy in
 * OpenBao meanwhile.
 */
function copyWildcardCertificate(globals: GlobalResources): void {
  const certificate = pulumi.secret(
    (async () => {
      try {
        const secret = await (await kubeConfig(globals)).makeApiClient(kubernetes.CoreV1Api).readNamespacedSecret(WILDCARD_SECRET);
        const decode = (key: string) => Buffer.from(secret.data?.[key] ?? "", "base64").toString("utf8");
        const tlsCrt = decode("tls.crt");
        const tlsKey = decode("tls.key");
        if (!tlsCrt || !tlsKey) throw new Error("tls.crt or tls.key is empty");
        return { tlsCrt, tlsKey };
      } catch (error) {
        pulumi.log.warn(`NetBird apps: could not read ${WILDCARD_SECRET.namespace}/${WILDCARD_SECRET.name} (${(error as Error).message?.split("\n")[0]}); OpenBao keeps its last copy of the *.app certificate.`);
        return undefined;
      }
    })(),
  );
  certificate.apply(cert => {
    if (!cert) return;
    baoKvSecret(
      "netbird-app-wildcard-tls",
      {
        mount: "secrets",
        path: APP_WILDCARD_BAO_PATH,
        data: { tls_crt: cert.tlsCrt, tls_key: cert.tlsKey },
        concealedFields: ["tls_key"],
        customMetadata: baoProvenance({ source: "stacks/netbird", copied_from: `kubernetes:${WILDCARD_SECRET.namespace}/${WILDCARD_SECRET.name}` }),
      },
      { provider: globals.baoProvider },
    );
  });
}

/** Ask management to check `validation.<domain>` again. 412 is "not yet": a warning, not a failure. */
async function validateDomain(url: string, token: string, id: string, domain: string): Promise<boolean> {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/reverse-proxies/domains/${encodeURIComponent(id)}/validate`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (response.ok) return true;
  const detail = await response.text().catch(() => "");
  if (response.status === 412) {
    pulumi.log.warn(`NetBird apps: ${domain} did not validate: ${detail}`.trim());
    return false;
  }
  throw new Error(`NetBird GET /api/reverse-proxies/domains/${id}/validate: HTTP ${response.status} ${detail}`.trim());
}

/** GET a NetBird API path with an admin token. */
async function netbirdGet<T>(url: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${url.replace(/\/+$/, "")}${path}`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`NetBird GET ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

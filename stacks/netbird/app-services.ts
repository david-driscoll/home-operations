/**
 * Section 12 of stacks/netbird: every tailnet app's NetBird twin,
 * `<host>.app.<root domain>` (docs/plans/netbird-mirror.md §N). apps.ts holds
 * the pure half and the picture; this declares:
 *
 *   1. the public DNS NetBird's custom-domain check needs: `*.app` and
 *      `validation.app`, CNAMEs to the proxy's cluster address
 *      (`ek.<root domain>`; proxyDomains.ts). Technitium's <root domain> zone
 *      forwards anything it has no override for, and NetBird peers get their
 *      records from management (private-service zones), not from here;
 *   2. `app.<root domain>` as a custom domain on that cluster;
 *   3. one private service per tailnet app whose definition.yaml grants a
 *      NetBird user group, open to exactly those groups, pointed at Traefik's
 *      netbird door. An app with no definition, no access_policy, or no group
 *      that maps gets none, with a warning (D44).
 *
 * The `*.app` certificate's OpenBao copy is not here: an ESO PushSecret owns
 * it (kubernetes/apps/netbird-system/nbidp/app-wildcard-pushsecret.yaml, D39),
 * so the key never passes through Pulumi state.
 *
 * DISCOVERY IS LIVE, like this stack's reads of NetBird itself: the tailnet
 * Ingresses in `network` and every ApplicationDefinition, from the Kubernetes
 * API (the Stack's ServiceAccount, kubernetes/apps/pulumi/netbird/rbac.yaml;
 * locally, the tailnet kubeproxy, as stacks/system reads them). That is what
 * Flux actually applied, with TAILSCALE_HOST and the definitions' variables
 * already substituted, so nothing here re-implements Flux's substitution or
 * keeps a list. A new app shows up on the next run (the Stack's daily resync,
 * or the next merge), and a removed one's service goes with it.
 *
 * Management takes a custom domain only for a connected cluster, and a
 * service only under a validated domain, so both wait for the proxy; once
 * they exist they stay declared through a proxy restart.
 */
import { existsSync } from "node:fs";
import * as kubernetes from "@kubernetes/client-node";
import type * as netbird from "@pulumi/netbird";
import * as pulumi from "@pulumi/pulumi";
import type { GlobalResources, NetbirdApiCredential } from "components/globals.ts";
import { generateTailscaleKubeConfig } from "components/store/index.ts";
import { NetbirdPrivateService } from "dynamic/netbird/NetbirdPrivateService.ts";
import { type AppDomainState, appAccessGroups, appDomain, appHost, appServiceReady, appServiceRequest, definitionFor, type LiveDefinition, type LiveIngress, tailnetApps } from "./apps.ts";
import { type LiveCluster, type LiveDomain, type LiveService, liveCustomDomain } from "./nbidp.ts";
import { clusterCnames, declareCustomDomain, validationCname } from "./proxyDomains.ts";

const SERVICE_ACCOUNT_TOKEN = "/var/run/secrets/kubernetes.io/serviceaccount/token";

export interface AppServicesArgs {
  globals: GlobalResources;
  api: NetbirdApiCredential;
  /** globals.netbirdProvider. */
  provider: netbird.Provider;
  /** Every user group this stack creates, name to id. */
  userGroupIds: Record<string, pulumi.Input<string>>;
  /** The proxy's cluster address, `ek.<root domain>` (NB_PROXY_DOMAIN). */
  clusterAddress: string;
  root: string;
  dependsOn: pulumi.Resource[];
}

export function declareAppServices(args: AppServicesArgs): void {
  const { globals, clusterAddress, root } = args;
  const domain = appDomain(root);

  // ── 1. Public DNS ──────────────────────────────────────────────────────
  const records = clusterCnames(globals, clusterAddress, [
    { name: "netbird-app-wildcard", recordName: `*.${domain}`, comment: "stacks/netbird: NetBird app names, on the private proxy's cluster" },
    // The wildcard covers it too; spelled out because it is what management checks.
    validationCname("netbird-app-validation", domain, "the app names"),
  ]);

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
    const { resource: customDomain, validated } = await declareCustomDomain({
      name: "app-domain",
      domain,
      clusterAddress,
      provider: args.provider,
      managementUrl,
      token,
      live: liveDomain,
      dependsOn: [...args.dependsOn, ...records],
    });
    const domainState: AppDomainState = validated ? "validated" : liveDomain ? "unvalidated" : "creating";

    const { ingresses, definitions } = await discover(globals);
    const apps = tailnetApps(ingresses);
    // Never read an empty cluster as "every app was removed": that would
    // delete every service on a bad API answer.
    if (apps.length === 0) throw new Error("NetBird apps: found no tailnet Ingresses in `network`; refusing to delete every app service");

    if (domainState === "unvalidated") pulumi.log.warn(`NetBird apps: ${domain} is not validated yet; new app services wait for it.`);
    let waiting = 0;
    let skipped = 0;
    for (const app of apps) {
      const host = appHost(app.host, root);
      const { groups, warnings } = appAccessGroups(definitionFor(app, definitions), app);
      for (const warning of warnings) pulumi.log.warn(`NetBird apps: ${warning}`);
      if (groups.length === 0) {
        skipped++;
        continue;
      }
      const ready = appServiceReady({ serviceExists: services.some(service => service.domain === host), clusterOnline, domain: domainState });
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
    if (skipped > 0) pulumi.log.info(`NetBird apps: ${skipped} of ${apps.length} tailnet apps have no NetBird service (see the warnings above).`);
    if (waiting > 0 && domainState !== "unvalidated") pulumi.log.warn(`NetBird apps: ${waiting} app services wait for the private proxy for ${clusterAddress} to come back online.`);
  });
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

/** GET a NetBird API path with an admin token. */
async function netbirdGet<T>(url: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${url.replace(/\/+$/, "")}${path}`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`NetBird GET ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

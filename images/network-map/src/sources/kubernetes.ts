/**
 * Kubernetes (the cluster the job runs in, through its ServiceAccount):
 * nodes as Machines, HTTPRoutes as observed Apps behind their Gateways, and
 * the tailnet egress Services' `tailscale.com/tailnet-fqdn` as join aliases.
 *
 *   GET /api/v1/nodes
 *   GET /api/v1/services                                   (all namespaces; only the annotation is used)
 *   GET /apis/gateway.networking.k8s.io/v1/httproutes
 *   GET /apis/gateway.networking.k8s.io/v1/gateways
 *
 * Read-only, by ./rbac.yaml's ClusterRole (get/list on exactly these).
 *
 * Not modelled yet: pods and Services as k8s-pod / k8s-svc networks, and
 * RUNS for Kubernetes apps (a Deployment's pods move between nodes; the app
 * is the cluster's, which the declared layer will say).
 */
import type { ApiClient } from "../http.ts";
import { emptyResult, type SourceResult } from "../model.ts";
import { normalizeHostname, normalizeIp, toIso, uniq } from "../normalize.ts";

interface Meta {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  creationTimestamp?: string;
}

export interface K8sNode {
  metadata: Meta;
  status?: {
    addresses?: { type: string; address: string }[];
    nodeInfo?: { osImage?: string; kubeletVersion?: string };
    conditions?: { type: string; status: string }[];
  };
}

export interface K8sService {
  metadata: Meta;
  spec?: { type?: string; externalName?: string };
}

export interface K8sHttpRoute {
  metadata: Meta;
  spec?: { hostnames?: string[]; parentRefs?: { name: string; namespace?: string; kind?: string }[] };
}

export interface K8sGateway {
  metadata: Meta;
  status?: { addresses?: { type?: string; value: string }[] };
}

interface List<T> {
  items: T[];
}

export interface KubernetesOptions {
  /** `equestria`: the App's `cluster`. */
  cluster: string;
  /** The site the nodes' LAN is on. */
  site: string;
}

/** The observed App id for a route: the app's name label (what ks.yaml's commonMetadata stamps, and the definition's ${APP}), else the route's own name. */
export const routeAppId = (route: K8sHttpRoute) => route.metadata.labels?.["app.kubernetes.io/name"] ?? route.metadata.name;
export const gatewayEntryId = (namespace: string, name: string) => `gateway:${namespace}/${name}`;

export function parseKubernetes(input: { nodes: K8sNode[]; services: K8sService[]; routes: K8sHttpRoute[]; gateways: K8sGateway[] }, options: KubernetesOptions): SourceResult {
  const result = emptyResult("kubernetes");

  for (const node of input.nodes) {
    const addresses = node.status?.addresses ?? [];
    const ips = uniq(addresses.filter(a => a.type === "InternalIP" || a.type === "ExternalIP").map(a => normalizeIp(a.address)));
    const ready = node.status?.conditions?.find(c => c.type === "Ready")?.status === "True";
    const hostname = addresses.find(a => a.type === "Hostname")?.address;
    result.machines.push({
      source: "kubernetes",
      key: `kubernetes:node:${node.metadata.name}`,
      name: node.metadata.name,
      os: node.status?.nodeInfo?.osImage,
      status: ready ? "ready" : "not-ready",
      firstSeen: toIso(node.metadata.creationTimestamp),
      hostnames: uniq([normalizeHostname(node.metadata.name), normalizeHostname(hostname)]),
      interfaces: ips.length > 0 ? [{ network: { lan: true, site: options.site }, ips, online: ready, hostname: normalizeHostname(node.metadata.name) }] : [],
    });
  }

  // Egress Services: `proxmox-luna` -> `luna.<tailnet>`. The FQDN's first
  // label is the machine's hostname on its own LAN (stacks/unifi-network/tailnet-egress.ts externalName).
  for (const svc of input.services) {
    const fqdn = svc.metadata.annotations?.["tailscale.com/tailnet-fqdn"];
    if (!fqdn) continue;
    result.aliases.push({ fqdn: fqdn.toLowerCase(), hostname: normalizeHostname(fqdn) });
  }

  const gatewayAddress = new Map(input.gateways.map(g => [gatewayEntryId(g.metadata.namespace ?? "default", g.metadata.name), g.status?.addresses?.[0]?.value]));
  const apps = new Map<string, { hostnames: Set<string>; routes: Set<string> }>();
  for (const route of input.routes) {
    const appId = routeAppId(route);
    const app = apps.get(appId) ?? { hostnames: new Set(), routes: new Set() };
    apps.set(appId, app);
    app.routes.add(`${route.metadata.namespace}/${route.metadata.name}`);
    const names = route.spec?.hostnames ?? [];
    for (const n of names) app.hostnames.add(n.toLowerCase());
    for (const parent of route.spec?.parentRefs ?? []) {
      if (parent.kind && parent.kind !== "Gateway") continue;
      const entryId = gatewayEntryId(parent.namespace ?? route.metadata.namespace ?? "default", parent.name);
      if (!result.entryPoints.some(e => e.key === entryId)) {
        result.entryPoints.push({ key: entryId, props: { kind: "gateway", name: parent.name, cluster: options.cluster, address: gatewayAddress.get(entryId) } });
      }
      for (const n of names) result.servedBy.push({ app: appId, entryPoint: entryId, name: n.toLowerCase() });
    }
  }
  for (const [appId, app] of apps) {
    result.apps.push({ key: appId, props: { name: appId, cluster: options.cluster, hostnames: [...app.hostnames].sort(), routes: [...app.routes].sort() } });
  }
  return result;
}

export async function collectKubernetes(client: ApiClient, options: KubernetesOptions): Promise<SourceResult> {
  const [nodes, services, routes, gateways] = await Promise.all([
    client.getJson<List<K8sNode>>("/api/v1/nodes"),
    client.getJson<List<K8sService>>("/api/v1/services"),
    client.getJson<List<K8sHttpRoute>>("/apis/gateway.networking.k8s.io/v1/httproutes"),
    client.getJson<List<K8sGateway>>("/apis/gateway.networking.k8s.io/v1/gateways"),
  ]);
  return parseKubernetes({ nodes: nodes.items, services: services.items, routes: routes.items, gateways: gateways.items }, options);
}

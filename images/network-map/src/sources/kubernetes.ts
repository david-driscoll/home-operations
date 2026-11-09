/**
 * Kubernetes (the cluster the job runs in, through its ServiceAccount):
 * nodes as Machines; Apps from HTTPRoutes (behind their Gateways) and from
 * running workloads; and the tailnet egress Services'
 * `tailscale.com/tailnet-fqdn` as join aliases.
 *
 *   GET /api/v1/nodes
 *   GET /api/v1/services                                   (all namespaces; only the annotation is used)
 *   GET /apis/gateway.networking.k8s.io/v1/httproutes
 *   GET /apis/gateway.networking.k8s.io/v1/gateways
 *   GET /apis/apps/v1/{deployments,statefulsets,daemonsets}
 *   GET /apis/batch/v1/cronjobs
 *   GET /apis/postgresql.cnpg.io/v1/clusters
 *
 * Read-only, by ./rbac.yaml's ClusterRole (get/list on exactly these). The
 * lists run one at a time, paged with `limit`/`continue`, and a 429 or 503
 * (API Priority and Fairness throttling) is retried with backoff, honouring
 * `Retry-After` (../http.ts withRetry).
 *
 * APPS. One App per `app.kubernetes.io/name`, the key the declared layer
 * gives the ks's APP. A route names its app by that label (else its own
 * name); a workload by that label on itself, else on its pod template, and a
 * workload with neither is skipped. app-template sets the label to the
 * release name (its `global.nameOverride`), on every controller of a
 * release, so a multi-controller release is one App; raw manifests get it
 * from the ks's commonMetadata. A workload Flux's helm-controller rendered is
 * also observed under its HelmRelease's name when that differs, and a
 * CloudNativePG Cluster under its Flux owner (workloadAppIds). `observedVia`
 * says which (`route`, `workload`). A workload scaled to zero, a suspended
 * CronJob or a hibernated CNPG cluster still counts: the app is deployed, so
 * it is observed, with `running: false`.
 *
 * Not modelled yet: pods and Services as k8s-pod / k8s-svc networks, and
 * RUNS for Kubernetes apps (a Deployment's pods move between nodes; the app
 * is the cluster's, which the declared layer will say). Other operator-made
 * workloads are seen under whatever labels the operator gives them.
 */
import { type ApiClient, type RetryOptions, withRetry } from "../http.ts";
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

/** `CnpgCluster` is a postgresql.cnpg.io/v1 Cluster. */
export type WorkloadKind = "Deployment" | "StatefulSet" | "DaemonSet" | "CronJob" | "CnpgCluster";

interface PodTemplate {
  metadata?: { labels?: Record<string, string> };
}

/** A Deployment, StatefulSet, DaemonSet, CronJob or CNPG Cluster: only the fields the App needs. A list's items carry no `kind`, so the collector sets it. */
export interface K8sWorkload {
  kind: WorkloadKind;
  metadata: Meta;
  spec?: {
    replicas?: number;
    /** A CNPG Cluster's. */
    instances?: number;
    suspend?: boolean;
    template?: PodTemplate;
    jobTemplate?: { spec?: { template?: PodTemplate } };
  };
  status?: { desiredNumberScheduled?: number };
}

interface List<T> {
  items?: T[];
  metadata?: { continue?: string };
}

export interface KubernetesOptions {
  /** `equestria`: the App's `cluster`. */
  cluster: string;
  /** The site the nodes' LAN is on. */
  site: string;
  /** The throttling retry; tests inject `sleep`. */
  retry?: RetryOptions;
}

export const APP_NAME_LABEL = "app.kubernetes.io/name";
/** What helm-controller and kustomize-controller stamp on every object they apply: the owning HelmRelease / Kustomization. */
export const HELM_NAME_LABEL = "helm.toolkit.fluxcd.io/name";
export const KUSTOMIZE_NAME_LABEL = "kustomize.toolkit.fluxcd.io/name";
/** CNPG's declarative hibernation: `on` shuts every instance down. */
export const CNPG_HIBERNATION = "cnpg.io/hibernation";
/** Items per list page. */
export const LIST_PAGE_SIZE = 500;
/** A `continue` chain longer than this is a server bug, not a big cluster. */
const MAX_LIST_PAGES = 100;

export const WORKLOAD_LISTS: { kind: WorkloadKind; path: string }[] = [
  { kind: "Deployment", path: "/apis/apps/v1/deployments" },
  { kind: "StatefulSet", path: "/apis/apps/v1/statefulsets" },
  { kind: "DaemonSet", path: "/apis/apps/v1/daemonsets" },
  { kind: "CronJob", path: "/apis/batch/v1/cronjobs" },
  // CNPG runs its instances as bare Pods: the Cluster is the only workload object.
  { kind: "CnpgCluster", path: "/apis/postgresql.cnpg.io/v1/clusters" },
];

/** How an App was observed. Docker's own is `docker` (./docker.ts). */
export type ObservedVia = "route" | "workload" | "docker";

/** The observed App id for a route: the app's name label (what ks.yaml's commonMetadata stamps, and the definition's ${APP}), else the route's own name. */
export const routeAppId = (route: K8sHttpRoute) => route.metadata.labels?.[APP_NAME_LABEL] ?? route.metadata.name;
export const gatewayEntryId = (namespace: string, name: string) => `gateway:${namespace}/${name}`;

const podTemplate = (w: K8sWorkload) => (w.kind === "CronJob" ? w.spec?.jobTemplate?.spec?.template : w.spec?.template);

/** The observed App id for a workload: its name label, else its pod template's; undefined when neither has one. */
export const workloadAppId = (w: K8sWorkload): string | undefined => w.metadata.labels?.[APP_NAME_LABEL] || podTemplate(w)?.metadata?.labels?.[APP_NAME_LABEL] || undefined;

/**
 * Every App id a workload is observed under, sorted; none means skip it.
 *
 *   - A CloudNativePG Cluster: its Flux owner, the HelmRelease
 *     (`helm.toolkit.fluxcd.io/name`) else the Kustomization
 *     (`kustomize.toolkit.fluxcd.io/name`), else its own name.
 *   - Any other workload: `workloadAppId`, plus its HelmRelease's name when
 *     that differs. helm-controller stamps the label on everything it
 *     renders, and the release is named `${APP}`, so a chart that names its
 *     workloads after the component (crowdsec's) still meets the declared
 *     app. A workload with only the helm label is observed under that alone.
 */
export function workloadAppIds(w: K8sWorkload): string[] {
  const labels = w.metadata.labels ?? {};
  if (w.kind === "CnpgCluster") return [labels[HELM_NAME_LABEL] || labels[KUSTOMIZE_NAME_LABEL] || w.metadata.name];
  return uniq([workloadAppId(w), labels[HELM_NAME_LABEL] || undefined]).sort();
}

/**
 * Whether the workload is asked to run anything: replicas above zero (absent
 * is one), a DaemonSet scheduled on some node, a CronJob not suspended, a
 * CNPG cluster with instances and not hibernated. Not health: a
 * crash-looping Deployment is still `running`.
 */
export function workloadRunning(w: K8sWorkload): boolean {
  switch (w.kind) {
    case "CnpgCluster":
      return (w.spec?.instances ?? 1) > 0 && w.metadata.annotations?.[CNPG_HIBERNATION] !== "on";
    case "CronJob":
      return w.spec?.suspend !== true;
    case "DaemonSet":
      return w.status?.desiredNumberScheduled !== 0;
    default:
      return (w.spec?.replicas ?? 1) > 0;
  }
}

interface AppAccumulator {
  hostnames: Set<string>;
  routes: Set<string>;
  namespaces: Set<string>;
  workloads: Set<string>;
  workloadKinds: Set<WorkloadKind>;
  via: Set<ObservedVia>;
  running?: boolean;
}

export function parseKubernetes(input: { nodes: K8sNode[]; services: K8sService[]; routes: K8sHttpRoute[]; gateways: K8sGateway[]; workloads?: K8sWorkload[] }, options: KubernetesOptions): SourceResult {
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

  const apps = new Map<string, AppAccumulator>();
  const appFor = (appId: string) => {
    let app = apps.get(appId);
    if (!app) {
      app = { hostnames: new Set(), routes: new Set(), namespaces: new Set(), workloads: new Set(), workloadKinds: new Set(), via: new Set() };
      apps.set(appId, app);
    }
    return app;
  };

  const gatewayAddress = new Map(input.gateways.map(g => [gatewayEntryId(g.metadata.namespace ?? "default", g.metadata.name), g.status?.addresses?.[0]?.value]));
  for (const route of input.routes) {
    const appId = routeAppId(route);
    const app = appFor(appId);
    app.via.add("route");
    app.routes.add(`${route.metadata.namespace}/${route.metadata.name}`);
    if (route.metadata.namespace) app.namespaces.add(route.metadata.namespace);
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

  for (const w of input.workloads ?? []) {
    for (const appId of workloadAppIds(w)) {
      const app = appFor(appId);
      app.via.add("workload");
      app.workloadKinds.add(w.kind);
      app.workloads.add(`${w.metadata.namespace}/${w.kind}/${w.metadata.name}`);
      if (w.metadata.namespace) app.namespaces.add(w.metadata.namespace);
      // Running when any of its workloads is.
      app.running = app.running === true || workloadRunning(w);
    }
  }

  const sorted = <T extends string>(values: Set<T>) => [...values].sort();
  for (const [appId, app] of apps) {
    result.apps.push({
      key: appId,
      props: {
        name: appId,
        cluster: options.cluster,
        observedVia: sorted(app.via),
        namespaces: sorted(app.namespaces),
        hostnames: sorted(app.hostnames),
        routes: sorted(app.routes),
        workloadKinds: sorted(app.workloadKinds),
        workloads: sorted(app.workloads),
        running: app.running,
      },
    });
  }
  return result;
}

/** Every item of a list, page by page (`limit`/`continue`). */
export async function listAll<T>(client: ApiClient, path: string, pageSize: number = LIST_PAGE_SIZE): Promise<T[]> {
  const items: T[] = [];
  let token: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const query = `limit=${pageSize}${token ? `&continue=${encodeURIComponent(token)}` : ""}`;
    const list = await client.getJson<List<T>>(`${path}?${query}`);
    items.push(...(list.items ?? []));
    token = list.metadata?.continue || undefined;
    if (!token) return items;
  }
  throw new Error(`GET ${path}: more than ${MAX_LIST_PAGES} pages of ${pageSize}`);
}

export async function collectKubernetes(client: ApiClient, options: KubernetesOptions): Promise<SourceResult> {
  const api = withRetry(client, options.retry);
  // One list at a time: four at once is what tripped API Priority and Fairness.
  const nodes = await listAll<K8sNode>(api, "/api/v1/nodes");
  const services = await listAll<K8sService>(api, "/api/v1/services");
  const routes = await listAll<K8sHttpRoute>(api, "/apis/gateway.networking.k8s.io/v1/httproutes");
  const gateways = await listAll<K8sGateway>(api, "/apis/gateway.networking.k8s.io/v1/gateways");

  // A workload list that fails (RBAC not rolled out yet) costs only its kind:
  // the source is partial, and the route-derived Apps still land.
  const workloads: K8sWorkload[] = [];
  const errors: string[] = [];
  for (const { kind, path } of WORKLOAD_LISTS) {
    try {
      for (const item of await listAll<Omit<K8sWorkload, "kind">>(api, path)) workloads.push({ ...item, kind });
    } catch (error) {
      errors.push(`${kind} list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = parseKubernetes({ nodes, services, routes, gateways, workloads }, options);
  result.errors.push(...errors);
  return result;
}

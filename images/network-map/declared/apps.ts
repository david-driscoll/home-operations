/**
 * Declared apps: every ApplicationDefinition (definition.yaml) and every
 * Dockge stack, with the names it is reached by and who may reach it.
 *
 * KUBERNETES (kubernetes/apps/**): each definition.yaml sits beside the ks.yaml
 * whose Kustomization renders it, and Flux substitutes it with that ks's
 * `postBuild.substitute` (APP, NAMESPACE, TAILSCALE_HOST, ...) and the cluster
 * Secrets. Of those Secrets, the cluster's own name and domain come from
 * clusters/equestria.yaml (CLUSTER_KEY, CLUSTER_TITLE, CLUSTER_DOMAIN =
 * `<domainPrefix>.<root domain>`), and the root domain and tailnet from the
 * environment (ROOT_DOMAIN, TAILSCALE_DOMAIN). The rest stay unresolved.
 *
 *   appId         metadata.name, i.e. the ks's APP: the observed layer's
 *                 `app.kubernetes.io/name` (../src/sources/kubernetes.ts)
 *   appRoute      the host of spec.url
 *   tailnetRoute  spec.tailnetUrl's host, else `<TAILSCALE_HOST or APP>.<tailnet>`
 *                 when the ks renders kubernetes/components/tailscale
 *   appService    `<that host>.nb.<root domain>` when it is a tailnet app whose
 *                 access_policy names a NetBird user group: stacks/netbird's
 *                 own rule (stacks/netbird/apps.ts appAccessGroups)
 *
 * DOCKER (docker/<host>/* plus docker/_common/*): the stacks components/DockgeLxc.ts
 * deploys to each Dockge host. A host gets the union of its own directory and
 * _common, less any stack with a `*.ignore` file in either; a file in the
 * host's directory wins over _common's. Each stack is an App keyed by its
 * name, the compose project the observed layer keys it by
 * (../src/sources/docker.ts), which RUNS on the host's LXC. Its names come
 * from its compose file's Traefik `Host()` rules: a `*-tailscale` router's
 * are tailnet routes, the rest app routes. Substituted the way DockgeLxc
 * does it: APP/STACK_NAME, `host` (the Proxmox host's shortName or name),
 * searchDomain/ROOT_DOMAIN, tailscaleDomain, and the cluster file's fields.
 *
 * BOTH: access_policy.groups -> Group `authentik:<group>` REACHES the App, via
 * a Policy `authentik:access-policy:<appId>`. No ports: the definition names
 * none.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseAllDocuments } from "yaml";
import type { appAccessGroups, appHost } from "../../../stacks/netbird/apps.ts";
import type { ClusterFile, DockgeHost } from "./machines.ts";
import { attempt, type DeclaredPlan, machineKey } from "./plan.ts";
import { substitute } from "./substitute.ts";

export interface Domains {
  /** The root domain, or undefined to leave `${ROOT_DOMAIN}` unresolved (a dry run). */
  root?: string;
  tailnet?: string;
}

export interface Definition {
  metadata: { name: string; namespace?: string };
  spec: {
    name?: string;
    category?: string;
    url?: string;
    tailnetUrl?: string;
    access_policy?: { groups?: string[] };
  };
}

interface Kustomization {
  metadata?: { name?: string; namespace?: string };
  spec?: { path?: string; targetNamespace?: string; components?: string[]; postBuild?: { substitute?: Record<string, unknown> } };
}

/** The variables clusters/<key>.yaml supplies, as Flux's cluster-secrets and DockgeLxc both spell them. */
export function clusterVars(cluster: ClusterFile, domains: Domains): Record<string, string | undefined> {
  return {
    CLUSTER_KEY: cluster.key,
    CLUSTER_CNAME: cluster.key,
    CLUSTER_TITLE: cluster.title,
    LOCATION: cluster.location,
    CLUSTER_DOMAIN: cluster.domainPrefix && domains.root ? `${cluster.domainPrefix}.${domains.root}` : undefined,
    ROOT_DOMAIN: domains.root,
    TAILSCALE_DOMAIN: domains.tailnet,
  };
}

/** The host of a URL, lowercased, or undefined when it is not one (or still holds a `${VAR}`). */
export function urlHost(url: string | undefined): string | undefined {
  if (!url || url.includes("${")) return undefined;
  try {
    return new URL(url).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

/** Every ApplicationDefinition document in a (substituted) definition.yaml. */
export function parseDefinitions(text: string): Definition[] {
  return parseAllDocuments(text)
    .map(doc => doc.toJS() as { kind?: string } & Definition)
    .filter(doc => doc?.kind === "ApplicationDefinition" && typeof doc.metadata?.name === "string")
    .map(doc => ({ metadata: doc.metadata, spec: doc.spec ?? {} }));
}

const normalizePath = (p: string) => p.replace(/^\.\//, "").replace(/\/+$/, "");

/** The Kustomization in a ks.yaml that renders `dir`: the one whose spec.path is it, else the deepest ancestor, else the first. */
export function kustomizationFor(ksText: string, dir: string): Kustomization | undefined {
  const all = parseAllDocuments(ksText)
    .map(doc => doc.toJS() as { kind?: string } & Kustomization)
    .filter(doc => doc?.kind === "Kustomization");
  const target = normalizePath(dir);
  const scored = all
    .map(ks => ({ ks, path: normalizePath(ks.spec?.path ?? "") }))
    .filter(({ path }) => path && (target === path || target.startsWith(`${path}/`)))
    .sort((a, b) => b.path.length - a.path.length);
  return scored[0]?.ks ?? all[0];
}

/** The ks's own substitutions, as strings. */
function substitutions(ks: Kustomization | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ks?.spec?.postBuild?.substitute ?? {})) if (v !== undefined && v !== null) out[k] = String(v);
  return out;
}

/** Whether the ks renders kubernetes/components/tailscale, which is what makes an app a tailnet app. */
export const rendersTailscale = (ks: Kustomization | undefined) => (ks?.spec?.components ?? []).some(c => normalizePath(c).endsWith("components/tailscale"));

function addAccess(plan: DeclaredPlan, appId: string, groups: readonly string[] | undefined): void {
  if (!groups?.length) return;
  const via = `authentik:access-policy:${appId}`;
  plan.node("Policy", via, { system: "authentik", name: `access-policy ${appId}`, action: "accept" });
  for (const group of groups) {
    plan.node("Group", `authentik:${group}`, { system: "authentik", name: group, kind: "user" });
    plan.rel("REACHES", { label: "Group", key: `authentik:${group}` }, { label: "App", key: appId }, { via }, via);
  }
}

/** stacks/netbird/apps.ts's rule for which app gets an app service, and its name. Without it, no app gets one. */
export interface AppServiceRule {
  appAccessGroups: typeof appAccessGroups;
  appHost: typeof appHost;
}

/** stacks/netbird/apps.ts as it is in the checkout, imported when called (see ./netbird.ts readNetbird). */
export async function readAppServiceRule(): Promise<AppServiceRule> {
  const { appAccessGroups, appHost } = await import("../../../stacks/netbird/apps.ts");
  return { appAccessGroups, appHost };
}

export interface KubernetesAppInput {
  /** Repo-relative directory of the definition.yaml. */
  dir: string;
  definitionText: string;
  ksText?: string;
}

/** One definition.yaml beside its ks.yaml -> App nodes and their reach. */
export function addKubernetesApp(plan: DeclaredPlan, input: KubernetesAppInput, cluster: ClusterFile, domains: Domains, services?: AppServiceRule): void {
  const ks = input.ksText ? kustomizationFor(input.ksText, input.dir) : undefined;
  if (!ks) plan.problems.push(`${input.dir}/definition.yaml: no ks.yaml beside it; only cluster variables substituted`);
  const local = substitutions(ks);
  const vars = { ...clusterVars(cluster, domains), NAMESPACE: ks?.spec?.targetNamespace ?? ks?.metadata?.namespace, ...local };
  const { text, unresolved } = substitute(input.definitionText, vars);
  for (const def of parseDefinitions(text)) {
    const appId = def.metadata.name;
    if (appId.includes("${")) {
      plan.problems.push(`${input.dir}/definition.yaml: name ${appId} is unresolved; skipped`);
      continue;
    }
    const tailnetApp = rendersTailscale(ks);
    const tailnetHost = (local.TAILSCALE_HOST || local.APP || appId).toLowerCase();
    const namespace = def.metadata.namespace ?? (vars.NAMESPACE as string | undefined);
    const tailnetRoute = urlHost(def.spec.tailnetUrl) ?? (tailnetApp && domains.tailnet ? `${tailnetHost}.${domains.tailnet}` : undefined);
    const access = tailnetApp && services ? services.appAccessGroups({ metadata: { name: appId, namespace }, spec: def.spec }, { app: appId, namespace: namespace ?? "", host: tailnetHost }) : undefined;
    const appService = access && access.groups.length > 0 && domains.root && services ? services.appHost(tailnetHost, domains.root) : undefined;
    const appRoute = urlHost(def.spec.url);
    plan.node("App", appId, {
      name: def.spec.name ?? appId,
      category: def.spec.category,
      cluster: cluster.key,
      clusters: [cluster.key],
      namespace,
      appRoute,
      tailnetRoute,
      appService,
      hostnames: [appRoute, tailnetRoute, appService].filter((h): h is string => !!h),
      accessGroups: def.spec.access_policy?.groups,
      definition: `${input.dir}/definition.yaml`,
      unresolved: unresolved.length > 0 ? unresolved : undefined,
    });
    addAccess(plan, appId, def.spec.access_policy?.groups);
  }
}

/** Hosts in a Traefik rule's `Host(...)`/`HostSNI(...)` matchers, without wildcards. */
export function traefikHosts(rule: string): string[] {
  const hosts: string[] = [];
  for (const m of rule.matchAll(/Host(?:SNI)?\(([^)]*)\)/g)) for (const h of m[1].matchAll(/`([^`]+)`/g)) if (h[1] !== "*") hosts.push(h[1].toLowerCase());
  return hosts;
}

/** A (substituted) compose file's Traefik HTTP routers: name -> hosts. Labels may be a map or a `k=v` list. */
export function composeRouters(text: string): Map<string, string[]> {
  const routers = new Map<string, string[]>();
  const doc = parseAllDocuments(text)[0]?.toJS() as { services?: Record<string, { labels?: Record<string, unknown> | string[] }> } | undefined;
  for (const service of Object.values(doc?.services ?? {})) {
    const labels = service?.labels;
    const entries: [string, string][] = Array.isArray(labels)
      ? labels.map(l => String(l)).map(l => [l.slice(0, Math.max(0, l.indexOf("="))), l.slice(l.indexOf("=") + 1)])
      : Object.entries(labels ?? {}).map(([k, v]) => [k, String(v)]);
    for (const [key, value] of entries) {
      const m = /^traefik\.http\.routers\.([^.]+)\.rule$/.exec(key);
      if (m) routers.set(m[1], [...new Set([...(routers.get(m[1]) ?? []), ...traefikHosts(value)])]);
    }
  }
  return routers;
}

export interface DockerStackInput {
  stack: string;
  host: DockgeHost;
  cluster: ClusterFile;
  composeText?: string;
  definitionText?: string;
}

/** The variables DockgeLxc substitutes into one host's stack files. */
export function dockerVars(input: Pick<DockerStackInput, "stack" | "host" | "cluster">, domains: Domains): Record<string, string | undefined> {
  return {
    ...clusterVars(input.cluster, domains),
    APP: input.stack,
    STACK_NAME: input.stack,
    host: input.host.shortName,
    DOCKGE_NAME: input.host.name,
    searchDomain: domains.root,
    tailscaleDomain: domains.tailnet,
    TIMEZONE: "America/New_York",
  };
}

/** One Dockge stack on one host -> its App, RUNS from the host's LXC, and its reach. */
export function addDockerStack(plan: DeclaredPlan, input: DockerStackInput, domains: Domains): void {
  const vars = dockerVars(input, domains);
  const where = `docker/${input.host.hostName}/${input.stack}`;
  const compose = input.composeText ? substitute(input.composeText, vars) : undefined;
  const definition = input.definitionText ? substitute(input.definitionText, vars) : undefined;
  if (!compose) plan.problems.push(`${where}: no compose.yaml in the host's directory or _common`);
  const def = definition ? parseDefinitions(definition.text)[0] : undefined;
  const appRoutes: string[] = [];
  const tailnetRoutes: string[] = [];
  for (const [router, hosts] of compose ? composeRouters(compose.text) : new Map<string, string[]>()) {
    for (const host of hosts) {
      if (host.includes("${")) continue;
      (router.endsWith("-tailscale") ? tailnetRoutes : appRoutes).push(host);
    }
  }
  const definedRoute = urlHost(def?.spec.url);
  if (definedRoute && !appRoutes.includes(definedRoute)) appRoutes.unshift(definedRoute);
  const unresolved = [...new Set([...(compose?.unresolved ?? []), ...(definition?.unresolved ?? [])])].sort();
  plan.node("App", input.stack, {
    name: def?.spec.name ?? input.stack,
    category: def?.spec.category,
    cluster: input.cluster.key,
    clusters: [input.cluster.key],
    appRoute: appRoutes[0],
    tailnetRoute: tailnetRoutes[0],
    appRoutes,
    tailnetRoutes,
    hostnames: [...new Set([...appRoutes, ...tailnetRoutes])],
    accessGroups: def?.spec.access_policy?.groups,
    definition: def ? `${where}/definition.yaml` : undefined,
    unresolved: unresolved.length > 0 ? unresolved : undefined,
  });
  plan.rel("RUNS", { label: "Machine", key: machineKey(input.host.name) }, { label: "App", key: input.stack });
  addAccess(plan, input.stack, def?.spec.access_policy?.groups);
}

// ── Reading a checkout ───────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function filesUnder(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries.filter(e => e.isFile()).map(e => join(e.parentPath, e.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter(e => e.isDirectory() && !e.name.startsWith(".")).map(e => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Every definition.yaml under kubernetes/apps, with its ks.yaml. An unreadable
 * file, or no definition at all, is a problem; the rest still load.
 */
export async function readKubernetesApps(root: string, problems: string[]): Promise<KubernetesAppInput[]> {
  const files = (await attempt(problems, "kubernetes/apps", [], () => filesUnder(join(root, "kubernetes", "apps")))).filter(f => f.endsWith("/definition.yaml")).sort();
  if (files.length === 0) problems.push("kubernetes/apps: no definition.yaml found; no Kubernetes apps declared");
  // Read in parallel, but report problems in file order (each read gets its
  // own list), so the load's log does not depend on timing.
  const lists = files.map((): string[] => []);
  const read = await Promise.all(
    files.map((file, i) =>
      attempt(lists[i], relative(root, file), [] as KubernetesAppInput[], async () => [
        { dir: relative(root, dirname(file)), definitionText: await readFile(file, "utf8"), ksText: await readOptional(join(dirname(file), "ks.yaml")) },
      ]),
    ),
  );
  for (const list of lists) problems.push(...list);
  return read.flat();
}

/** The stacks DockgeLxc deploys to `host`: its directory and _common, less the ignored ones. An unreadable stack is a problem. */
export async function readDockerStacks(root: string, host: DockgeHost, cluster: ClusterFile, problems: string[] = []): Promise<DockerStackInput[]> {
  const docker = join(root, "docker");
  const names = [...new Set([...(await subdirs(join(docker, host.hostName))), ...(await subdirs(join(docker, "_common")))])].sort();
  if (names.length === 0) problems.push(`docker/${host.hostName}: no stacks for ${host.name} (nor in docker/_common)`);
  const out: DockerStackInput[] = [];
  for (const stack of names) {
    const own = join(docker, host.hostName, stack);
    const common = join(docker, "_common", stack);
    const input = await attempt(problems, `docker/${host.hostName}/${stack}`, undefined as DockerStackInput | undefined, async () => {
      const files = [...(await filesUnder(own)), ...(await filesUnder(common))];
      if (files.some(f => f.endsWith(".ignore"))) return undefined;
      const pick = async (name: string) => ((await exists(join(own, name))) ? readOptional(join(own, name)) : readOptional(join(common, name)));
      return { stack, host, cluster, composeText: await pick("compose.yaml"), definitionText: await pick("definition.yaml") };
    });
    if (input) out.push(input);
  }
  return out;
}

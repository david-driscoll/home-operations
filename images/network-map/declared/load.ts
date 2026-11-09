/**
 * A checkout -> the declared plan: every reader in this directory, in the
 * order their nodes depend on each other (machines before the apps and
 * gateways that run on them). Reads files; writes nothing.
 *
 * Every source is read through `attempt` (./plan.ts): a source file that is
 * missing, renamed or broken -- talos/talconfig.yaml going away in the TOPF
 * move, say -- becomes a problem in the result and only its nodes are left
 * out. The load itself never fails on one source; ./main.ts logs the
 * problems and writes the rest.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addDockerStack, addKubernetesApp, type Domains, readAppServiceRule, readDockerStacks, readKubernetesApps } from "./apps.ts";
import { addMachines, type ClusterFile, dockgeHosts, readMachineSources } from "./machines.ts";
import { addNetbird, readNetbird } from "./netbird.ts";
import { attempt, type DeclaredNode, DeclaredPlan, type DeclaredRel } from "./plan.ts";
import { addTailscale, readTailscale } from "./tailscale.ts";
import { addZones, parseZones } from "./zones.ts";

/** Where the zone map lives, relative to the repo root. */
export const ZONES_FILE = "images/network-map/declared/unifi-zones.yaml";

/** The one Kubernetes cluster kubernetes/apps deploys to. */
export const KUBERNETES_CLUSTER = "equestria";

export interface LoadedPlan {
  nodes: DeclaredNode[];
  rels: DeclaredRel[];
  problems: string[];
  /** Kubernetes apps with a definition that Flux does not deploy (`<dir>: <why>`), in file order. */
  disabled: string[];
}

export async function loadDeclared(root: string, domains: Domains): Promise<LoadedPlan> {
  const plan = new DeclaredPlan();
  const problems = plan.problems;

  const tailscale = await attempt(problems, "components/constants.ts", undefined, readTailscale);
  const sources = await readMachineSources(root, tailscale?.scope ?? {}, problems);
  addMachines(plan, sources);
  const hosts = dockgeHosts(sources.resources);
  const clusterOf = new Map(sources.clusters.map(c => [c.key, c]));

  if (tailscale) addTailscale(plan, tailscale.decl);
  const netbird = await attempt(problems, "stacks/netbird/policy.ts, sites.ts", undefined, readNetbird);
  if (netbird) await attempt(problems, "stacks/netbird declarations", undefined, () => addNetbird(plan, netbird, hosts));
  await attempt(problems, ZONES_FILE, undefined, async () => addZones(plan, parseZones(await readFile(join(root, ZONES_FILE), "utf8"))));

  let equestria: ClusterFile | undefined = clusterOf.get(KUBERNETES_CLUSTER);
  if (!equestria) {
    problems.push(`clusters/${KUBERNETES_CLUSTER}.yaml: missing; Kubernetes apps load without its CLUSTER_* variables`);
    equestria = { key: KUBERNETES_CLUSTER, type: "kubernetes" };
  }
  // Without the rule no app gets an app service; the apps themselves still load.
  const services = await attempt(problems, "stacks/netbird/apps.ts", undefined, readAppServiceRule);
  // A disabled app is not a problem: it is meant to be off, so it is counted, not declared.
  const disabled: string[] = [];
  for (const app of await readKubernetesApps(root, problems)) {
    if (app.disabled) {
      disabled.push(`${app.dir}: ${app.disabled}`);
      continue;
    }
    const cluster = equestria;
    await attempt(problems, `${app.dir}/definition.yaml`, undefined, () => addKubernetesApp(plan, app, cluster, domains, services));
  }

  for (const host of hosts) {
    const cluster = clusterOf.get(host.hostName);
    if (cluster?.type !== "dockge") {
      problems.push(`Dockge host ${host.name}: no dockge cluster file clusters/${host.hostName}.yaml; its stacks are skipped`);
      continue;
    }
    for (const stack of await readDockerStacks(root, host, cluster, problems)) {
      await attempt(problems, `docker/${host.hostName}/${stack.stack}`, undefined, () => addDockerStack(plan, stack, domains));
    }
  }
  // A dockge cluster file that no site stack builds a host for.
  for (const c of sources.clusters) if (c.type === "dockge" && !hosts.some(h => h.hostName === c.key)) problems.push(`clusters/${c.key}.yaml: no DockgeLxc on a ProxmoxHost named ${c.key} in the site stacks`);

  return { ...plan.finish(), disabled };
}

/**
 * A checkout -> the declared plan: every reader in this directory, in the
 * order their nodes depend on each other (machines before the apps and
 * gateways that run on them). Reads files; writes nothing.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Tailscale } from "../../../components/constants.ts";
import { addDockerStack, addKubernetesApp, type Domains, readDockerStacks, readKubernetesApps } from "./apps.ts";
import { addMachines, dockgeHosts, readMachineSources } from "./machines.ts";
import { addNetbird, NETBIRD } from "./netbird.ts";
import { type DeclaredNode, DeclaredPlan, type DeclaredRel } from "./plan.ts";
import { addTailscale, TAILSCALE } from "./tailscale.ts";
import { addZones, parseZones } from "./zones.ts";

/** Where the zone map lives, relative to the repo root. */
export const ZONES_FILE = "images/network-map/declared/unifi-zones.yaml";

/** The one Kubernetes cluster kubernetes/apps deploys to. */
export const KUBERNETES_CLUSTER = "equestria";

export interface LoadedPlan {
  nodes: DeclaredNode[];
  rels: DeclaredRel[];
  problems: string[];
}

export async function loadDeclared(root: string, domains: Domains): Promise<LoadedPlan> {
  const plan = new DeclaredPlan();

  const sources = await readMachineSources(root, { Tailscale });
  addMachines(plan, sources);
  const hosts = dockgeHosts(sources.resources);
  const clusterOf = new Map(sources.clusters.map(c => [c.key, c]));

  addTailscale(plan, TAILSCALE);
  addNetbird(plan, NETBIRD, hosts);
  addZones(plan, parseZones(await readFile(join(root, ZONES_FILE), "utf8")));

  const equestria = clusterOf.get(KUBERNETES_CLUSTER);
  if (!equestria) throw new Error(`clusters/${KUBERNETES_CLUSTER}.yaml is missing`);
  for (const app of await readKubernetesApps(root)) addKubernetesApp(plan, app, equestria, domains);

  for (const host of hosts) {
    const cluster = clusterOf.get(host.hostName);
    if (cluster?.type !== "dockge") {
      plan.problems.push(`Dockge host ${host.name}: no dockge cluster file clusters/${host.hostName}.yaml; its stacks are skipped`);
      continue;
    }
    for (const stack of await readDockerStacks(root, host, cluster)) addDockerStack(plan, stack, domains);
  }
  // A dockge cluster file that no site stack builds a host for.
  for (const c of sources.clusters) if (c.type === "dockge" && !hosts.some(h => h.hostName === c.key)) plan.problems.push(`clusters/${c.key}.yaml: no DockgeLxc on a ProxmoxHost named ${c.key} in the site stacks`);

  return plan.finish();
}

/**
 * The Apps design (docs/network-map/schema.md "Homelable projection"):
 *
 *   - every App, in one zone per machine that RUNS it (a Dockge host, or a
 *     container with its own LAN presence), or per cluster when nothing
 *     RUNS it (a Kubernetes app belongs to the cluster, not a node);
 *   - the entry points, each joined to the apps it serves (SERVED_BY);
 *   - the user groups, each joined to the apps their reach covers.
 *
 * Reach (GLOSSARY.md) lands on a Group, a Machine, a Network or an App. This
 * design follows it to apps: an App directly; a Machine to the apps it and
 * the machines HOSTED_ON it run; a device Group or tag to the apps its
 * members' machines run. Reach to a whole Network is not drawn: that is
 * everything on it, and the overlay designs already show it. One edge per
 * (group, app), labelled with the ports.
 *
 * Machines are zones here, not nodes, so this design adds no inventory rows
 * for them; apps and entry points have no address and keep theirs by the
 * device_id the sync round-trips (./canvas.ts).
 */
import { type Canvas, canvasBuilder, type NodeSpec, type ZoneSpec } from "./canvas.ts";
import { type MapGraph, type MapNode, str, strs } from "./graph.ts";
import { ZONE_GAP } from "./layout.ts";
import { machineLabel, machineOf, machineType } from "./machines.ts";

const USER_KINDS = new Set(["user", "self"]);
const MAX_LABEL_ITEMS = 3;

/** `a, b, c` or `a, b, c +2`. */
export function shortList(items: string[]): string | undefined {
  if (items.length === 0) return undefined;
  const head = items.slice(0, MAX_LABEL_ITEMS).join(", ");
  return items.length > MAX_LABEL_ITEMS ? `${head} +${items.length - MAX_LABEL_ITEMS}` : head;
}

export function projectApps(g: MapGraph): Canvas {
  const c = canvasBuilder("Apps");
  const apps = g.find("App");
  const appKey = (a: MapNode) => `app:${a.layer}:${g.key(a)}`;
  const appLabel = (a: MapNode) => str(a.props.name) ?? g.key(a);

  // ── Apps by the machine (or cluster) that runs them ──
  const zones = new Map<string, { label: string; description: string; apps: MapNode[]; drift?: ZoneSpec["drift"] }>();
  const runnerOf = new Map<string, MapNode[]>();
  for (const app of apps) {
    const runners = g.in(app.id, "RUNS").map(h => h.node);
    runnerOf.set(app.id, runners);
    const machine = runners[0];
    const cluster = str(app.props.cluster);
    const [key, label, description] = machine
      ? [`zone:machine:${g.key(machine)}`, machineLabel(machine, g), `Apps running on ${machineLabel(machine, g)} (${machineType(machine)})`]
      : cluster
        ? [`zone:cluster:${cluster}`, `${cluster} (cluster)`, `Apps the ${cluster} cluster serves`]
        : ["zone:unplaced", "Runs nowhere observed", "Apps no machine or cluster claims"];
    const zone = zones.get(key) ?? { label, description, apps: [], drift: machine ? g.drift(machine.id) : undefined };
    zone.apps.push(app);
    zones.set(key, zone);
  }
  const appSpec = (app: MapNode): NodeSpec => ({
    type: (runnerOf.get(app.id) ?? []).length > 0 ? "docker_container" : "generic",
    label: appLabel(app),
    status: "unknown",
    drift: g.drift(app.id),
    properties: {
      names: strs(app.props.hostnames),
      routes: strs(app.props.routes),
      cluster: str(app.props.cluster),
      "app route": str(app.props.appRoute),
      "tailnet route": str(app.props.tailnetRoute),
      "app service": str(app.props.appService),
    },
  });
  const appZones: ZoneSpec[] = [...zones.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, z]) => ({
      key,
      label: z.label,
      description: z.description,
      drift: z.drift,
      members: z.apps.map(a => ({ key: appKey(a), spec: appSpec(a) })).sort((a, b) => a.spec.label.localeCompare(b.spec.label) || a.key.localeCompare(b.key)),
    }));
  const declaredApps = g.find("App", "declared").filter(a => g.drift(a.id) === "unobserved");
  if (declaredApps.length > 0) {
    appZones.push({
      key: "zone:declared-apps",
      label: "Declared, not observed",
      description: "Apps the repo defines that nothing serves",
      drift: "unobserved",
      members: declaredApps.map(a => ({ key: appKey(a), spec: { ...appSpec(a), drift: "unobserved" } })),
    });
  }

  // ── Entry points ──
  const entryPoints = [...g.find("EntryPoint"), ...g.find("EntryPoint", "declared").filter(e => g.drift(e.id) === "unobserved")];
  const epKey = (e: MapNode) => `entry:${e.layer}:${g.key(e)}`;
  const epMembers = entryPoints
    .map(e => ({
      key: epKey(e),
      spec: {
        type: "router",
        label: str(e.props.name) ?? g.key(e),
        hostname: str(e.props.address),
        status: "unknown",
        drift: g.drift(e.id),
        properties: { kind: str(e.props.kind), cluster: str(e.props.cluster), address: str(e.props.address) },
      } satisfies NodeSpec,
    }))
    .sort((a, b) => a.spec.label.localeCompare(b.spec.label) || a.key.localeCompare(b.key));

  // ── User groups and what their reach covers ──
  const appsRunBy = (m: MapNode): MapNode[] => {
    const hosted = g.in(m.id, "HOSTED_ON").map(h => h.node);
    return [m, ...hosted].flatMap(x => g.out(x.id, "RUNS").map(h => h.node));
  };
  const appsBehind = (target: MapNode): MapNode[] => {
    if (target.labels.includes("App")) return [target];
    if (target.labels.includes("Machine")) return appsRunBy(target);
    if (target.labels.includes("Group")) {
      return g
        .in(target.id, "MEMBER_OF")
        .map(h => (h.node.labels.includes("Interface") ? machineOf(g, h.node) : h.node))
        .filter((m): m is MapNode => !!m && m.labels.includes("Machine"))
        .flatMap(appsRunBy);
    }
    return [];
  };
  const reach = new Map<string, { group: MapNode; app: MapNode; ports: Set<string> }>();
  const userGroups = g.find("Group").filter(n => USER_KINDS.has(str(n.props.kind) ?? ""));
  for (const group of userGroups) {
    for (const hop of g.out(group.id, "REACHES")) {
      for (const app of appsBehind(hop.node)) {
        if (app.layer !== "observed") continue;
        const id = `${group.id}|${app.id}`;
        const entry = reach.get(id) ?? { group, app, ports: new Set<string>() };
        for (const p of strs(hop.rel.props.ports)) entry.ports.add(p);
        reach.set(id, entry);
      }
    }
  }
  const groupKey = (n: MapNode) => `group:${g.key(n)}`;
  const reaching = userGroups.filter(gr => [...reach.values()].some(r => r.group.id === gr.id));
  const groupMembers = reaching.map(gr => ({
    key: groupKey(gr),
    spec: {
      type: "generic",
      label: `${str(gr.props.name) ?? g.key(gr)} (${str(gr.props.system) ?? "?"})`,
      status: "unknown",
      drift: g.drift(gr.id),
      properties: { system: str(gr.props.system), members: strs(gr.props.members) },
    } satisfies NodeSpec,
  }));

  const top: ZoneSpec[] = [];
  if (groupMembers.length > 0) top.push({ key: "zone:user-groups", label: "User groups", description: "Groups whose reach covers an app", members: groupMembers, columns: 1 });
  if (epMembers.length > 0) top.push({ key: "zone:entry-points", label: "Entry points", description: "What answers on the apps' names", members: epMembers });
  let y = 0;
  if (top.length > 0) y += c.zones(top, { x: 0, y }) + ZONE_GAP * 2;
  c.zones(appZones, { x: 0, y });

  for (const app of apps) {
    const byEntry = new Map<string, string[]>();
    for (const hop of g.out(app.id, "SERVED_BY")) {
      const k = epKey(hop.node);
      byEntry.set(k, [...(byEntry.get(k) ?? []), str(hop.rel.props.name) ?? ""].filter(Boolean));
    }
    for (const [k, names] of byEntry) c.edge(k, appKey(app), { type: "virtual", label: shortList([...new Set(names)].sort()), arrow: true });
  }
  for (const r of [...reach.values()].sort((a, b) => `${g.key(a.group)}|${g.key(a.app)}`.localeCompare(`${g.key(b.group)}|${g.key(b.app)}`))) {
    c.edge(groupKey(r.group), appKey(r.app), { type: "virtual", line: "dotted", arrow: true, label: shortList([...r.ports].sort()) });
  }
  return c.build();
}

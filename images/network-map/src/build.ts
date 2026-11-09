/**
 * Observations -> the observed layer's graph plan (docs/network-map/schema.md
 * "Nodes" and "Relationships").
 *
 * Runs the machine join (./join.ts), then lays every joined machine out as a
 * Machine with one Interface per network it is on, and adds what the sources
 * reported around them: networks, switch ports, groups, routes, policies,
 * apps and entry points, and the edges between them. ./cypher.ts writes the
 * result.
 *
 * Every node and edge carries the `source` that wrote it. When two sources
 * describe the same node (a UniFi client and a Proxmox `net0` are one
 * Interface), the one earlier in JOIN_ORDER owns it.
 *
 * Pure: no I/O. build.test.ts covers it.
 */
import { JOIN_ORDER, type JoinedMachine, joinMachines } from "./join.ts";
import type { GraphPlan, InterfaceObservation, MachineKind, NodeLabel, PlainNode, PlanNode, PlanRel, Prop, ReachTarget, SourceName, SourceResult } from "./model.ts";
import { NETBIRD_NETWORK_ID, TAILNET_NETWORK_ID } from "./model.ts";
import { CGNAT_CIDR, cidrsOverlap, ipInCidr, parseCidr, uniq } from "./normalize.ts";

export interface BuildContext {
  /** The site the UniFi networks are on (`home`). */
  homeSite: string;
  /**
   * The UniFi networks from the last run that read them, for a run whose
   * UniFi read failed: without their CIDRs every LAN interface would land on
   * `site-lan:<home>` and get a new id.
   */
  fallbackHomeNetworks?: { networkId: string; cidr: string }[];
}

const KIND_RANK: Record<MachineKind, number> = { physical: 0, vm: 0, lxc: 0, container: 0, client: 1 };
const rank = (s: SourceName) => JOIN_ORDER.indexOf(s);
const minIso = (values: (string | undefined)[]) => values.filter((v): v is string => !!v).sort()[0];
const maxIso = (values: (string | undefined)[]) =>
  values
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);

export interface BuildOutput {
  plan: GraphPlan;
  machines: JoinedMachine[];
}

export function buildGraph(results: SourceResult[], ctx: BuildContext): BuildOutput {
  const ordered = [...results].sort((a, b) => rank(a.source) - rank(b.source));
  const nodes = new Map<string, PlanNode>();
  const rels = new Map<string, PlanRel>();

  const putNode = (node: PlanNode) => {
    const id = `${node.label}|${node.key}`;
    const existing = nodes.get(id);
    if (!existing) {
      nodes.set(id, node);
      return;
    }
    // First writer (by JOIN_ORDER) owns it; later ones only fill gaps,
    // except an App's `observedVia`, which is every way any source saw it.
    for (const [k, v] of Object.entries(node.props)) if (existing.props[k] === undefined || existing.props[k] === null) existing.props[k] = v;
    if (node.label === "App" && Array.isArray(node.props.observedVia) && Array.isArray(existing.props.observedVia)) {
      existing.props.observedVia = uniq([...(existing.props.observedVia as string[]), ...(node.props.observedVia as string[])]).sort();
    }
    existing.firstSeen = minIso([existing.firstSeen, node.firstSeen]);
    existing.lastSeen = maxIso([existing.lastSeen, node.lastSeen]);
  };
  const putRel = (rel: PlanRel) => {
    const id = `${rel.type}|${rel.from.label}|${rel.from.key}|${rel.to.label}|${rel.to.key}|${rel.mergeKey}`;
    if (!rels.has(id)) rels.set(id, rel);
  };
  const plain = (label: PlanNode["label"], source: SourceName, n: PlainNode) => putNode({ label, key: n.key, source, props: { ...n.props }, firstSeen: n.firstSeen, lastSeen: n.lastSeen });

  for (const r of ordered) {
    for (const n of r.networks) plain("Network", r.source, n);
    for (const n of r.ports) plain("Port", r.source, n);
    for (const n of r.groups) plain("Group", r.source, n);
    for (const n of r.routes) plain("Route", r.source, n);
    for (const n of r.policies) plain("Policy", r.source, n);
    for (const n of r.apps) plain("App", r.source, n);
    for (const n of r.entryPoints) plain("EntryPoint", r.source, n);
  }

  // The home site's networks: every UniFi network with a CIDR.
  const homeNetworks = [...nodes.values()].filter(n => n.label === "Network" && n.key.startsWith("unifi:") && typeof n.props.cidr === "string").map(n => ({ networkId: n.key, cidr: n.props.cidr as string }));
  if (homeNetworks.length === 0) homeNetworks.push(...(ctx.fallbackHomeNetworks ?? []));

  const ensureNetwork = (networkId: string, source: SourceName) => {
    if (nodes.has(`Network|${networkId}`)) return;
    if (networkId === TAILNET_NETWORK_ID) putNode({ label: "Network", key: networkId, source, props: { name: "tailnet", kind: "tailnet", cidr: CGNAT_CIDR } });
    else if (networkId === NETBIRD_NETWORK_ID) putNode({ label: "Network", key: networkId, source, props: { name: "netbird", kind: "netbird" } });
    else if (networkId.startsWith("site-lan:")) putNode({ label: "Network", key: networkId, source, props: { name: networkId.slice("site-lan:".length), kind: "site-lan" } });
    else if (networkId.startsWith("cidr:")) putNode({ label: "Network", key: networkId, source, props: { name: networkId.slice("cidr:".length), kind: "cidr", cidr: networkId.slice("cidr:".length) } });
    else {
      const fallback = ctx.fallbackHomeNetworks?.find(n => n.networkId === networkId);
      putNode({ label: "Network", key: networkId, source, props: { kind: "vlan", cidr: fallback?.cidr } });
    }
  };

  /** `{ networkId, definitive }`: definitive when the source named it or a CIDR placed it. */
  const resolveNetwork = (iface: InterfaceObservation): { networkId: string; definitive: boolean } => {
    if ("networkId" in iface.network) return { networkId: iface.network.networkId, definitive: true };
    const site = iface.network.site ?? ctx.homeSite;
    if (site === ctx.homeSite) {
      for (const ip of iface.ips) {
        const hit = homeNetworks.find(n => ipInCidr(ip, n.cidr));
        if (hit) return { networkId: hit.networkId, definitive: true };
      }
    }
    return { networkId: `site-lan:${site}`, definitive: false };
  };

  const machines = joinMachines(
    ordered.flatMap(r => r.machines),
    { homeSite: ctx.homeSite, homeCidrs: homeNetworks.map(n => n.cidr), aliases: ordered.flatMap(r => r.aliases) },
  );
  const machineIdByObservation = new Map<string, string>();
  for (const m of machines) for (const o of m.observations) machineIdByObservation.set(o.key, m.machineId);
  /** IP -> machine, for REACHES to a single host. */
  const machineByIp = new Map<string, string>();

  for (const m of machines) {
    const first = m.observations[0];
    const kinds = m.observations.map(o => o.kind).filter((k): k is MachineKind => !!k);
    const kind = kinds.sort((a, b) => KIND_RANK[a] - KIND_RANK[b])[0];
    const device = m.observations.find(o => o.device)?.device;
    // Name from the strongest non-client observation, so an LXC is called what Proxmox calls it.
    const named = m.observations.find(o => o.kind && o.kind !== "client") ?? first;
    putNode({
      label: "Machine",
      key: m.machineId,
      source: first.source,
      extraLabels: device ? ["Device"] : undefined,
      props: {
        name: named.name,
        kind,
        os: m.observations.find(o => o.os)?.os,
        status: m.observations.find(o => o.status)?.status,
        joined: m.joined,
        sources: uniq(m.observations.map(o => o.source)),
        hostnames: uniq(m.observations.flatMap(o => o.hostnames)),
        observations: m.observations.map(o => o.key),
        mac: device?.mac,
        model: device?.model,
        type: device?.type,
      },
      firstSeen: minIso(m.observations.map(o => o.firstSeen)),
      lastSeen: maxIso(m.observations.map(o => o.lastSeen)),
    });

    // Interfaces: definitive placements first, so a fallback (`site-lan`) one
    // with the same MAC folds into the interface a CIDR already placed.
    const placed = m.observations.flatMap(o => o.interfaces.map(iface => ({ o, iface, ...resolveNetwork(iface) }))).sort((a, b) => Number(b.definitive) - Number(a.definitive));
    const byMac = new Map<string, PlanNode>();
    for (const { o, iface, networkId, definitive } of placed) {
      const address = iface.mac ?? iface.ips[0];
      if (!address) continue;
      let node = !definitive && iface.mac ? byMac.get(iface.mac) : undefined;
      if (!node) {
        ensureNetwork(networkId, o.source);
        const key = `${networkId}:${address}`;
        node = nodes.get(`Interface|${key}`);
        if (!node) {
          node = { label: "Interface", key, source: o.source, props: { network: networkId, mac: iface.mac, ips: [], hostname: iface.hostname, online: iface.online, nic: iface.nic, sources: [] } };
          nodes.set(`Interface|${key}`, node);
        }
        putRel({ type: "HAS_INTERFACE", from: { label: "Machine", key: m.machineId }, to: { label: "Interface", key }, source: node.source, mergeKey: "", props: {} });
        putRel({ type: "ON", from: { label: "Interface", key }, to: { label: "Network", key: networkId }, source: node.source, mergeKey: "", props: {} });
      }
      if (iface.mac && !byMac.has(iface.mac)) byMac.set(iface.mac, node);
      const p = node.props;
      p.ips = uniq([...(p.ips as string[]), ...iface.ips]);
      p.sources = uniq([...(p.sources as string[]), o.source]);
      p.mac ??= iface.mac;
      p.hostname ??= iface.hostname;
      p.nic ??= iface.nic;
      if (iface.online !== undefined) p.online = p.online === true || iface.online;
      node.firstSeen = minIso([node.firstSeen, iface.firstSeen]);
      node.lastSeen = maxIso([node.lastSeen, iface.lastSeen]);
      for (const ip of iface.ips) if (!machineByIp.has(ip)) machineByIp.set(ip, m.machineId);

      const ifaceRef = { label: "Interface" as const, key: node.key };
      for (const group of iface.groups ?? []) {
        ensureGroup(group, o.source);
        putRel({ type: "MEMBER_OF", from: ifaceRef, to: { label: "Group", key: group }, source: o.source, mergeKey: "", props: {} });
      }
      for (const adv of iface.advertises ?? []) {
        ensureRoute(adv.routeId, o.source);
        putRel({ type: "ADVERTISES", from: ifaceRef, to: { label: "Route", key: adv.routeId }, source: o.source, mergeKey: "", props: { approved: adv.approved } });
      }
      if (iface.uplinkPort) putRel({ type: "UPLINK", from: ifaceRef, to: { label: "Port", key: iface.uplinkPort.portId }, source: o.source, mergeKey: "", props: { port: iface.uplinkPort.port } });
      if (iface.associated) {
        putRel({ type: "ASSOCIATED", from: ifaceRef, to: { label: "Device", key: iface.associated.deviceMac }, source: o.source, mergeKey: "", props: { essid: iface.associated.essid, band: iface.associated.band } });
      }
    }

    for (const o of m.observations) {
      const host = o.hostedOn ? machineIdByObservation.get(o.hostedOn) : undefined;
      if (host && host !== m.machineId) putRel({ type: "HOSTED_ON", from: { label: "Machine", key: m.machineId }, to: { label: "Machine", key: host }, source: o.source, mergeKey: "", props: {} });
    }
  }

  function ensureGroup(key: string, source: SourceName) {
    if (nodes.has(`Group|${key}`)) return;
    const [system, ...rest] = key.split(":");
    putNode({ label: "Group", key, source, props: { system, name: rest.join(":") } });
  }
  function ensureRoute(key: string, source: SourceName) {
    if (nodes.has(`Route|${key}`)) return;
    const [system, ...rest] = key.split(":");
    const cidr = rest.join(":");
    putNode({ label: "Route", key, source, props: { system, cidr, exit: cidr === "0.0.0.0/0" || cidr === "::/0" } });
  }

  for (const r of ordered) {
    for (const u of r.deviceUplinks) {
      putRel({ type: "UPLINK", from: { label: "Device", key: u.from }, to: { label: "Device", key: u.to }, source: r.source, mergeKey: "", props: { speed: u.speed, port: u.port } });
    }
    for (const s of r.servedBy) {
      putRel({ type: "SERVED_BY", from: { label: "App", key: s.app }, to: { label: "EntryPoint", key: s.entryPoint }, source: r.source, mergeKey: s.name, props: { name: s.name } });
    }
    for (const run of r.runs) {
      const machine = machineIdByObservation.get(run.machine);
      if (machine) putRel({ type: "RUNS", from: { label: "Machine", key: machine }, to: { label: "App", key: run.app }, source: r.source, mergeKey: "", props: {} });
    }
    for (const reach of r.reaches) {
      ensureGroup(reach.from, r.source);
      const to = resolveReachTarget(reach.to, r.source);
      if (!to) continue;
      putRel({ type: "REACHES", from: { label: "Group", key: reach.from }, to, source: r.source, mergeKey: reach.via, props: { via: reach.via, ports: reach.ports } });
    }
  }

  function resolveReachTarget(target: ReachTarget, source: SourceName): PlanRel["to"] | undefined {
    if ("group" in target) {
      ensureGroup(target.group, source);
      return { label: "Group", key: target.group };
    }
    if ("app" in target) return nodes.has(`App|${target.app}`) ? { label: "App", key: target.app } : undefined;
    const range = parseCidr(target.cidr);
    if (!range) return undefined;
    const host = (range.prefix === 32 || range.prefix === 128) && machineByIp.get(range.address);
    if (host) return { label: "Machine", key: host };
    const network = [...nodes.values()].find(n => n.label === "Network" && n.props.cidr === range.cidr);
    if (network) return { label: "Network", key: network.key };
    ensureNetwork(`cidr:${range.cidr}`, source);
    return { label: "Network", key: `cidr:${range.cidr}` };
  }

  // ROUTES_TO: each route to every network it overlaps.
  const networksWithCidr = [...nodes.values()].filter(n => n.label === "Network" && typeof n.props.cidr === "string" && n.props.kind !== "cidr");
  for (const route of [...nodes.values()].filter(n => n.label === "Route")) {
    const cidr = route.props.cidr;
    if (typeof cidr !== "string" || route.props.exit) continue;
    for (const net of networksWithCidr) {
      if (net.key === TAILNET_NETWORK_ID) continue;
      if (cidrsOverlap(cidr, net.props.cidr as string)) putRel({ type: "ROUTES_TO", from: { label: "Route", key: route.key }, to: { label: "Network", key: net.key }, source: route.source, mergeKey: "", props: {} });
    }
  }

  // Drop edges whose far end no source produced (a port the switch did not list).
  const exists = (label: NodeLabel, key: string) => (label === "Device" ? [...nodes.values()].some(n => n.extraLabels?.includes("Device") && n.props.mac === key) : nodes.has(`${label}|${key}`));
  const keptRels = [...rels.values()].filter(r => exists(r.from.label, r.from.key) && exists(r.to.label, r.to.key));

  const byKeyOrder = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return {
    plan: {
      nodes: [...nodes.values()].map(n => ({ ...n, props: clean(n.props) })).sort((a, b) => a.label.localeCompare(b.label) || byKeyOrder(a, b)),
      rels: keptRels.map(r => ({ ...r, props: clean(r.props) })).sort((a, b) => `${a.type}|${a.from.key}|${a.to.key}|${a.mergeKey}`.localeCompare(`${b.type}|${b.from.key}|${b.to.key}|${b.mergeKey}`)),
    },
    machines,
  };
}

/** Undefined and null props are left out, so a missing value never overwrites one. */
function clean(props: Record<string, Prop>): Record<string, Prop> {
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== null));
}

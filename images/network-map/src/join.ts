/**
 * The machine join (docs/network-map/schema.md, "Joining sources into one
 * machine"): every source's machine observations -> one Machine per computer.
 *
 * Each observation is matched against the machines built so far, trying the
 * keys in the schema's order and stopping at the first hit:
 *
 *   1. MAC (normalised, ./normalize.ts);
 *   2. LAN IP, only between observations on the same site, and only for
 *      addresses ./normalize.ts isJoinableLanIp accepts;
 *   3. Tailscale: a 100.x / fd7a: address on a tailnet interface (a Proxmox
 *      guest's tailscale0), a tailnet FQDN, or an alias (a Kubernetes
 *      `tailscale.com/tailnet-fqdn`, a Docker host's `*-tailscale` rule);
 *   4. hostname, last, and only when the name is unique both within the
 *      observation's own source and among the machines so far.
 *
 * Two observations from the SAME source are never merged by keys 2-4: one
 * source listing two things means two things (`apple-tv` five times on
 * Tailscale). A MAC that one source reports on two observations is dropped as
 * a key altogether. What matches nothing is its own machine, `joined: false`.
 *
 * Observations are processed in JOIN_ORDER, strongest identifiers first, so
 * the matches are deterministic and transitive: a Kubernetes node joins the
 * UniFi client by LAN IP that a Proxmox VM already joined by MAC.
 *
 * Pure: no I/O. join.test.ts covers it.
 */
import type { MachineKind, MachineObservation, SourceName, TailnetAlias } from "./model.ts";
import { TAILNET_NETWORK_ID } from "./model.ts";
import { ipInCidr, isJoinableLanIp, isTailnetAddress, normalizeHostname } from "./normalize.ts";

/** Strongest identifiers first: MAC-bearing sources, then IP-only, then the overlays. */
export const JOIN_ORDER: SourceName[] = ["unifi", "proxmox", "docker", "kubernetes", "netbird", "tailscale"];

export type MatchReason = "mac" | "lan-ip" | "tailnet" | "hostname";

export interface JoinContext {
  /** The site the UniFi networks belong to. */
  homeSite: string;
  /** The UniFi networks' CIDRs: a LAN address with no site of its own is on the home site only if one of these holds it. */
  homeCidrs: string[];
  aliases: TailnetAlias[];
}

export interface JoinedMachine {
  machineId: string;
  /** In JOIN_ORDER. */
  observations: MachineObservation[];
  /** Seen by more than one source. */
  joined: boolean;
  /** How each observation after the first was matched. */
  matchedBy: MatchReason[];
}

interface Identifiers {
  macs: string[];
  lan: { ip: string; site: string }[];
  tailnetIps: string[];
  fqdns: string[];
  hostnames: string[];
}

/** The site a LAN address is on, or undefined when it cannot be joined by. */
export function lanSite(network: MachineObservation["interfaces"][number]["network"], ip: string, ctx: Pick<JoinContext, "homeSite" | "homeCidrs">): string | undefined {
  if (!isJoinableLanIp(ip)) return undefined;
  if ("networkId" in network) return network.networkId.startsWith("unifi:") ? ctx.homeSite : undefined;
  if (network.site) return network.site;
  return ctx.homeCidrs.some(cidr => ipInCidr(ip, cidr)) ? ctx.homeSite : undefined;
}

function identifiers(obs: MachineObservation, ctx: JoinContext, ambiguousMacs: Set<string>): Identifiers {
  const macs = new Set<string>();
  const lan = new Map<string, { ip: string; site: string }>();
  const tailnetIps = new Set<string>();
  for (const iface of obs.interfaces) {
    if (iface.mac && !ambiguousMacs.has(`${obs.source}|${iface.mac}`)) macs.add(iface.mac);
    const onTailnet = ("networkId" in iface.network && iface.network.networkId === TAILNET_NETWORK_ID) || /^tailscale/.test(iface.nic ?? "");
    for (const ip of iface.ips) {
      if (onTailnet) {
        if (isTailnetAddress(ip)) tailnetIps.add(ip);
        continue;
      }
      const site = lanSite(iface.network, ip, ctx);
      if (site) lan.set(`${site}|${ip}`, { ip, site });
    }
  }
  if (obs.device) macs.add(obs.device.mac);
  return {
    macs: [...macs].sort(),
    lan: [...lan.values()],
    tailnetIps: [...tailnetIps].sort(),
    fqdns: [...new Set((obs.tailnetFqdns ?? []).map(f => f.toLowerCase().replace(/\.$/, "")))].sort(),
    hostnames: [...new Set(obs.hostnames.map(h => normalizeHostname(h)).filter((h): h is string => !!h))].sort(),
  };
}

interface Cluster {
  observations: MachineObservation[];
  matchedBy: MatchReason[];
  sources: Set<SourceName>;
  macs: Set<string>;
  kinds: Set<MachineKind | undefined>;
}

/** Same-source guard: true when `cluster` may take an observation from `source` by a soft key. */
const accepts = (cluster: Cluster, source: SourceName) => !cluster.sources.has(source);

export function joinMachines(observations: MachineObservation[], ctx: JoinContext): JoinedMachine[] {
  const order = (s: SourceName) => JOIN_ORDER.indexOf(s);
  const sorted = observations.map((obs, i) => ({ obs, i })).sort((a, b) => order(a.obs.source) - order(b.obs.source) || a.i - b.i);

  // A MAC or hostname one source reports more than once identifies nothing.
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const { obs } of sorted) {
    for (const mac of new Set(obs.interfaces.map(i => i.mac).filter(Boolean))) bump(`mac|${obs.source}|${mac}`);
    for (const h of new Set(obs.hostnames.map(normalizeHostname))) if (h) bump(`host|${obs.source}|${h}`);
  }
  const ambiguousMacs = new Set([...counts].filter(([k, n]) => n > 1 && k.startsWith("mac|")).map(([k]) => k.slice(4)));
  const uniqueInSource = (source: SourceName, hostname: string) => counts.get(`host|${source}|${hostname}`) === 1;

  const clusters: Cluster[] = [];
  const byMac = new Map<string, Cluster>();
  const byLan = new Map<string, Cluster>();
  const byTailnetIp = new Map<string, Cluster>();
  const byFqdn = new Map<string, Cluster>();
  const byHostname = new Map<string, Set<Cluster>>();
  const byKey = new Map<string, Cluster>();

  const aliasesByFqdn = new Map<string, TailnetAlias[]>();
  for (const alias of ctx.aliases) {
    const fqdn = alias.fqdn.toLowerCase().replace(/\.$/, "");
    aliasesByFqdn.set(fqdn, [...(aliasesByFqdn.get(fqdn) ?? []), alias]);
  }

  for (const { obs } of sorted) {
    const ids = identifiers(obs, ctx, ambiguousMacs);
    let match: Cluster | undefined;
    let reason: MatchReason | undefined;

    // 1. MAC.
    for (const mac of ids.macs) {
      const hit = byMac.get(mac);
      if (hit) {
        match = hit;
        reason = "mac";
        break;
      }
    }

    // 2. LAN IP, same site.
    if (!match) {
      for (const { ip, site } of ids.lan) {
        const hit = byLan.get(`${site}|${ip}`);
        if (hit && accepts(hit, obs.source)) {
          match = hit;
          reason = "lan-ip";
          break;
        }
      }
    }

    // 3. Tailscale: an address, an FQDN, then an alias.
    if (!match) {
      const candidates: (Cluster | undefined)[] = [...ids.tailnetIps.map(ip => byTailnetIp.get(ip)), ...ids.fqdns.map(f => byFqdn.get(f))];
      for (const fqdn of ids.fqdns) {
        for (const alias of aliasesByFqdn.get(fqdn) ?? []) {
          if (alias.observationKey) candidates.push(byKey.get(alias.observationKey));
          const host = normalizeHostname(alias.hostname);
          if (host) {
            const hosts = [...(byHostname.get(host) ?? [])].filter(c => !c.kinds.has("client"));
            if (hosts.length === 1) candidates.push(hosts[0]);
          }
        }
      }
      match = candidates.find(c => c && accepts(c, obs.source));
      if (match) reason = "tailnet";
    }

    // 4. Hostname, unique on both sides.
    if (!match) {
      for (const hostname of ids.hostnames) {
        if (!uniqueInSource(obs.source, hostname)) continue;
        const hits = [...(byHostname.get(hostname) ?? [])];
        if (hits.length === 1 && accepts(hits[0], obs.source)) {
          match = hits[0];
          reason = "hostname";
          break;
        }
      }
    }

    const cluster: Cluster = match ?? { observations: [], matchedBy: [], sources: new Set(), macs: new Set(), kinds: new Set() };
    if (!match) clusters.push(cluster);
    if (reason) cluster.matchedBy.push(reason);
    cluster.observations.push(obs);
    cluster.sources.add(obs.source);
    cluster.kinds.add(obs.kind);
    byKey.set(obs.key, cluster);
    for (const mac of ids.macs) {
      cluster.macs.add(mac);
      if (!byMac.has(mac)) byMac.set(mac, cluster);
    }
    for (const { ip, site } of ids.lan) if (!byLan.has(`${site}|${ip}`)) byLan.set(`${site}|${ip}`, cluster);
    for (const ip of ids.tailnetIps) if (!byTailnetIp.has(ip)) byTailnetIp.set(ip, cluster);
    for (const fqdn of ids.fqdns) if (!byFqdn.has(fqdn)) byFqdn.set(fqdn, cluster);
    for (const hostname of ids.hostnames) byHostname.set(hostname, new Set([...(byHostname.get(hostname) ?? []), cluster]));
  }

  return clusters.map(cluster => ({
    machineId: machineIdFor(cluster),
    observations: cluster.observations,
    joined: cluster.sources.size > 1,
    matchedBy: cluster.matchedBy,
  }));
}

/**
 * A machine's id is stable across runs whichever sources see it: its lowest
 * MAC when it has one (every MAC-bearing source agrees on it), otherwise the
 * strongest observation's own key (`tailscale:<nodeId>`).
 */
function machineIdFor(cluster: Cluster): string {
  const macs = [...cluster.macs].sort();
  return macs.length > 0 ? `mac:${macs[0]}` : cluster.observations[0].key;
}

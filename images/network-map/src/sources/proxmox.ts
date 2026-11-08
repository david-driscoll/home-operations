/**
 * Proxmox VE: each hypervisor's nodes, and their VMs and LXCs with the MACs
 * from their `netN` config and, for running guests, the addresses they have.
 *
 *   GET /api2/json/nodes
 *   GET /api2/json/nodes/<node>/network                    the node's own addresses (optional; needs Sys.Audit)
 *   GET /api2/json/nodes/<node>/qemu  and  .../lxc
 *   GET /api2/json/nodes/<node>/qemu/<vmid>/config         net0..: `virtio=<MAC>,bridge=...`
 *   GET /api2/json/nodes/<node>/qemu/<vmid>/agent/network-get-interfaces   running VMs with the guest agent (optional)
 *   GET /api2/json/nodes/<node>/lxc/<vmid>/config          net0..: `name=eth0,hwaddr=<MAC>,ip=...`
 *   GET /api2/json/nodes/<node>/lxc/<vmid>/interfaces      running LXCs: every NIC, tailscale0's 100.x included
 *
 * `Authorization: PVEAPIToken=<USER@REALM!TOKENID>=<secret>`, the token
 * components/ProxmoxHost.ts already uses. Hosts are reached by their tailnet
 * names, as kubernetes/apps/agents/agent-tools-servers/proxmox/ does: in a pod
 * those resolve to the tailnet egress Services (`proxmox-<host>`, port 8006),
 * and the hosts present a public certificate for them.
 *
 * A clustered host lists its peers' nodes too; every node is read once, from
 * the first target that lists it online. One target failing is a partial
 * result (`errors`), not a failed source.
 */
import type { ApiClient } from "../http.ts";
import { emptyResult, type InterfaceObservation, type MachineObservation, type SourceResult, TAILNET_NETWORK_ID } from "../model.ts";
import { isTailnetAddress, normalizeHostname, normalizeIp, normalizeMac, uniq } from "../normalize.ts";

interface Data<T> {
  data: T;
}

export interface PveNode {
  node: string;
  status?: string;
  uptime?: number;
}

export interface PveGuest {
  vmid: number | string;
  name?: string;
  status?: string;
  template?: number;
}

export interface PveNodeNetwork {
  iface: string;
  type?: string;
  address?: string;
  cidr?: string;
  active?: number;
}

export interface PveLxcInterface {
  name: string;
  hwaddr?: string;
  inet?: string;
  inet6?: string;
}

export interface PveAgentInterface {
  name: string;
  "hardware-address"?: string;
  "ip-addresses"?: { "ip-address": string; "ip-address-type"?: string; prefix?: number }[];
}

export interface ProxmoxTarget {
  /** `luna`: the hypervisor's estate name. */
  name: string;
  /** The site its LAN is on. */
  site: string;
}

export interface GuestDetail {
  config: Record<string, string | number | undefined>;
  /** LXC: /interfaces. QEMU: the agent's interfaces, mapped. Undefined when not running or unavailable. */
  nics?: { name: string; mac?: string; ips: string[] }[];
}

const NIC_SKIP = /^(lo|docker\d*|br-|veth|cali|cilium|flannel|wt\d|netbird)/;

/** `virtio=BC:24:11:AA:BB:CC,bridge=vmbr0,tag=20` or `name=eth0,hwaddr=BC:24:...,ip=10.0.0.5/24` -> MAC and static IP. */
export function parseNetConfig(value: string): { mac?: string; ip?: string; name?: string; bridge?: string; tag?: number } {
  const fields = new Map<string, string>();
  for (const part of value.split(",")) {
    const eq = part.indexOf("=");
    if (eq > 0) fields.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  let mac = normalizeMac(fields.get("hwaddr") ?? fields.get("macaddr"));
  // QEMU spells the model as the key: `virtio=<MAC>`, `e1000=<MAC>`.
  if (!mac) for (const v of fields.values()) mac ??= normalizeMac(v);
  const ipField = fields.get("ip");
  const ip = ipField && ipField !== "dhcp" && ipField !== "manual" ? normalizeIp(ipField) : undefined;
  const tag = fields.get("tag");
  return { mac, ip, name: fields.get("name"), bridge: fields.get("bridge"), tag: tag ? Number(tag) : undefined };
}

/** A guest -> one machine observation. */
export function guestObservation(target: ProxmoxTarget, node: string, kind: "vm" | "lxc", guest: PveGuest, detail: GuestDetail): MachineObservation {
  const interfaces: InterfaceObservation[] = [];
  const configured = Object.entries(detail.config)
    .filter(([k]) => /^net\d+$/.test(k))
    .map(([, v]) => parseNetConfig(String(v)));
  const byMac = new Map<string, InterfaceObservation>();
  for (const net of configured) {
    const iface: InterfaceObservation = { network: { lan: true, site: target.site }, mac: net.mac, ips: net.ip ? [net.ip] : [], nic: net.name };
    interfaces.push(iface);
    if (net.mac) byMac.set(net.mac, iface);
  }
  for (const nic of detail.nics ?? []) {
    if (NIC_SKIP.test(nic.name)) continue;
    if (/^tailscale/.test(nic.name)) {
      const ips = nic.ips.filter(isTailnetAddress);
      if (ips.length > 0) interfaces.push({ network: { networkId: TAILNET_NETWORK_ID }, ips, nic: nic.name });
      continue;
    }
    const lanIps = nic.ips.filter(ip => !isTailnetAddress(ip) && !ip.startsWith("fe80:") && ip !== "127.0.0.1" && ip !== "::1");
    const existing = nic.mac ? byMac.get(nic.mac) : undefined;
    if (existing) {
      existing.ips = uniq([...existing.ips, ...lanIps]);
      existing.nic ??= nic.name;
    } else if (nic.mac || lanIps.length > 0) {
      interfaces.push({ network: { lan: true, site: target.site }, mac: nic.mac, ips: lanIps, nic: nic.name });
    }
  }
  const running = guest.status === "running";
  for (const i of interfaces) i.online = running;
  const hostname = typeof detail.config.hostname === "string" ? detail.config.hostname : undefined;
  return {
    source: "proxmox",
    key: `proxmox:${node}/${guest.vmid}`,
    name: guest.name ?? hostname ?? `${node}/${guest.vmid}`,
    kind,
    os: typeof detail.config.ostype === "string" ? detail.config.ostype : undefined,
    status: guest.status,
    hostnames: uniq([normalizeHostname(guest.name), normalizeHostname(hostname)]),
    interfaces,
    hostedOn: `proxmox:node:${node}`,
  };
}

export function nodeObservation(target: ProxmoxTarget, node: PveNode, network: PveNodeNetwork[] | undefined): MachineObservation {
  const ips = uniq(
    (network ?? [])
      .filter(n => n.active !== 0 && (n.address || n.cidr))
      .map(n => normalizeIp(n.address ?? n.cidr))
      .filter(ip => ip && !isTailnetAddress(ip)),
  );
  return {
    source: "proxmox",
    key: `proxmox:node:${node.node}`,
    name: node.node,
    kind: "physical",
    os: "proxmox-ve",
    status: node.status,
    hostnames: uniq([normalizeHostname(node.node)]),
    interfaces: ips.length > 0 ? [{ network: { lan: true, site: target.site }, ips, online: node.status === "online" }] : [],
  };
}

const lxcNics = (list: PveLxcInterface[]) => list.map(i => ({ name: i.name, mac: normalizeMac(i.hwaddr), ips: uniq([normalizeIp(i.inet), normalizeIp(i.inet6)]) }));
const agentNics = (list: PveAgentInterface[]) => list.map(i => ({ name: i.name, mac: normalizeMac(i["hardware-address"]), ips: uniq((i["ip-addresses"] ?? []).map(a => normalizeIp(a["ip-address"]))) }));

async function optional<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}

/** Reads one target into `result`. `seenNodes` makes a clustered node read once across targets. */
export async function collectProxmoxTarget(client: ApiClient, target: ProxmoxTarget, result: SourceResult, seenNodes: Set<string>): Promise<void> {
  const get = async <T>(path: string) => (await client.getJson<Data<T>>(`/api2/json${path}`)).data;
  const nodes = await get<PveNode[]>("/nodes");
  for (const node of nodes) {
    if (node.status !== "online" || seenNodes.has(node.node)) continue;
    seenNodes.add(node.node);
    const n = encodeURIComponent(node.node);
    result.machines.push(nodeObservation(target, node, await optional(get<PveNodeNetwork[]>(`/nodes/${n}/network`))));
    for (const kind of ["qemu", "lxc"] as const) {
      const guests = await get<PveGuest[]>(`/nodes/${n}/${kind}`);
      for (const guest of guests) {
        if (Number(guest.template) === 1) continue;
        const base = `/nodes/${n}/${kind}/${encodeURIComponent(String(guest.vmid))}`;
        const config = await get<Record<string, string | number>>(`${base}/config`);
        let nics: GuestDetail["nics"];
        if (guest.status === "running") {
          if (kind === "lxc") {
            const list = await optional(get<PveLxcInterface[]>(`${base}/interfaces`));
            nics = list ? lxcNics(list) : undefined;
          } else if (/(^|,)\s*(enabled=)?1/.test(String(config.agent ?? ""))) {
            const answer = await optional(get<{ result: PveAgentInterface[] }>(`${base}/agent/network-get-interfaces`));
            nics = answer?.result ? agentNics(answer.result) : undefined;
          }
        }
        result.machines.push(guestObservation(target, node.node, kind === "qemu" ? "vm" : "lxc", guest, { config, nics }));
      }
    }
  }
}

export async function collectProxmox(targets: { target: ProxmoxTarget; client: ApiClient }[]): Promise<SourceResult> {
  const result = emptyResult("proxmox");
  const seenNodes = new Set<string>();
  for (const { target, client } of targets) {
    try {
      await collectProxmoxTarget(client, target, result, seenNodes);
    } catch (error) {
      result.errors.push(`proxmox ${target.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (result.errors.length === targets.length && targets.length > 0) throw new Error(result.errors.join("; "));
  return result;
}

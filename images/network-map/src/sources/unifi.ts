/**
 * UniFi Network: the home site's networks, its gateway, switches and APs, and
 * the clients on them.
 *
 * Reads the classic controller API through the UniFi OS proxy with an API
 * key (`X-API-KEY`), as stacks/unifi-network/netbird-relay.ts and
 * kubernetes/apps/network/external-dns/unifi/resources/fetch.sh already do:
 *
 *   GET /proxy/network/api/s/<site>/rest/networkconf   networks (CIDR, VLAN)
 *   GET /proxy/network/api/s/<site>/stat/device        gateway, switches, APs, uplinks, port tables
 *   GET /proxy/network/api/s/<site>/stat/sta           ONLINE clients, with switch port / AP / network
 *
 * The classic `stat/sta` carries each client's `sw_mac`/`sw_port` or
 * `ap_mac`/`essid`, so no per-client detail call is needed (schema.md's
 * "about 40 detail calls" is about the integration API and the MCP).
 * Offline clients are not read: their Machines age out by retention.
 *
 * Not read yet: firewall zones and zone policies (schema.md: the API omits
 * zone membership; zone-policy REACHES are a follow-up), and port forwards.
 */
import type { ApiClient } from "../http.ts";
import { emptyResult, type MachineObservation, type SourceResult } from "../model.ts";
import { normalizeHostname, normalizeIp, normalizeMac, parseCidr, toIso, uniq } from "../normalize.ts";

interface Envelope<T> {
  meta?: { rc?: string; msg?: string };
  data: T[];
}

export interface UnifiNetwork {
  _id: string;
  name?: string;
  purpose?: string;
  ip_subnet?: string;
  vlan?: number | string;
  vlan_enabled?: boolean;
  enabled?: boolean;
}

export interface UnifiDevice {
  mac: string;
  name?: string;
  model?: string;
  type?: string;
  ip?: string;
  state?: number;
  version?: string;
  last_seen?: number;
  uplink?: { uplink_mac?: string; uplink_remote_port?: number; speed?: number; type?: string };
  port_table?: { port_idx: number; name?: string; speed?: number; poe_enable?: boolean; up?: boolean }[];
}

export interface UnifiClient {
  mac: string;
  ip?: string;
  fixed_ip?: string;
  use_fixedip?: boolean;
  hostname?: string;
  name?: string;
  network_id?: string;
  network?: string;
  is_wired?: boolean;
  sw_mac?: string;
  sw_port?: number;
  ap_mac?: string;
  essid?: string;
  radio?: string;
  first_seen?: number;
  last_seen?: number;
  oui?: string;
}

/** UniFi `type` -> the schema's Device type. */
const DEVICE_TYPES: Record<string, "gateway" | "switch" | "ap"> = { udm: "gateway", ugw: "gateway", uxg: "gateway", usw: "switch", uap: "ap" };
/** `radio` -> band. */
const BANDS: Record<string, string> = { ng: "2.4GHz", na: "5GHz", "6e": "6GHz" };
/** Network purposes that are a LAN (not WAN, not VPN). */
const LAN_PURPOSES = new Set(["corporate", "guest", "vlan-only"]);

export const unifiNetworkId = (id: string) => `unifi:${id}`;

async function list<T>(client: ApiClient, path: string): Promise<T[]> {
  const body = await client.getJson<Envelope<T>>(path);
  if (body.meta?.rc && body.meta.rc !== "ok") throw new Error(`UniFi ${path}: rc=${body.meta.rc} ${body.meta.msg ?? ""}`);
  return body.data ?? [];
}

export async function collectUnifi(client: ApiClient, site = "default"): Promise<SourceResult> {
  const base = `/proxy/network/api/s/${site}`;
  const [networks, devices, clients] = await Promise.all([list<UnifiNetwork>(client, `${base}/rest/networkconf`), list<UnifiDevice>(client, `${base}/stat/device`), list<UnifiClient>(client, `${base}/stat/sta`)]);
  return parseUnifi(networks, devices, clients);
}

export function parseUnifi(networks: UnifiNetwork[], devices: UnifiDevice[], clients: UnifiClient[]): SourceResult {
  const result = emptyResult("unifi");

  const lanNetworks = networks.filter(n => LAN_PURPOSES.has(n.purpose ?? "") && n.enabled !== false);
  for (const n of lanNetworks) {
    const vlan = n.vlan_enabled === false || n.vlan === undefined || n.vlan === "" ? undefined : Number(n.vlan);
    result.networks.push({ key: unifiNetworkId(n._id), props: { name: n.name, kind: "vlan", cidr: parseCidr(n.ip_subnet)?.cidr, vlan, purpose: n.purpose } });
  }
  const knownNetworks = new Set(lanNetworks.map(n => n._id));

  for (const d of devices) {
    const mac = normalizeMac(d.mac);
    if (!mac) continue;
    const ip = normalizeIp(d.ip);
    const type = DEVICE_TYPES[d.type ?? ""] ?? d.type;
    const machine: MachineObservation = {
      source: "unifi",
      key: `unifi:device:${mac}`,
      name: d.name ?? d.model ?? mac,
      kind: "physical",
      status: d.state === 1 ? "online" : "offline",
      lastSeen: toIso(d.last_seen),
      hostnames: uniq([normalizeHostname(d.name)]),
      device: { mac, model: d.model, type },
      interfaces: [{ network: { lan: true }, mac, ips: ip ? [ip] : [], online: d.state === 1, lastSeen: toIso(d.last_seen) }],
    };
    result.machines.push(machine);
    for (const port of d.port_table ?? []) {
      result.ports.push({ key: `${mac}:${port.port_idx}`, props: { deviceMac: mac, idx: port.port_idx, name: port.name, speed: port.speed, poe: port.poe_enable, up: port.up } });
    }
    const upMac = normalizeMac(d.uplink?.uplink_mac);
    if (upMac) result.deviceUplinks.push({ from: mac, to: upMac, speed: d.uplink?.speed, port: d.uplink?.uplink_remote_port });
  }

  for (const c of clients) {
    const mac = normalizeMac(c.mac);
    if (!mac) continue;
    const ips = uniq([normalizeIp(c.ip), c.use_fixedip ? normalizeIp(c.fixed_ip) : undefined]);
    const swMac = normalizeMac(c.sw_mac);
    const apMac = normalizeMac(c.ap_mac);
    const wired = c.is_wired ?? !apMac;
    const firstSeen = toIso(c.first_seen);
    const lastSeen = toIso(c.last_seen);
    result.machines.push({
      source: "unifi",
      key: `unifi:client:${mac}`,
      name: c.name ?? c.hostname ?? mac,
      kind: "client",
      status: "online",
      firstSeen,
      lastSeen,
      hostnames: uniq([normalizeHostname(c.hostname), normalizeHostname(c.name)]),
      interfaces: [
        {
          network: c.network_id && knownNetworks.has(c.network_id) ? { networkId: unifiNetworkId(c.network_id) } : { lan: true },
          mac,
          ips,
          hostname: normalizeHostname(c.hostname),
          online: true,
          firstSeen,
          lastSeen,
          uplinkPort: wired && swMac && c.sw_port !== undefined ? { portId: `${swMac}:${c.sw_port}`, port: c.sw_port } : undefined,
          associated: !wired && apMac ? { deviceMac: apMac, essid: c.essid, band: BANDS[c.radio ?? ""] ?? c.radio } : undefined,
        },
      ],
    });
  }
  return result;
}

import { hash } from "node:crypto";
import * as pulumi from "@pulumi/pulumi";
import * as firewall from "@pulumi/terrifi";
import * as unifi from "@pulumiverse/unifi";
import axios from "axios";
import CIDRMatcher from "cidr-matcher";
import is_ip_private from "private-ip";
import { Tailscale } from "../../components/constants.ts";
import type { GlobalResources } from "../../components/globals.ts";
import { getTailscaleClient } from "../../components/tailscale.ts";
import type { components } from "../../types/tailscale.ts";

/**
 * A single AT&T endpoint IP for one device, together with every source port Tailscale currently
 * advertises for it. Tailscale reports several concurrent STUN endpoints per device, and the NAT
 * mapping behind them rotates every few minutes — so the ports are grouped under the IP rather than
 * spread across one resource each.
 *
 * Neither field is identity any more: the device is. See {@link createTailscaleAttDropFirewallRule}
 * for why the IP had to stop naming the resource.
 */
interface DropTarget {
  ip: string;
  ports: number[];
}

/** Collapse `{ip, port}` observations into one {@link DropTarget} per IP, with ports sorted so the members list is stable. */
function toDropTargets(ports: Map<string, Set<number>>): DropTarget[] {
  return [...ports].map(([ip, p]) => ({ ip, ports: [...p].sort((a, b) => a - b) })).sort((a, b) => a.ip.localeCompare(b.ip));
}

/**
 * Longest logical resource name we may hand to Pulumi for a UniFi firewall object.
 *
 * The controller rejects `firewallgroup`/`firewallpolicy` names past 64 characters with
 * `api.err.InvalidPayload` (400), and Pulumi auto-naming appends 8 more (`-` plus 7 hex digits),
 * which leaves 56. We stop at 54 for headroom. IPv6 endpoints are what actually blow the budget:
 * `2600-1700-c99-8830-a897-2c40-d2bc-9380` is 26 characters longer than its IPv4 equivalent.
 */
const MAX_LOGICAL_NAME = 54;

/**
 * Shorten `name` to {@link MAX_LOGICAL_NAME}, keeping a digest of the full value so two identities
 * that share a prefix cannot collide once truncated. Names already inside the budget are returned
 * untouched, so existing resources keep their logical name and are not replaced.
 */
function boundName(name: string): string {
  if (name.length <= MAX_LOGICAL_NAME) return name;
  const digest = hash("sha1", name, "hex").slice(0, 6);
  return `${name.slice(0, MAX_LOGICAL_NAME - digest.length - 1)}-${digest}`;
}

/**
 * Block the AT&T-side endpoints Tailscale would otherwise use for direct paths, so those devices
 * fall back to the peer relays.
 *
 * One rule per device per IP family — deliberately NOT one per endpoint IP. AT&T rotates these
 * addresses whenever the delegated prefix or the NAT mapping changes. While the IP was part of the
 * resource name, every rotation replaced the FirewallPolicy, UniFi minted a fresh rule id, and Home
 * Assistant's UniFi integration registered a switch entity against the new id while stranding the
 * old one as `unavailable` forever. 712 of those had piled up by 2026-08-17, which pushed the
 * HomeKit bridge past the 150-accessory HAP limit and took the whole bridge offline in Apple Home.
 *
 * Keying on the device makes an address rotation an in-place update of a stable rule: the `ips` list
 * and the port group change, the rule id does not, and Home Assistant keeps one entity per rule.
 */
export function createTailscaleAttDropFirewallRule(globals: GlobalResources) {
  const matcher = new CIDRMatcher([Tailscale.subnets.home]);
  const devices = pulumi.output(getTailscaleClient(globals)).apply(async client => {
    const devices = await client.GET("/tailnet/{tailnet}/devices", {
      params: {
        path: { tailnet: "-" },
        query: { fields: "all" },
      },
    });
    const devicesIncludingDrops: {
      device: components["schemas"]["Device"];
      ipv4IpsToDrop: DropTarget[];
      ipv6IpsToDrop: DropTarget[];
    }[] = [];
    const peerRelays: string[] = [];
    for (const device of devices.data?.devices ?? []) {
      const ipv6PortsByIp = new Map<string, Set<number>>();
      const ipv4PortsByIp = new Map<string, Set<number>>();
      const endpoints = device.clientConnectivity?.endpoints ?? [];
      for (const { ip, port } of endpoints.map(e => ({
        ip: e.substring(0, e.lastIndexOf(":")).replace("[", "").replace("]", ""),
        port: +e.substring(e.lastIndexOf(":") + 1),
      }))) {
        if (device.tags?.includes(Tailscale.tag.peerRelay) && matcher.contains(ip)) {
          peerRelays.push(ip);
          continue;
        }
        if (is_ip_private(ip)) {
          continue;
        }

        const ipDetails = await getIpDetails(ip);
        if (!ipDetails) continue;
        if (ipDetails.type !== "isp") continue;
        if (ipDetails.domain !== "att.com") continue;
        if (ipDetails.country_code !== "US") continue;

        const portsByIp = ipDetails.ip_version === "4" ? ipv4PortsByIp : ipDetails.ip_version === "6" ? ipv6PortsByIp : undefined;
        if (!portsByIp) continue;
        const ports = portsByIp.get(ip) ?? new Set<number>();
        ports.add(port);
        portsByIp.set(ip, ports);
      }
      const ipv4IpsToDrop = toDropTargets(ipv4PortsByIp);
      const ipv6IpsToDrop = toDropTargets(ipv6PortsByIp);
      if (ipv4IpsToDrop.length > 0 || ipv6IpsToDrop.length > 0) {
        devicesIncludingDrops.push({ device, ipv4IpsToDrop, ipv6IpsToDrop });
      }
    }
    return { devices: devicesIncludingDrops, peerRelays };
  });

  devices.apply(({ devices, peerRelays }) => {
    pulumi.log.info(`Found ${devices.length} Tailscale devices with AT&T IPs to drop`, globals);
    pulumi.log.info(`Found ${peerRelays.length} Tailscale devices tagged as peer relays: ${peerRelays.map(d => d).join(", ")}`, globals);
  });

  const internalZone = unifi.firewall.getZoneOutput({ name: "Internal" }, { provider: globals.unifiProvider });
  const externalZone = unifi.firewall.getZoneOutput({ name: "External" }, { provider: globals.unifiProvider });

  return devices.apply(({ devices, peerRelays }) => {
    if (peerRelays.length === 0) {
      pulumi.log.info("No peer relays found, skipping firewall rule creation", globals);
      return;
    }
    /**
     * Union the ports observed across one device's endpoints.
     *
     * Ports were previously tracked per endpoint IP. Now that a device's addresses share a single
     * rule, they share a single port group too, so a device's AT&T endpoints are all blocked on the
     * union of the ports any of them was seen using. These are BLOCK rules aimed at one device's own
     * ISP endpoints, so widening the set only drops more of what the rule exists to drop.
     */
    const unionPorts = (targets: DropTarget[]) => [...new Set(targets.flatMap(t => t.ports))].sort((a, b) => a - b).map(String);

    for (const { device, ipv4IpsToDrop, ipv6IpsToDrop } of devices) {
      if (ipv4IpsToDrop.length > 0) {
        const name = `att-tailscale-drop-ipv4-${device.hostname}`;
        const portGroup = new firewall.FirewallGroup(
          boundName(`${name}-ports`),
          {
            type: "port-group",
            members: unionPorts(ipv4IpsToDrop),
          },
          {
            provider: globals.unifiFirewallProvider,
          },
        );

        const _firewallRule = new firewall.FirewallPolicy(
          boundName(name),
          {
            enabled: true,

            action: "BLOCK", // REJECT ?
            connectionStateType: "ALL",
            protocol: "all",
            ipVersion: "IPV4",

            source: {
              zoneId: externalZone.id,
              ips: ipv4IpsToDrop.map(t => t.ip),
              portGroupId: portGroup.id,
              portMatchingType: "OBJECT",
            },
            destination: {
              zoneId: internalZone.id,
              ips: peerRelays,
              matchOppositeIps: true,
            },
            schedule: {
              mode: "ALWAYS",
            },
          },
          {
            provider: globals.unifiFirewallProvider,
            deleteBeforeReplace: true,
          },
        );
      }

      if (ipv6IpsToDrop.length > 0) {
        const name = `att-tailscale-drop-ipv6-${device.hostname}`;
        const portGroup = new firewall.FirewallGroup(
          boundName(`${name}-ports`),
          {
            type: "port-group",
            members: unionPorts(ipv6IpsToDrop),
          },
          {
            provider: globals.unifiFirewallProvider,
          },
        );

        const _firewallRule = new firewall.FirewallPolicy(
          boundName(name),
          {
            enabled: true,

            action: "BLOCK", // REJECT ?
            connectionStateType: "ALL",
            protocol: "all",
            ipVersion: "IPV6",

            source: {
              zoneId: externalZone.id,
              ips: ipv6IpsToDrop.map(t => t.ip),
              portGroupId: portGroup.id,
              portMatchingType: "OBJECT",
            },
            destination: {
              zoneId: internalZone.id,
              // TODO: peer-relays that have ipv6?
            },
            schedule: {
              mode: "ALWAYS",
            },
          },
          {
            provider: globals.unifiFirewallProvider,
            deleteBeforeReplace: true,
          },
        );
      }
    }
  });
}

interface IPInfo {
  ip: string;
  ip_version: string;
  type: string;
  company: string;
  domain: string;
  network: string;
  rir: string;
  ASN: number;
  city: string;
  country_code: string;
  state1: string;
  postcode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  abuse_contact: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  abuser_score: string;
}

async function getIpDetails(ip: string) {
  try {
    const url = `https://api.ipdetails.io/?ip=${ip}`;
    const resp = await axios.get<IPInfo>(url, { timeout: 10000 });
    return resp.data;
  } catch (_e) {
    return null;
  }
}

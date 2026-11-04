/**
 * The NetBird relay at home (docs/plans/netbird-mirror.md, D32).
 *
 * `netbirdio/relay` on celestia's Dockge host (docker/celestia/netbird-relay),
 * reached from the internet through a UniFi port forward, and listed for
 * clients by every management server (stacks/netbird-edge). It keeps relayed
 * traffic that involves a home peer off the Azure relays, whose egress is
 * metered.
 *
 * The name is private: a Technitium record (NetBird's primary nameservers)
 * pointing at the home WAN address, written by stacks/unifi-network, with no
 * public record. So its certificate is DNS-01, issued in Equestria
 * (kubernetes/apps/netbird-system/relay-home) and copied to OpenBao by
 * stacks/unifi-network, where the celestia stack reads it as files.
 *
 * Pure, so `node --test` covers it, and the one place the consumers read the
 * name, ports and paths from. The compose file cannot import it;
 * homeRelay.test.ts checks that it agrees.
 */

import { RELAY_TLS_PORT } from "./server.ts";

export const HOME_RELAY = {
  /** The relay's name under the root domain: `relay-home.<root domain>`, beside `relay-eus2` and `relay-cus`. */
  label: "relay-home",
  /** The DockgeLxc host name in the tailscale exports, whose LAN address the forward lands on. */
  dockgeHost: "dockge-celestia",
  /**
   * The public port: 443, TCP for WebSocket and UDP for QUIC. A peer relays
   * through the controlling side's own relay (client/internal/peer/worker_relay.go
   * `preferredRelayServer`, v0.82.0), so a client away from home must reach this
   * relay whenever the home peer is the controller. Networks that only let
   * 80/443 out would otherwise lose the relay path, which is the one they need.
   */
  wanPort: RELAY_TLS_PORT,
  /** The host port on celestia-dockge, TCP and UDP; 443 there is the shared Traefik's. */
  lanPort: 33443,
  /** cert-manager's Secret for the relay's certificate (kubernetes/apps/netbird-system/relay-home). */
  tlsSecret: { namespace: "netbird-system", name: "netbird-relay-home-tls" },
  /** Its copy in OpenBao's `secrets` mount, fields `tls_crt` and `tls_key`. docker/celestia/netbird-relay/tls/ reads it. */
  tlsBaoPath: "apps/netbird/relay-home-tls",
} as const;

/** `relay-home.<root domain>`. */
export function homeRelayDomain(rootDomain: string): string {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(rootDomain)) throw new Error(`'${rootDomain}' is not a bare domain`);
  return `${HOME_RELAY.label}.${rootDomain}`;
}

/** The parts of a UniFi `stat/device` entry this reads. */
export interface UnifiDevice {
  type?: string;
  name?: string;
  ip?: string;
  wan1?: { ip?: string; up?: boolean };
  uplink?: { ip?: string };
}

/** UniFi device types that are the site's gateway (UDM/UCG, USG, UXG). */
const GATEWAY_TYPES = new Set(["udm", "ugw", "uxg"]);

/**
 * A routable IPv4: not private (RFC 1918), not CGNAT (100.64/10), loopback,
 * link-local, "this network" or multicast/reserved. A gateway behind CGNAT
 * reports a 100.64/10 address, and no port forward can reach that.
 */
export function isPublicIpv4(address: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) return false;
  const [a, b, c, d] = match.slice(1).map(Number);
  if ([a, b, c, d].some(octet => octet > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

/**
 * The home WAN IPv4 from the controller's device list: the one gateway's
 * `wan1.ip`, else its uplink's, else its own address. Throws rather than
 * guess, so a bad answer fails the run instead of repointing the record.
 */
export function gatewayWanIpv4(devices: readonly UnifiDevice[]): string {
  const gateways = devices.filter(device => device.type && GATEWAY_TYPES.has(device.type));
  if (gateways.length !== 1) throw new Error(`Expected one UniFi gateway, found ${gateways.length}`);
  const [gateway] = gateways;
  const candidates = [gateway.wan1?.ip, gateway.uplink?.ip, gateway.ip].filter((ip): ip is string => Boolean(ip));
  const address = candidates.find(isPublicIpv4);
  if (!address) throw new Error(`UniFi gateway ${gateway.name ?? "(unnamed)"} reports no public IPv4 (${candidates.length} candidate address(es), none routable)`);
  return address;
}

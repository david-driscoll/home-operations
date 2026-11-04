/**
 * The NetBird relay at home (docs/plans/netbird-mirror.md, D30).
 *
 * `netbirdio/relay` on celestia's Dockge host (docker/celestia/netbird-relay),
 * reached from the internet through a UniFi port forward
 * (stacks/unifi-network/netbird-relay.ts) and listed for clients by every
 * management server (stacks/netbird-edge). It keeps relayed traffic that
 * involves a home peer off the Azure relays, whose egress is metered.
 *
 * Pure, so `node --test` covers it, and the one place the three consumers
 * read the name and ports from. The compose file cannot import it;
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
   * 443 is also what lets the relay's own Let's Encrypt (TLS-ALPN-01) work.
   */
  wanPort: RELAY_TLS_PORT,
  /** The host port on celestia-dockge, TCP and UDP; 443 there is the shared Traefik's. */
  lanPort: 33443,
} as const;

/** `relay-home.<root domain>`. */
export function homeRelayDomain(rootDomain: string): string {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(rootDomain)) throw new Error(`'${rootDomain}' is not a bare domain`);
  return `${HOME_RELAY.label}.${rootDomain}`;
}

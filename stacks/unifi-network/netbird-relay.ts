/**
 * The WAN side of the NetBird relay at home (docs/plans/netbird-mirror.md, D30).
 *
 * One port forward: WAN 443, TCP (WebSocket) and UDP (QUIC), to celestia's
 * Dockge host on 33443, where docker/celestia/netbird-relay publishes the
 * relay. UniFi opens the firewall for a port forward itself, as it does for
 * the Tailscale peer-relay forwards (components/tailscale.ts createPeerRelayRule).
 *
 * The target is the host's LAN address from the tailscale exports, the same
 * one local-dns.ts pins with a DHCP reservation, so the forward follows the
 * host if its LXC is ever recreated.
 */

import * as unifi from "@pulumiverse/unifi";
import CIDRMatcher from "cidr-matcher";
import { Tailscale } from "../../components/constants.ts";
import type { GlobalResources } from "../../components/globals.ts";
import { HOME_RELAY } from "../../components/netbird/homeRelay.ts";

export function configureNetbirdHomeRelay(globals: GlobalResources) {
  // A missing host fails the run rather than skipping: a skip would plan the
  // forward's delete, and take the relay off the internet with nothing to say why.
  const fwdIp = globals.store.getTailscaleExports().apply(exports => {
    const host = exports.flatMap(exp => exp.hosts).find(h => h.name === HOME_RELAY.dockgeHost && h.nodeType === "dockge");
    if (!host?.internalIp) throw new Error(`netbird-relay: no LAN address for ${HOME_RELAY.dockgeHost} in the tailscale exports; refusing to touch the relay's port forward`);
    if (!new CIDRMatcher([Tailscale.subnets.home]).contains(host.internalIp)) {
      throw new Error(`netbird-relay: ${HOME_RELAY.dockgeHost} is at ${host.internalIp}, outside the home LAN; the home relay's port forward cannot reach it`);
    }
    return host.internalIp;
  });

  return new unifi.port.Forward(
    "netbird-relay-home",
    {
      name: "netbird-relay-home",
      portForwardInterface: "wan",
      protocol: "tcp_udp",
      srcIp: "any",
      dstPort: `${HOME_RELAY.wanPort}`,
      fwdIp,
      fwdPort: `${HOME_RELAY.lanPort}`,
    },
    { provider: globals.unifiProvider },
  );
}

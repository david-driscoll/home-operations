/**
 * UniFi-side DNS configuration for the Technitium cluster.
 *
 * Discovers the dns-* Technitium nodes from the tailnet (same prefix collection
 * as acl-manager.ts), matches each to its dockge host via the 1Password
 * tailscale exports (which carry the host's LAN mac + internalIp, discovered by
 * DockgeLxc over Proxmox SSH), and then:
 *
 * - pins a DHCP reservation for each host on its current LAN IP, and
 * - points the Home network's DHCP DNS at those hosts, so every LAN client
 *   resolves through Technitium (ports 53/853 are published on the dockge host
 *   IPs by docker/_common/technitium/compose.yaml).
 *
 * Hosts whose internalIp is outside the Home subnet (e.g. skystar offsite) are
 * ignored — they participate in tailnet DNS only.
 */

import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as unifi from "@pulumiverse/unifi";
import CIDRMatcher from "cidr-matcher";
import { Tailscale } from "../../components/constants.ts";
import type { GlobalResources } from "../../components/globals.ts";

export async function configureLocalDns(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:unifi:LocalDns", "local-dns", {});
  const cro = { parent, provider: globals.unifiProvider };

  // dns-<cluster> tailscale machines → their dockge-<cluster> hosts from the exports
  const dnsClusterKeys = tailscale.getDevicesOutput({ namePrefix: "dns-" }, { provider: globals.tailscaleProvider }).apply(result => (result.devices ?? []).map(device => device.name.split(".")[0].replace(/^dns-/, "")));

  const dnsHosts = pulumi.all([globals.store.getTailscaleExports(), dnsClusterKeys]).apply(([allExports, clusterKeys]) => {
    const matcher = new CIDRMatcher([Tailscale.subnets.home]);
    return allExports
      .flatMap(exp => exp.hosts)
      .filter(host => host.nodeType === "dockge")
      .filter(host => clusterKeys.some(key => host.name === `dockge-${key}`))
      .filter(host => host.internalIp && matcher.contains(host.internalIp))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // The Home network itself is intentionally unmanaged (DHCP DNS was set once
  // and the pulumiverse Network resource clobbers unmodeled controller fields);
  // only the network id is needed for the reservations below.
  const homeNetwork = unifi.getNetworkOutput({ name: "Home" }, { provider: globals.unifiProvider });

  // DHCP reservations pinning each dns host to its current LAN IP. LXC recreation
  // regenerates the MAC; the next up of the exporting stack refreshes the export
  // and this reservation follows automatically.
  dnsHosts.apply(hosts =>
    hosts
      .filter(host => host.mac)
      .map(
        host =>
          new unifi.iam.User(
            `dns-host-${host.name}`,
            {
              mac: host.mac!,
              name: host.name,
              note: `Technitium DNS node host — managed by unifi-network stack`,
              fixedIp: host.internalIp!,
              networkId: homeNetwork.id,
              allowExisting: true,
              skipForgetOnDestroy: true,
            },
            cro,
          ),
      ),
  );

  return { homeNetwork };
}

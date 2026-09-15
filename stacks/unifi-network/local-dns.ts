/**
 * UniFi-side DNS configuration for the Technitium cluster.
 *
 * Discovers the tag:dns Technitium nodes from the tailnet (getDnsMachines,
 * shared with acl-manager.ts), matches each to its dockge host via the
 * 1Password tailscale exports (which carry the host's LAN mac + internalIp,
 * discovered by DockgeLxc over Proxmox SSH), and then:
 *
 * - pins a DHCP reservation for each host on its current LAN IP, and
 * - points DHCP DNS on the Home and IoT networks at the hosts whose node is
 *   currently connected to control (plus the standing internal resolvers as
 *   fallback), so clients resolve through Technitium (ports 53/853 are
 *   published on the dockge host IPs by docker/_common/technitium/compose.yaml).
 *   The stack resyncs every five minutes, so the list follows online state.
 *
 * Hosts whose internalIp is outside the Home subnet (e.g. skystar offsite, and
 * luna once it moves) are ignored — they participate in tailnet DNS only.
 *
 * DHCP DNS is applied with Purrl as a partial REST PUT on purpose: the
 * pulumiverse Network resource PUTs a schema-built body and resets controller
 * fields it does not model (is_nat, dhcpd_conflict_checking, ...), while the
 * controller merges partial PUTs safely.
 */

import * as pulumi from "@pulumi/pulumi";
import * as purrl from "@pulumiverse/purrl";
import * as unifi from "@pulumiverse/unifi";
import CIDRMatcher from "cidr-matcher";
import { dns, Tailscale } from "../../components/constants.ts";
import type { GlobalResources } from "../../components/globals.ts";
import { getDnsMachines } from "../../components/tailscale.ts";

export async function configureLocalDns(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:unifi:LocalDns", "local-dns", {});
  const cro = { parent, provider: globals.unifiProvider };

  // dns-<cluster> tailscale machines → their dockge-<cluster> hosts from the exports
  const dnsMachines = getDnsMachines(globals);

  // UniFi's dnsmasq is authoritative for driscoll.tech (the LAN domain), so any
  // name it lacks returns empty instead of falling through — publish the cluster
  // node names here so resolver chains that pass through the gateway (e.g.
  // AdGuard's [/driscoll.tech/] upstream) can reach <node>.dns.driscoll.tech.
  dnsMachines.apply(machines =>
    machines.map(
      machine =>
        new unifi.dns.Record(
          `dns-node-record-${machine.key}`,
          {
            name: `${machine.key}.dns.driscoll.tech`,
            type: "A",
            value: machine.ip,
          },
          cro,
        ),
    ),
  );

  // Every dns host on the Home subnet, online or not, keyed by cluster. The
  // reservations below use all of them; only DHCP DNS is gated on online.
  const dnsHosts = pulumi.all([globals.store.getTailscaleExports(), dnsMachines]).apply(([allExports, machines]) => {
    const matcher = new CIDRMatcher([Tailscale.subnets.home]);
    return allExports
      .flatMap(exp => exp.hosts)
      .filter(host => host.nodeType === "dockge")
      .filter(host => host.internalIp && matcher.contains(host.internalIp))
      .flatMap(host => {
        const machine = machines.find(machine => host.name === `dockge-${machine.key}`);
        return machine ? [{ ...host, online: machine.online }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // Online Technitium hosts first, standing internal resolvers as fallback,
  // capped at the controller's four DHCP DNS slots. Refuses to act when the
  // derivation is empty so a broken export can never blank out client DNS;
  // every node being offline at once is a real state, and then clients get
  // the fallback resolvers alone.
  const dhcpDns = dnsHosts.apply(hosts => {
    if (hosts.length === 0) {
      throw new Error("local-dns: no dns hosts found on the Home subnet — refusing to update DHCP DNS");
    }
    const derived = hosts.filter(host => host.online).map(host => host.internalIp!);
    return [...derived, ...dns.internalIps.filter(ip => !derived.includes(ip))].slice(0, 4);
  });

  // The networks themselves are intentionally unmanaged (the pulumiverse
  // Network resource clobbers unmodeled controller fields); only their ids are
  // needed for the reservations and targeted DHCP DNS updates below.
  const homeNetwork = unifi.getNetworkOutput({ name: "Home" }, { provider: globals.unifiProvider });
  const iotNetwork = unifi.getNetworkOutput({ name: "IoT" }, { provider: globals.unifiProvider });

  for (const [key, network] of [
    ["home", homeNetwork],
    ["iot", iotNetwork],
  ] as const) {
    new purrl.Purrl(
      `${key}-dhcp-dns`,
      {
        name: `${key} network DHCP DNS`,
        url: pulumi.interpolate`${globals.unifiCredential.hostname}/proxy/network/api/s/default/rest/networkconf/${network.id}`,
        method: "PUT",
        headers: {
          "X-API-KEY": globals.unifiCredential.credential,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: dhcpDns.apply(list =>
          JSON.stringify({
            dhcpd_dns_enabled: true,
            dhcpd_dns_1: list[0] ?? "",
            dhcpd_dns_2: list[1] ?? "",
            dhcpd_dns_3: list[2] ?? "",
            dhcpd_dns_4: list[3] ?? "",
          }),
        ),
        responseCodes: ["200"],
      },
      { parent },
    );
  }

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

  return { homeNetwork, iotNetwork };
}

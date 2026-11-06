/**
 * IPv6 on the Home LAN: the fields stacks/unifi-network owns on the Home
 * network, sent as a partial REST PUT beside its DHCP DNS (local-dns.ts, which
 * says why the networks are not pulumiverse `unifi.Network` resources).
 *
 * The WAN side already works without this: Internet 1 runs DHCPv6 and asks
 * Google Fiber for a /64 prefix delegation, and the gateway holds a public
 * IPv6 address. Until 2026-11 nothing handed that prefix to a LAN
 * (`ipv6_interface_type: none`), so no home device had IPv6, and neither did
 * the NetBird gateways that serve `exit-home`.
 *
 *   - Prefix delegation from Internet 1 (`wan`): Home takes the delegated /64.
 *     Only one network can, at that size; IoT and Guest stay IPv4-only.
 *   - SLAAC with router advertisements: every device numbers itself.
 *   - DNS is NOT the gateway's (`dhcpdv6_dns_auto: false`): the default would
 *     advertise the gateway as every client's IPv6 resolver and send queries,
 *     internal names included, around Technitium. Technitium has no IPv6
 *     address yet, so for now no IPv6 resolver is advertised at all, and
 *     clients keep resolving through Technitium over IPv4 (AAAA answers
 *     included). Its IPv6 addresses go in `dnsServers` once it has them.
 *
 * Pure, so `node --test` covers it.
 */

/** The controller's slots for IPv6 DNS servers, like DHCP's four for IPv4. */
export const IPV6_DNS_SLOTS = 4;

export interface HomeIpv6Args {
  /** Advertised IPv6 resolvers (Technitium), at most four. Empty: none advertised. */
  dnsServers: string[];
}

/** The networkconf PUT body. Only these keys: the controller merges a partial PUT and keeps the rest. */
export function homeIpv6Body(args: HomeIpv6Args): Record<string, string | boolean> {
  if (args.dnsServers.length > IPV6_DNS_SLOTS) throw new Error(`home-ipv6: ${args.dnsServers.length} IPv6 DNS servers, but the controller has ${IPV6_DNS_SLOTS} slots`);
  for (const server of args.dnsServers) {
    if (!/^[0-9a-f:]+$/i.test(server) || !server.includes(":")) throw new Error(`home-ipv6: '${server}' is not an IPv6 address`);
  }
  const slots = Object.fromEntries(Array.from({ length: IPV6_DNS_SLOTS }, (_, i) => [`dhcpdv6_dns_${i + 1}`, args.dnsServers[i] ?? ""]));
  return {
    ipv6_interface_type: "pd",
    ipv6_pd_interface: "wan",
    ipv6_pd_auto_prefixid_enabled: true,
    ipv6_client_address_assignment: "slaac",
    ipv6_ra_enabled: true,
    dhcpdv6_dns_auto: false,
    ...slots,
  };
}

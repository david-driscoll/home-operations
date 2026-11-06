/**
 * node --test stacks/unifi-network/home-ipv6.test.ts
 *
 * The partial PUT that gives the Home LAN IPv6. It must never let the gateway
 * advertise itself as the IPv6 resolver, which would route DNS around Technitium.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homeIpv6Aliases, homeIpv6Body, IPV6_DNS_SLOTS } from "./home-ipv6.ts";

describe("homeIpv6Body", () => {
  it("takes Internet 1's delegated prefix and numbers clients by SLAAC", () => {
    const body = homeIpv6Body({ dnsServers: [] });
    assert.equal(body.ipv6_interface_type, "pd");
    assert.equal(body.ipv6_pd_interface, "wan");
    assert.equal(body.ipv6_client_address_assignment, "slaac");
    assert.equal(body.ipv6_ra_enabled, true);
  });

  it("never advertises the gateway as the resolver, and with no servers advertises none", () => {
    const body = homeIpv6Body({ dnsServers: [] });
    assert.equal(body.dhcpdv6_dns_auto, false);
    for (let i = 1; i <= IPV6_DNS_SLOTS; i++) assert.equal(body[`dhcpdv6_dns_${i}`], "");
  });

  it("fills the slots in order once Technitium has addresses", () => {
    const body = homeIpv6Body({ dnsServers: ["fd00::53", "fd00::54"] });
    assert.equal(body.dhcpdv6_dns_auto, false);
    assert.equal(body.dhcpdv6_dns_1, "fd00::53");
    assert.equal(body.dhcpdv6_dns_2, "fd00::54");
    assert.equal(body.dhcpdv6_dns_3, "");
  });

  it("puts the gateway on Home's ULA range, as its only Additional IP", () => {
    assert.deepEqual(homeIpv6Aliases(), ["fd04:7815:6227:1::1/64"]);
    assert.deepEqual(homeIpv6Body({ dnsServers: [] }).ipv6_aliases, ["fd04:7815:6227:1::1/64"]);
  });

  it("refuses more servers than slots, and anything that is not IPv6", () => {
    assert.throws(() => homeIpv6Body({ dnsServers: ["fd00::1", "fd00::2", "fd00::3", "fd00::4", "fd00::5"] }), /slots/);
    assert.throws(() => homeIpv6Body({ dnsServers: ["10.10.18.4"] }), /not an IPv6 address/);
  });

  it("sends only IPv6 keys, so the controller keeps every IPv4 and DHCP setting", () => {
    for (const key of Object.keys(homeIpv6Body({ dnsServers: [] }))) assert.match(key, /ipv6|v6/, key);
  });
});

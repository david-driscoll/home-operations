/**
 * node --test images/network-map/src/normalize.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cidrsOverlap, ipInCidr, isJoinableLanIp, isTailnetAddress, normalizeHostname, normalizeIp, normalizeMac, parseCidr, toIso } from "./normalize.ts";

describe("normalizeMac", () => {
  it("lowercases with colons, whatever the separator", () => {
    for (const input of ["BC:24:11:AA:BB:CC", "bc-24-11-aa-bb-cc", "bc24.11aa.bbcc", "BC2411AABBCC", " bc:24:11:aa:bb:cc "]) {
      assert.equal(normalizeMac(input), "bc:24:11:aa:bb:cc", input);
    }
  });
  it("rejects what is not 48 bits, and the all-zero and broadcast addresses", () => {
    for (const input of ["", undefined, null, "bc:24:11:aa:bb", "bc:24:11:aa:bb:cc:dd", "zz:24:11:aa:bb:cc", "00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF"]) {
      assert.equal(normalizeMac(input), undefined, String(input));
    }
  });
});

describe("normalizeIp", () => {
  it("strips a prefix, a zone and brackets", () => {
    assert.equal(normalizeIp("10.10.10.5/24"), "10.10.10.5");
    assert.equal(normalizeIp("fe80::1%eth0"), "fe80::1");
    assert.equal(normalizeIp("[fd7a:115c:a1e0::1]"), "fd7a:115c:a1e0::1");
  });
  it("canonicalises IPv6 and IPv4 leading zeros", () => {
    assert.equal(normalizeIp("FD7A:115C:A1E0:0000:0000:0000:0000:0001"), "fd7a:115c:a1e0::1");
    assert.equal(normalizeIp("2001:db8:0:0:1:0:0:1"), "2001:db8::1:0:0:1");
    assert.equal(normalizeIp("010.010.010.005"), undefined);
    assert.equal(normalizeIp("10.10.10.5"), "10.10.10.5");
  });
  it("rejects non-addresses", () => {
    assert.equal(normalizeIp("dhcp"), undefined);
    assert.equal(normalizeIp("300.1.1.1"), undefined);
    assert.equal(normalizeIp(undefined), undefined);
  });
});

describe("CIDRs", () => {
  it("masks to the network address (UniFi's ip_subnet is the gateway)", () => {
    assert.deepEqual(parseCidr("10.10.10.1/24"), { address: "10.10.10.0", prefix: 24, cidr: "10.10.10.0/24" });
    assert.equal(parseCidr("10.10.10.7")?.cidr, "10.10.10.7/32");
    assert.equal(parseCidr("10.0.0.0/33"), undefined);
  });
  it("answers containment and overlap", () => {
    assert.ok(ipInCidr("10.10.10.200", "10.10.10.0/24"));
    assert.ok(!ipInCidr("10.10.11.1", "10.10.10.0/24"));
    assert.ok(cidrsOverlap("10.10.0.0/16", "10.10.20.0/24"));
    assert.ok(cidrsOverlap("10.10.20.0/24", "10.10.0.0/16"));
    assert.ok(!cidrsOverlap("10.10.20.0/24", "10.10.21.0/24"));
  });
  it("tells tailnet and joinable LAN addresses apart", () => {
    assert.ok(isTailnetAddress("100.101.1.1"));
    assert.ok(isTailnetAddress("fd7a:115c:a1e0::1"));
    assert.ok(!isTailnetAddress("10.10.10.1"));
    assert.ok(isJoinableLanIp("10.10.10.1"));
    assert.ok(isJoinableLanIp("192.168.1.10"));
    assert.ok(!isJoinableLanIp("172.17.0.1"), "docker0 is on every host");
    assert.ok(!isJoinableLanIp("100.101.1.1"));
  });
});

describe("normalizeHostname and toIso", () => {
  it("keeps the lowercased first label", () => {
    assert.equal(normalizeHostname("Luna.Example.Test."), "luna");
    assert.equal(normalizeHostname(""), undefined);
  });
  it("reads seconds, milliseconds and RFC 3339, and drops zero times", () => {
    assert.equal(toIso(1_700_000_000), "2023-11-14T22:13:20.000Z");
    assert.equal(toIso(1_700_000_000_000), "2023-11-14T22:13:20.000Z");
    assert.equal(toIso("2026-11-07T12:00:00Z"), "2026-11-07T12:00:00.000Z");
    assert.equal(toIso("0001-01-01T00:00:00Z"), undefined);
    assert.equal(toIso(0), undefined);
  });
});

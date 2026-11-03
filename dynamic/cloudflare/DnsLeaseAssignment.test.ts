/**
 * node --test dynamic/cloudflare/DnsLeaseAssignment.test.ts
 *
 * Pulumi writes the NetBird lease record only when config moves it, never to
 * undo the watchdog (#3001).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leaseChanged, parseCloudflareResult } from "./DnsLeaseAssignment.ts";

const lease = { zoneId: "z1", recordId: "r1", content: "203.0.113.10", holder: "azure-eus2" };

describe("leaseChanged", () => {
  it("is false on an unrelated run, whatever the live record says", () => {
    // The watchdog moved the live record; state and config still agree.
    assert.equal(leaseChanged(lease, { ...lease }), false);
  });

  it("is true when config moves the lease, or the holder's address changes", () => {
    assert.equal(leaseChanged(lease, { ...lease, holder: "azure-cus", content: "198.51.100.20" }), true);
    assert.equal(leaseChanged(lease, { ...lease, content: "203.0.113.11" }), true);
  });

  it("is true for a different record", () => {
    assert.equal(leaseChanged(lease, { ...lease, recordId: "r2" }), true);
  });
});

describe("parseCloudflareResult", () => {
  it("returns the content Cloudflare stored", () => {
    assert.deepEqual(parseCloudflareResult(200, { success: true, errors: [], result: { content: "198.51.100.20" } }), { content: "198.51.100.20" });
  });

  it("fails on an error envelope, naming Cloudflare's codes", () => {
    assert.throws(() => parseCloudflareResult(403, { success: false, errors: [{ code: 10000, message: "Authentication error" }] }), /HTTP 403: 10000 Authentication error/);
    assert.throws(() => parseCloudflareResult(200, { success: false, errors: [] }), /HTTP 200/);
    assert.throws(() => parseCloudflareResult(502, null), /HTTP 502/);
  });
});

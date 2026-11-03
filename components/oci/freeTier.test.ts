/**
 * node --test components/oci/freeTier.test.ts
 *
 * The program-time layer of the OCI free-tier guard (stacks/netbird-edge).
 * Every rejected request here is one OCI would otherwise bill for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertFreeTier, FREE_TIER, freeTierQuotaStatements, freeTierViolations } from "./freeTier.ts";

const fits = {
  shape: FREE_TIER.a1Shape,
  ocpus: 2,
  memoryInGbs: 12,
  bootVolumeSizeInGbs: 100,
  region: FREE_TIER.homeRegion,
};

describe("freeTierViolations", () => {
  it("accepts the netbird-edge VM", () => {
    assert.deepEqual(freeTierViolations(fits), []);
  });

  it("rejects a paid shape", () => {
    assert.match(freeTierViolations({ ...fits, shape: "VM.Standard.E4.Flex" }).join(), /not Always Free/);
  });

  it("rejects a region other than home", () => {
    assert.match(freeTierViolations({ ...fits, region: "us-phoenix-1" }).join(), /not the home region/);
  });

  it("rejects more A1 OCPU or memory than the 2026 allowance", () => {
    assert.match(freeTierViolations({ ...fits, ocpus: 4 }).join(), /4 OCPU exceeds/);
    assert.match(freeTierViolations({ ...fits, memoryInGbs: 24 }).join(), /24 GB exceeds/);
  });

  it("rejects boot volumes outside OCI's range", () => {
    assert.match(freeTierViolations({ ...fits, bootVolumeSizeInGbs: 250 }).join(), /exceeds the 200 GB/);
    assert.match(freeTierViolations({ ...fits, bootVolumeSizeInGbs: 20 }).join(), /below OCI's 50 GB/);
  });

  it("lists every violation, not just the first", () => {
    assert.equal(freeTierViolations({ ...fits, ocpus: 4, memoryInGbs: 24, region: "eu-frankfurt-1" }).length, 3);
  });
});

describe("assertFreeTier", () => {
  it("throws with the violations in the message", () => {
    assert.throws(() => assertFreeTier({ ...fits, ocpus: 3 }), /leaves the Always Free tier:\n {2}- 3 OCPU exceeds/);
  });
});

describe("freeTierQuotaStatements", () => {
  const statements = freeTierQuotaStatements("Xyz:US-ASHBURN-AD-1");

  it("pins every per-AD allowance to the home AD", () => {
    for (const quota of ["standard-a1-core-count", "standard-a1-memory-count", "total-storage-gb to"]) {
      const line = statements.find(s => s.startsWith("set") && s.includes(quota));
      assert.ok(line, quota);
      assert.match(line, /where request\.ad = 'Xyz:US-ASHBURN-AD-1'$/);
    }
  });

  it("zeroes before it sets, so other ADs stay at zero", () => {
    const zeroCore = statements.indexOf("zero compute-core quotas in tenancy");
    const setCore = statements.findIndex(s => s.includes("standard-a1-core-count"));
    assert.ok(zeroCore >= 0 && zeroCore < setCore);
  });

  it("never zeroes the whole vcn or block-storage family", () => {
    assert.ok(!statements.includes("zero vcn quotas in tenancy"));
    assert.ok(!statements.includes("zero block-storage quotas in tenancy"));
  });
});

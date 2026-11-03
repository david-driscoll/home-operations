/**
 * node --test components/oci/freeTier.test.ts
 *
 * The program-time layer of the OCI free-tier guard (stacks/netbird-edge).
 * Every rejected request here is one OCI would otherwise bill for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertFreeTier, BOOT_VOLUME_BACKUP_COPIES, bootVolumeBackupSchedule, FREE_TIER, freeTierQuotaStatements, freeTierViolations, retainedBackupCopies } from "./freeTier.ts";

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

  it("also allows the REGIONAL A1 counts, which `zero compute-core quotas` zeroes too", () => {
    // OCI enforces both: 2026-11-03 the VM create failed with
    // "standard-a1-core-regional-count ... exceeded by 2" with only the per-AD sets.
    assert.ok(statements.includes("set compute-core quota standard-a1-core-regional-count to 2 in tenancy where request.region = 'us-ashburn-1'"));
    assert.ok(statements.includes("set compute-memory quota standard-a1-memory-regional-count to 12 in tenancy where request.region = 'us-ashburn-1'"));
  });

  it("never zeroes the whole vcn or block-storage family", () => {
    assert.ok(!statements.includes("zero vcn quotas in tenancy"));
    assert.ok(!statements.includes("zero block-storage quotas in tenancy"));
  });
});

describe("bootVolumeBackupSchedule", () => {
  const schedule = bootVolumeBackupSchedule();

  it("keeps at most 3 boot-volume backups, inside the free 5", () => {
    assert.equal(BOOT_VOLUME_BACKUP_COPIES, 3);
    assert.ok(BOOT_VOLUME_BACKUP_COPIES <= FREE_TIER.volumeBackups);
    assert.equal(retainedBackupCopies(schedule), 3);
  });

  it("expires each backup before the fourth is taken, so the count never reaches 4", () => {
    // Exactly three periods would leave the oldest alive while the fourth runs.
    assert.ok(schedule.retentionSeconds < 3 * 7 * 86400);
    assert.ok(schedule.retentionSeconds > 2 * 7 * 86400);
  });

  it("is weekly and incremental, at a fixed UTC time", () => {
    assert.equal(schedule.period, "ONE_WEEK");
    assert.equal(schedule.backupType, "INCREMENTAL");
    assert.equal(schedule.offsetType, "STRUCTURED");
    assert.equal(schedule.timeZone, "UTC");
  });
});

describe("retainedBackupCopies", () => {
  it("counts the backups alive at the moment a new one is taken", () => {
    assert.equal(retainedBackupCopies({ period: "ONE_DAY", retentionSeconds: 86400 * 5 }), 5);
    assert.equal(retainedBackupCopies({ period: "ONE_DAY", retentionSeconds: 86400 * 5 + 1 }), 6);
    assert.equal(retainedBackupCopies({ period: "ONE_WEEK", retentionSeconds: 86400 * 20 }), 3);
  });

  it("assumes the shortest month, so a monthly schedule is never undercounted", () => {
    assert.equal(retainedBackupCopies({ period: "ONE_MONTH", retentionSeconds: 86400 * 85 }), 4);
  });

  it("refuses a period it does not know", () => {
    assert.throws(() => retainedBackupCopies({ period: "FORTNIGHTLY", retentionSeconds: 1 }), /FORTNIGHTLY/);
  });
});

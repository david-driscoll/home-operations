/**
 * node --test components/oci/alarms.test.ts
 *
 * The OCI Monitoring alarms on the netbird-edge VM (#2884): the instance
 * stopping (reclaimed, crashed or shut down) and the memory ballast failing,
 * which is what leaves an idle Always Free VM open to reclamation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { instanceAlarms, RECLAMATION_THRESHOLD_PERCENT } from "./alarms.ts";

const id = "ocid1.instance.oc1.iad.example";

describe("instanceAlarms", () => {
  const alarms = instanceAlarms(id);

  it("reads the compute agent's metrics for exactly this instance", () => {
    for (const alarm of Object.values(alarms)) {
      assert.equal(alarm.namespace, "oci_computeagent");
      assert.ok(alarm.query.includes(`{resourceId = "${id}"}`), alarm.query);
    }
  });

  it("fires on a stopped instance: its metrics stop arriving", () => {
    assert.equal(alarms.stopped.query, `CpuUtilization[1m]{resourceId = "${id}"}.absent()`);
    assert.equal(alarms.stopped.severity, "CRITICAL");
    assert.equal(alarms.stopped.pendingDuration, "PT5M");
  });

  it("fires when memory sits under the reclamation threshold for a whole hour", () => {
    assert.equal(RECLAMATION_THRESHOLD_PERCENT, 20);
    assert.equal(alarms.lowMemory.query, `MemoryUtilization[1h]{resourceId = "${id}"}.max() < 20`);
    assert.equal(alarms.lowMemory.pendingDuration, "PT1H");
  });

  it("uses OCI's duration format, which caps pending at an hour", () => {
    for (const alarm of Object.values(alarms)) {
      assert.match(alarm.pendingDuration, /^PT([1-9]|[1-5][0-9])M$|^PT1H$/);
      assert.match(alarm.repeatNotificationDuration, /^PT\d+[MH]$/);
    }
  });

  it("refuses an id that would break out of the query string", () => {
    assert.throws(() => instanceAlarms('ocid1.instance"} || x'), /instance id/);
  });
});

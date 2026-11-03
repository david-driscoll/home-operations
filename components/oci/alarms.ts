/**
 * OCI Monitoring alarms for an Always Free instance (#2884,
 * docs/plans/netbird-mirror.md §D).
 *
 * Pure, so `node --test` covers the queries. The metrics come from the
 * Compute Instance Monitoring agent plugin OciFreeTierInstance enables; alarms
 * on them are inside the Always Free Monitoring allowance.
 */

/**
 * OCI reclaims an idle Always Free instance when CPU, network AND memory all
 * sit under 20% (7-day p95). The memory ballast (stacks/netbird-edge
 * cloudInit.ts) is what keeps memory above it, so memory under it means the
 * ballast stopped.
 */
export const RECLAMATION_THRESHOLD_PERCENT = 20;

export interface InstanceAlarm {
  namespace: "oci_computeagent";
  /** MQL. */
  query: string;
  severity: "CRITICAL" | "ERROR" | "WARNING" | "INFO";
  /** How long the condition must hold before the alarm fires. OCI accepts PT1M..PT1H. */
  pendingDuration: string;
  /** Re-sends while still firing. */
  repeatNotificationDuration: string;
  summary: string;
}

/** The two alarms, keyed by what they catch. */
export function instanceAlarms(instanceId: string): { stopped: InstanceAlarm; lowMemory: InstanceAlarm } {
  if (!/^[A-Za-z0-9._-]+$/.test(instanceId)) throw new Error(`instance id '${instanceId}' is not an OCID`);
  const dims = `{resourceId = "${instanceId}"}`;
  return {
    // A stopped instance (idle reclamation stops it; so does a crash or a
    // shutdown) reports nothing, and absent() turns that silence into a
    // firing alarm. It also fires while Pulumi replaces the VM.
    stopped: {
      namespace: "oci_computeagent",
      query: `CpuUtilization[1m]${dims}.absent()`,
      severity: "CRITICAL",
      pendingDuration: "PT5M",
      repeatNotificationDuration: "PT6H",
      summary: "The netbird-edge VM has reported no metrics for 5 minutes: stopped, reclaimed or down.",
    },
    // max() over each hour: memory never once reached the threshold, so the
    // ballast is not running. Reclamation judges a 7-day p95, so an hour or
    // two of lag still leaves days to fix it.
    lowMemory: {
      namespace: "oci_computeagent",
      query: `MemoryUtilization[1h]${dims}.max() < ${RECLAMATION_THRESHOLD_PERCENT}`,
      severity: "WARNING",
      pendingDuration: "PT1H",
      repeatNotificationDuration: "PT24H",
      summary: `netbird-edge memory has stayed under ${RECLAMATION_THRESHOLD_PERCENT}% for an hour: the ballast is down and OCI may reclaim the idle VM.`,
    },
  };
}

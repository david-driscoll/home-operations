/**
 * CrossGuard pack: keeps stacks/netbird-edge inside the OCI Always Free tier
 * (docs/plans/netbird-mirror.md §D, guard 2; issue #2882).
 *
 * Every rule in checks.ts becomes one mandatory stack policy, so a violation
 * fails `pulumi preview` (and the preview `pulumi up` runs first) before OCI
 * is asked for anything. Each rule is its own policy so a value one rule
 * cannot read does not skip the others.
 *
 * Run it against the live stack from the repo root, with PULUMI_BACKEND_URL
 * and the other backend variables set as in
 * kubernetes/apps/pulumi/netbird-edge/stack.yaml:
 *
 *   fnox exec -- sh -c 'cd stacks/netbird-edge && pulumi preview --stack netbird-edge --policy-pack ../../policies/oci-free-tier'
 *
 * CI cannot do that (the backend and OpenBao are tailnet-only). It runs
 * `node --test policies/oci-free-tier/checks.test.ts` and smoke-test.sh.
 * Neither can the in-cluster Pulumi operator: v2.10.0 has no policy-pack
 * support, so its `up` on merge skips this pack. Preview with it first.
 */
import { PolicyPack, type ReportViolation, type StackValidationArgs } from "@pulumi/policy";
import { FREE_TIER_CHECKS, type FreeTierCheck, isUnknownValueError } from "./checks.ts";

function validateStack(check: FreeTierCheck) {
  return (args: StackValidationArgs, reportViolation: ReportViolation): void => {
    try {
      for (const v of check.check(args.resources)) reportViolation(v.message, v.urn);
    } catch (e) {
      // CrossGuard's default for an unknown value is to downgrade the policy
      // to advisory and move on. For a billing guard that is fail-open, so a
      // value nobody can read during preview is a violation instead.
      if (!isUnknownValueError(e)) throw e;
      reportViolation(`cannot verify during preview: ${e.message}. Make the value known, or preview again once it is.`);
    }
  };
}

new PolicyPack("oci-free-tier", {
  enforcementLevel: "mandatory",
  policies: FREE_TIER_CHECKS.map(check => ({
    name: check.name,
    description: check.description,
    enforcementLevel: "mandatory" as const,
    validateStack: validateStack(check),
  })),
});

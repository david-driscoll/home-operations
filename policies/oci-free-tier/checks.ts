/**
 * The OCI free-tier rules as pure functions over a stack's resources, so
 * `node --test` can drive them with fake resource arrays. index.ts wraps each
 * one as a mandatory CrossGuard stack policy.
 *
 * Numbers come from components/oci/freeTier.ts, the one place the allowance
 * is written down. These checks add the cross-resource totals that a single
 * component cannot see: two VMs at 2 OCPU each pass the component and fail
 * here.
 */
import { FREE_TIER, FREE_TIER_SHAPES, freeTierQuotaStatements } from "components/oci/freeTier.ts";

/** Type tokens, read from @pulumi/oci 5.5.1's `__pulumiType`. */
export const OCI_TYPES = {
  instance: "oci:Core/instance:Instance",
  volume: "oci:Core/volume:Volume",
  bootVolume: "oci:Core/bootVolume:BootVolume",
  publicIp: "oci:Core/publicIp:PublicIp",
  loadBalancer: "oci:LoadBalancer/loadBalancer:LoadBalancer",
  volumeBackupPolicy: "oci:Core/volumeBackupPolicy:VolumeBackupPolicy",
  volumeBackupPolicyAssignment: "oci:Core/volumeBackupPolicyAssignment:VolumeBackupPolicyAssignment",
  volumeBackup: "oci:Core/volumeBackup:VolumeBackup",
  bootVolumeBackup: "oci:Core/bootVolumeBackup:BootVolumeBackup",
  quota: "oci:Limits/quota:Quota",
} as const;

/** The subset of CrossGuard's `PolicyResource` these checks read. */
export interface PolicyResourceLike {
  type: string;
  name: string;
  urn?: string;
  props: Record<string, any>;
  opts?: { deleteBeforeReplace?: boolean };
  propertyDependencies?: Record<string, PolicyResourceLike[]>;
}

export interface Violation {
  message: string;
  urn?: string;
}

export interface FreeTierCheck {
  name: string;
  description: string;
  check(resources: readonly PolicyResourceLike[]): Violation[];
}

/** OCI's size for a block volume created without `sizeInGbs`: 1 TB. */
const DEFAULT_BLOCK_VOLUME_GB = 1024;
/** Assumed when a boot size is unset; OCI's default image boot volume is just under it. */
const DEFAULT_BOOT_VOLUME_GB = FREE_TIER.minBootVolumeGb;
/** Backup periods in seconds. A month is 28 days, the shortest, so copies round up. */
const PERIOD_SECONDS: Record<string, number> = {
  ONE_HOUR: 3_600,
  ONE_DAY: 86_400,
  ONE_WEEK: 604_800,
  ONE_MONTH: 28 * 86_400,
  ONE_YEAR: 365 * 86_400,
};

const ofType = (resources: readonly PolicyResourceLike[], type: string) => resources.filter(r => r.type === type);

/**
 * A property as a number. Provider outputs carry sizes as strings ("100").
 * Unset is `fallback`; anything unreadable throws, and the throw becomes a
 * violation, so a value the pack cannot read never passes.
 */
function numberProp(r: PolicyResourceLike, path: string, value: unknown, fallback?: number): number {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${r.name}: ${path} is not set`);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${r.name}: ${path} is not a number (${JSON.stringify(value)})`);
  return n;
}

/** Runs `body`; a throw becomes a violation on `r` instead of a crashed pack. */
function guarded(violations: Violation[], r: PolicyResourceLike, body: () => void): void {
  try {
    body();
  } catch (e) {
    if (isUnknownValueError(e)) throw e;
    violations.push({ message: e instanceof Error ? e.message : String(e), urn: r.urn });
  }
}

/**
 * CrossGuard's preview-time "value not known yet" error, which pack.ts turns
 * into a violation. Matched by name: @pulumi/policy ships no type for it.
 */
export function isUnknownValueError(e: unknown): e is Error {
  return e instanceof Error && e.constructor.name === "UnknownValueError";
}

const a1Allowance: FreeTierCheck = {
  name: "oci-a1-allowance",
  description: `Ampere A1 instances together stay within ${FREE_TIER.a1Ocpus} OCPU and ${FREE_TIER.a1MemoryGb} GB.`,
  check(resources) {
    const violations: Violation[] = [];
    let ocpus = 0;
    let memoryGb = 0;
    for (const r of ofType(resources, OCI_TYPES.instance)) {
      if (r.props.shape !== FREE_TIER.a1Shape) continue;
      guarded(violations, r, () => {
        const shapeConfig = r.props.shapeConfig;
        if (!shapeConfig) throw new Error(`${r.name}: an A1 instance must set shapeConfig.ocpus and shapeConfig.memoryInGbs explicitly`);
        ocpus += numberProp(r, "shapeConfig.ocpus", shapeConfig.ocpus);
        memoryGb += numberProp(r, "shapeConfig.memoryInGbs", shapeConfig.memoryInGbs);
      });
    }
    if (ocpus > FREE_TIER.a1Ocpus) violations.push({ message: `${ocpus} OCPU of A1 instances exceeds the Always Free ${FREE_TIER.a1Ocpus}` });
    if (memoryGb > FREE_TIER.a1MemoryGb) violations.push({ message: `${memoryGb} GB of A1 memory exceeds the ${FREE_TIER.a1MemoryGb} GB Always Free allowance` });
    return violations;
  },
};

const instanceShapes: FreeTierCheck = {
  name: "oci-instance-shapes",
  description: `Every instance uses an Always Free shape (${FREE_TIER_SHAPES.join(", ")}).`,
  check(resources) {
    return ofType(resources, OCI_TYPES.instance)
      .filter(r => !FREE_TIER_SHAPES.includes(r.props.shape))
      .map(r => ({ message: `${r.name}: shape ${r.props.shape} is not Always Free (allowed: ${FREE_TIER_SHAPES.join(", ")})`, urn: r.urn }));
  },
};

const blockStorage: FreeTierCheck = {
  name: "oci-block-storage",
  description: `Boot and block volumes together stay within ${FREE_TIER.blockStorageGb} GB.`,
  check(resources) {
    const violations: Violation[] = [];
    let totalGb = 0;
    for (const r of ofType(resources, OCI_TYPES.instance)) {
      guarded(violations, r, () => {
        const source = r.props.sourceDetails;
        // Booting from an existing boot volume creates none; that volume is
        // counted below if this stack owns it.
        if (String(source?.sourceType ?? "").toLowerCase() === "bootvolume") return;
        totalGb += numberProp(r, "sourceDetails.bootVolumeSizeInGbs", source?.bootVolumeSizeInGbs, DEFAULT_BOOT_VOLUME_GB);
      });
    }
    for (const r of ofType(resources, OCI_TYPES.bootVolume)) {
      guarded(violations, r, () => {
        totalGb += numberProp(r, "sizeInGbs", r.props.sizeInGbs, DEFAULT_BOOT_VOLUME_GB);
      });
    }
    for (const r of ofType(resources, OCI_TYPES.volume)) {
      guarded(violations, r, () => {
        const mbs = r.props.sizeInMbs;
        const gb = r.props.sizeInGbs ?? (mbs ? numberProp(r, "sizeInMbs", mbs) / 1024 : undefined);
        totalGb += numberProp(r, "sizeInGbs", gb, DEFAULT_BLOCK_VOLUME_GB);
      });
    }
    if (totalGb > FREE_TIER.blockStorageGb) {
      violations.push({ message: `${totalGb} GB of boot and block volumes exceeds the ${FREE_TIER.blockStorageGb} GB Always Free allowance` });
    }
    return violations;
  },
};

const reservedPublicIps: FreeTierCheck = {
  name: "oci-reserved-public-ips",
  description: `At most ${FREE_TIER.reservedPublicIps} RESERVED public IP.`,
  check(resources) {
    const reserved = ofType(resources, OCI_TYPES.publicIp).filter(r => String(r.props.lifetime).toUpperCase() === "RESERVED");
    if (reserved.length <= FREE_TIER.reservedPublicIps) return [];
    return [{ message: `${reserved.length} RESERVED public IPs exceed the Always Free ${FREE_TIER.reservedPublicIps} (${reserved.map(r => r.name).join(", ")})` }];
  },
};

const loadBalancers: FreeTierCheck = {
  name: "oci-load-balancers",
  description: `At most ${FREE_TIER.loadBalancers} load balancer, flexible at ${FREE_TIER.loadBalancerMbps}/${FREE_TIER.loadBalancerMbps} Mbps.`,
  check(resources) {
    const violations: Violation[] = [];
    const lbs = ofType(resources, OCI_TYPES.loadBalancer);
    const mbps = FREE_TIER.loadBalancerMbps;
    for (const r of lbs) {
      guarded(violations, r, () => {
        if (r.props.shape !== "flexible") throw new Error(`${r.name}: shape ${r.props.shape} is not the free one (flexible, ${mbps}/${mbps} Mbps)`);
        const details = r.props.shapeDetails;
        const min = numberProp(r, "shapeDetails.minimumBandwidthInMbps", details?.minimumBandwidthInMbps);
        const max = numberProp(r, "shapeDetails.maximumBandwidthInMbps", details?.maximumBandwidthInMbps);
        if (min !== mbps || max !== mbps) throw new Error(`${r.name}: ${min}/${max} Mbps is not the free ${mbps}/${mbps} Mbps`);
      });
    }
    if (lbs.length > FREE_TIER.loadBalancers) violations.push({ message: `${lbs.length} load balancers exceed the Always Free ${FREE_TIER.loadBalancers}` });
    return violations;
  },
};

/** Copies a policy keeps per volume: each schedule retains retention / period backups. */
function policyCopies(r: PolicyResourceLike): number {
  let copies = 0;
  for (const [i, schedule] of (r.props.schedules ?? []).entries()) {
    const period = PERIOD_SECONDS[schedule.period];
    if (!period) throw new Error(`${r.name}: schedules[${i}].period ${schedule.period} is not a known backup period`);
    copies += Math.ceil(numberProp(r, `schedules[${i}].retentionSeconds`, schedule.retentionSeconds) / period);
  }
  return copies;
}

const backupRetention: FreeTierCheck = {
  name: "oci-backup-retention",
  description: `Retained volume backups stay within the Always Free ${FREE_TIER.volumeBackups}.`,
  check(resources) {
    const violations: Violation[] = [];
    const policies = ofType(resources, OCI_TYPES.volumeBackupPolicy);
    const assignments = ofType(resources, OCI_TYPES.volumeBackupPolicyAssignment);
    let total = ofType(resources, OCI_TYPES.volumeBackup).length + ofType(resources, OCI_TYPES.bootVolumeBackup).length;

    for (const policy of policies) {
      guarded(violations, policy, () => {
        const assigned = assignments.filter(a => (a.propertyDependencies?.policyId ?? []).some(d => d.urn === policy.urn)).length;
        // Unassigned still counts once: it exists to be assigned.
        total += policyCopies(policy) * Math.max(assigned, 1);
      });
    }
    for (const a of assignments) {
      const own = (a.propertyDependencies?.policyId ?? []).some(d => d.type === OCI_TYPES.volumeBackupPolicy);
      if (!own) {
        violations.push({
          message: `${a.name}: assigns a backup policy not defined in this stack; Oracle's gold/silver/bronze keep more than ${FREE_TIER.volumeBackups} backups`,
          urn: a.urn,
        });
      }
    }
    if (total > FREE_TIER.volumeBackups) violations.push({ message: `${total} retained volume backups exceed the Always Free ${FREE_TIER.volumeBackups}` });
    return violations;
  },
};

const instanceDeleteBeforeReplace: FreeTierCheck = {
  name: "oci-instance-delete-before-replace",
  description: "Every instance sets deleteBeforeReplace, so a replacement never runs alongside the original.",
  check(resources) {
    return ofType(resources, OCI_TYPES.instance)
      .filter(r => r.opts?.deleteBeforeReplace !== true)
      .map(r => ({ message: `${r.name}: deleteBeforeReplace is not set; create-before-delete briefly runs two instances, over the allowance`, urn: r.urn }));
  },
};

const AD_PIN = /request\.ad = '([^']+)'/;

const quotaAllowlist: FreeTierCheck = {
  name: "oci-quota-allowlist",
  description: "The tenancy quota is exactly freeTierQuotaStatements(<the instances' AD>), so the admin key cannot loosen it.",
  check(resources) {
    const quotas = ofType(resources, OCI_TYPES.quota);
    if (quotas.length !== 1) return [{ message: `the stack must hold exactly one ${OCI_TYPES.quota}, found ${quotas.length} (the free-tier allow-list)` }];
    const quota = quotas[0];
    const actual: string[] = [...(quota.props.statements ?? [])];

    const instanceAds = [...new Set(ofType(resources, OCI_TYPES.instance).map(r => String(r.props.availabilityDomain)))];
    if (instanceAds.length > 1) return [{ message: `instances span ${instanceAds.length} availability domains (${instanceAds.join(", ")}); the quota pins one`, urn: quota.urn }];
    const ad = instanceAds[0] ?? actual.map(s => AD_PIN.exec(s)?.[1]).find(Boolean);
    if (!ad) return [{ message: `${quota.name}: no statement pins an availability domain`, urn: quota.urn }];

    const expected = freeTierQuotaStatements(ad);
    if (actual.length === expected.length && actual.every((s, i) => s === expected[i])) return [];
    const missing = expected.filter(s => !actual.includes(s));
    const unexpected = actual.filter(s => !expected.includes(s));
    const detail = [...missing.map(s => `missing: ${s}`), ...unexpected.map(s => `unexpected: ${s}`)];
    if (detail.length === 0) detail.push("same statements, different order");
    return [{ message: `${quota.name}: statements differ from freeTierQuotaStatements('${ad}'):\n  ${detail.join("\n  ")}`, urn: quota.urn }];
  },
};

export const FREE_TIER_CHECKS: readonly FreeTierCheck[] = [a1Allowance, instanceShapes, blockStorage, reservedPublicIps, loadBalancers, backupRetention, instanceDeleteBeforeReplace, quotaAllowlist];

/** Every violation across every check, tagged with the check's name. */
export function freeTierStackViolations(resources: readonly PolicyResourceLike[]): (Violation & { policy: string })[] {
  return FREE_TIER_CHECKS.flatMap(c => c.check(resources).map(v => ({ ...v, policy: c.name })));
}

/**
 * OCI Always Free limits and the checks that keep stacks/netbird-edge inside
 * them (docs/plans/netbird-mirror.md §D).
 *
 * Plain TypeScript with no Pulumi imports, so `node --test` can exercise it.
 * Three layers enforce these numbers: this module at program time, the OCI
 * quota policy rendered by `freeTierQuotaStatements` server-side, and the
 * budget alert for anything that still costs money.
 */

/**
 * The tenancy's Always Free allowance.
 *
 * Ampere A1 was cut from 4 OCPU / 24 GB to 2 OCPU / 12 GB in mid-2026
 * ("1,500 OCPU hours and 9,000 GB hours"). Always Free compute exists only in
 * the home region. Block storage is 200 GB across boot and block volumes, with
 * 5 volume backups.
 */
export const FREE_TIER = {
  homeRegion: "us-ashburn-1",
  a1Shape: "VM.Standard.A1.Flex",
  a1Ocpus: 2,
  a1MemoryGb: 12,
  blockStorageGb: 200,
  volumeBackups: 5,
  reservedPublicIps: 1,
  vcns: 2,
  minBootVolumeGb: 50,
} as const;

/** Shapes that cost nothing on an Always Free tenancy. */
export const FREE_TIER_SHAPES: readonly string[] = [FREE_TIER.a1Shape, "VM.Standard.E2.1.Micro"];

export interface FreeTierInstanceRequest {
  shape: string;
  ocpus: number;
  memoryInGbs: number;
  bootVolumeSizeInGbs: number;
  region: string;
}

/**
 * Every reason `request` would leave the free tier. Empty means it fits.
 *
 * Checks one instance against the whole allowance. Totals across several
 * instances are the CrossGuard pack's job (#2882).
 */
export function freeTierViolations(request: FreeTierInstanceRequest): string[] {
  const violations: string[] = [];
  if (!FREE_TIER_SHAPES.includes(request.shape)) {
    violations.push(`shape ${request.shape} is not Always Free (allowed: ${FREE_TIER_SHAPES.join(", ")})`);
  }
  if (request.region !== FREE_TIER.homeRegion) {
    violations.push(`region ${request.region} is not the home region ${FREE_TIER.homeRegion}; Always Free compute exists only there`);
  }
  if (request.shape === FREE_TIER.a1Shape) {
    if (request.ocpus > FREE_TIER.a1Ocpus) violations.push(`${request.ocpus} OCPU exceeds the A1 allowance of ${FREE_TIER.a1Ocpus}`);
    if (request.memoryInGbs > FREE_TIER.a1MemoryGb) violations.push(`${request.memoryInGbs} GB exceeds the A1 allowance of ${FREE_TIER.a1MemoryGb} GB`);
  }
  if (request.bootVolumeSizeInGbs > FREE_TIER.blockStorageGb) {
    violations.push(`${request.bootVolumeSizeInGbs} GB boot volume exceeds the ${FREE_TIER.blockStorageGb} GB block storage allowance`);
  }
  if (request.bootVolumeSizeInGbs < FREE_TIER.minBootVolumeGb) {
    violations.push(`${request.bootVolumeSizeInGbs} GB boot volume is below OCI's ${FREE_TIER.minBootVolumeGb} GB minimum`);
  }
  return violations;
}

/** Throws with every violation listed, so a preview fails before OCI is asked. */
export function assertFreeTier(request: FreeTierInstanceRequest): void {
  const violations = freeTierViolations(request);
  if (violations.length > 0) {
    throw new Error(`OCI request leaves the Always Free tier:\n  - ${violations.join("\n  - ")}`);
  }
}

/**
 * The tenancy quota policy: an allow-list for the families that cost money.
 *
 * `zero` names one quota, never a whole family. Zeroing a family also zeroes
 * quotas this stack depends on but cannot enumerate (subnets, gateways, NSGs
 * in the vcn family). The A1 and block-storage quotas are per availability
 * domain, and an unpinned `set … to 2` allows 2 in EACH of Ashburn's three
 * ADs, so every per-AD statement names `homeAd`.
 */
export function freeTierQuotaStatements(homeAd: string): string[] {
  const ad = `request.ad = '${homeAd}'`;
  const region = `request.region = '${FREE_TIER.homeRegion}'`;
  return [
    "zero compute-core quotas in tenancy",
    "zero compute-memory quotas in tenancy",
    `set compute-core quota standard-a1-core-count to ${FREE_TIER.a1Ocpus} in tenancy where ${ad}`,
    `set compute-memory quota standard-a1-memory-count to ${FREE_TIER.a1MemoryGb} in tenancy where ${ad}`,
    "zero block-storage quota total-storage-gb in tenancy",
    `set block-storage quota total-storage-gb to ${FREE_TIER.blockStorageGb} in tenancy where ${ad}`,
    `set block-storage quota backup-count to ${FREE_TIER.volumeBackups} in tenancy where ${region}`,
    `set vcn quota vcn-count to ${FREE_TIER.vcns} in tenancy where ${region}`,
    `set vcn quota reserved-public-ip-count to ${FREE_TIER.reservedPublicIps} in tenancy where ${region}`,
  ];
}

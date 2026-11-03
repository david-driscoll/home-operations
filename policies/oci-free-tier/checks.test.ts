/**
 * node --test policies/oci-free-tier/checks.test.ts
 *
 * The stack-level layer of the OCI free-tier guard. The fixture is the real
 * stacks/netbird-edge shape; every negative case is a change that would
 * either bill the tenancy or loosen the quota that stops it being billed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FREE_TIER, freeTierQuotaStatements } from "components/oci/freeTier.ts";
import { FREE_TIER_CHECKS, freeTierStackViolations, OCI_TYPES, type PolicyResourceLike } from "./checks.ts";

const AD = "Xyz:US-ASHBURN-AD-1";

function resource(type: string, name: string, props: Record<string, unknown>, opts: PolicyResourceLike["opts"] = {}): PolicyResourceLike {
  return { type, name, urn: `urn:pulumi:netbird-edge::netbird-edge::${type}::${name}`, props, opts };
}

function a1Instance(name: string, overrides: Record<string, unknown> = {}, opts: PolicyResourceLike["opts"] = { deleteBeforeReplace: true }): PolicyResourceLike {
  return resource(
    OCI_TYPES.instance,
    name,
    {
      availabilityDomain: AD,
      shape: FREE_TIER.a1Shape,
      shapeConfig: { ocpus: 2, memoryInGbs: 12 },
      sourceDetails: { sourceType: "image", sourceId: "ocid1.image.oc1..ubuntu", bootVolumeSizeInGbs: "100" },
      ...overrides,
    },
    opts,
  );
}

const quota = (statements: string[] = freeTierQuotaStatements(AD)) => resource(OCI_TYPES.quota, "free-tier", { compartmentId: "ocid1.tenancy.oc1..t", name: "free-tier-allowlist", statements });
const reservedIp = (name: string) => resource(OCI_TYPES.publicIp, name, { lifetime: "RESERVED", compartmentId: "c" });

/** What `pulumi preview` hands the pack for stacks/netbird-edge today. */
const netbirdEdge: PolicyResourceLike[] = [
  resource("pulumi:pulumi:Stack", "netbird-edge-netbird-edge", {}),
  quota(),
  resource("oci:Budget/budget:Budget", "zero-spend", { amount: 1 }),
  resource("oci:Identity/compartment:Compartment", "netbird", { name: "netbird" }),
  resource("oci:Core/vcn:Vcn", "netbird", { cidrBlocks: ["10.250.0.0/16"] }),
  resource("custom:oci:FreeTierInstance", "netbird-edge", {}),
  a1Instance("netbird-edge"),
  reservedIp("netbird-edge-public"),
];

const without = (r: PolicyResourceLike) => netbirdEdge.filter(x => x !== r);
const messages = (resources: PolicyResourceLike[]) => freeTierStackViolations(resources).map(v => `${v.policy}: ${v.message}`);

describe("the real netbird-edge stack", () => {
  it("passes every check", () => {
    assert.deepEqual(messages(netbirdEdge), []);
  });

  it("registers one named, described check per rule", () => {
    const names = FREE_TIER_CHECKS.map(c => c.name);
    assert.equal(new Set(names).size, names.length);
    for (const c of FREE_TIER_CHECKS) assert.ok(c.description.length > 20, c.name);
  });
});

describe("A1 allowance", () => {
  it("rejects one 4 OCPU instance", () => {
    assert.match(messages([...without(netbirdEdge[6]), a1Instance("netbird-edge", { shapeConfig: { ocpus: 4, memoryInGbs: 12 } })]).join("\n"), /oci-a1-allowance: .*4 OCPU.*exceeds.*2/);
  });

  it("sums across instances", () => {
    const half = { shapeConfig: { ocpus: 1, memoryInGbs: 8 } };
    const out = messages([...without(netbirdEdge[6]), a1Instance("a", half), a1Instance("b", half)]).join("\n");
    assert.match(out, /16 GB of A1 memory exceeds the 12 GB/);
    assert.doesNotMatch(out, /OCPU/);
  });

  it("rejects an A1 instance with no explicit shape config", () => {
    assert.match(messages([...without(netbirdEdge[6]), a1Instance("netbird-edge", { shapeConfig: undefined })]).join("\n"), /oci-a1-allowance: .*netbird-edge.*shapeConfig/);
  });
});

describe("instance shapes", () => {
  it("rejects a paid shape", () => {
    const out = messages([...without(netbirdEdge[6]), a1Instance("netbird-edge", { shape: "VM.Standard.E4.Flex" })]).join("\n");
    assert.match(out, /oci-instance-shapes: .*VM\.Standard\.E4\.Flex is not Always Free/);
  });

  it("accepts the E2 micro shape", () => {
    const micro = a1Instance("micro", { shape: "VM.Standard.E2.1.Micro", shapeConfig: undefined, sourceDetails: { sourceType: "image", bootVolumeSizeInGbs: "50" } });
    assert.deepEqual(messages([...netbirdEdge, micro]), []);
  });
});

describe("block storage", () => {
  it("rejects an oversized block volume next to the boot volume", () => {
    const volume = resource(OCI_TYPES.volume, "data", { availabilityDomain: AD, sizeInGbs: "150" });
    assert.match(messages([...netbirdEdge, volume]).join("\n"), /oci-block-storage: 250 GB of boot and block volumes exceeds the 200 GB/);
  });

  it("counts a volume with no size as OCI's 1 TB default", () => {
    const volume = resource(OCI_TYPES.volume, "data", { availabilityDomain: AD });
    assert.match(messages([...netbirdEdge, volume]).join("\n"), /1124 GB/);
  });

  it("counts standalone boot volumes and an instance's default boot size", () => {
    const bootVolume = resource(OCI_TYPES.bootVolume, "spare", { availabilityDomain: AD, sizeInGbs: "60" });
    const micro = a1Instance("micro", { shape: "VM.Standard.E2.1.Micro", shapeConfig: undefined, sourceDetails: { sourceType: "image" } });
    // 100 (netbird-edge) + 60 + 50 (default) = 210.
    assert.match(messages([...netbirdEdge, bootVolume, micro]).join("\n"), /210 GB/);
  });

  it("does not count an instance booted from an existing boot volume twice", () => {
    const bootVolume = resource(OCI_TYPES.bootVolume, "spare", { availabilityDomain: AD, sizeInGbs: "100" });
    const fromVolume = a1Instance("netbird-edge", { sourceDetails: { sourceType: "bootVolume", sourceId: "ocid1.bootvolume..x" } });
    assert.deepEqual(messages([...without(netbirdEdge[6]), fromVolume, bootVolume]), []);
  });
});

describe("reserved public IPs", () => {
  it("rejects a second reserved IP", () => {
    assert.match(messages([...netbirdEdge, reservedIp("second")]).join("\n"), /oci-reserved-public-ips: 2 RESERVED public IPs exceed the Always Free 1/);
  });

  it("ignores ephemeral IPs", () => {
    const ephemeral = resource(OCI_TYPES.publicIp, "ephemeral", { lifetime: "EPHEMERAL" });
    assert.deepEqual(messages([...netbirdEdge, ephemeral]), []);
  });
});

describe("load balancers", () => {
  const lb = (name: string, props: Record<string, unknown>) => resource(OCI_TYPES.loadBalancer, name, { compartmentId: "c", displayName: name, ...props });
  const free = { shape: "flexible", shapeDetails: { minimumBandwidthInMbps: 10, maximumBandwidthInMbps: 10 } };

  it("accepts one flexible 10/10 Mbps load balancer", () => {
    assert.deepEqual(messages([...netbirdEdge, lb("edge", free)]), []);
  });

  it("rejects a wider or fixed-shape load balancer", () => {
    assert.match(messages([...netbirdEdge, lb("edge", { shape: "flexible", shapeDetails: { minimumBandwidthInMbps: 10, maximumBandwidthInMbps: 100 } })]).join("\n"), /oci-load-balancers: .*edge.*10\/100 Mbps/);
    assert.match(messages([...netbirdEdge, lb("edge", { shape: "100Mbps" })]).join("\n"), /oci-load-balancers: .*edge.*shape 100Mbps/);
  });

  it("rejects a second load balancer", () => {
    assert.match(messages([...netbirdEdge, lb("a", free), lb("b", free)]).join("\n"), /2 load balancers exceed/);
  });
});

describe("backup retention", () => {
  const DAY = 86_400;
  const policy = (name: string, schedules: Record<string, unknown>[]) => resource(OCI_TYPES.volumeBackupPolicy, name, { compartmentId: "c", schedules });

  it("accepts a user-defined policy keeping 3 daily copies (the plan's boot-volume policy)", () => {
    const p = policy("boot", [{ backupType: "INCREMENTAL", period: "ONE_DAY", retentionSeconds: 3 * DAY }]);
    assert.deepEqual(messages([...netbirdEdge, p]), []);
  });

  it("rejects retention beyond 5 copies", () => {
    const p = policy("boot", [{ backupType: "INCREMENTAL", period: "ONE_DAY", retentionSeconds: 7 * DAY }]);
    assert.match(messages([...netbirdEdge, p]).join("\n"), /oci-backup-retention: 7 retained volume backups exceed the Always Free 5/);
  });

  it("adds schedules, assignments and manual backups together", () => {
    const p = policy("boot", [
      { backupType: "INCREMENTAL", period: "ONE_DAY", retentionSeconds: 2 * DAY },
      { backupType: "FULL", period: "ONE_WEEK", retentionSeconds: 7 * DAY },
    ]);
    const assign = (name: string) => ({ ...resource(OCI_TYPES.volumeBackupPolicyAssignment, name, { assetId: "a", policyId: "p" }), propertyDependencies: { policyId: [p] } });
    const manual = resource(OCI_TYPES.bootVolumeBackup, "before-upgrade", { bootVolumeId: "b" });
    // (2 + 1) copies x 2 assignments + 1 manual = 7.
    assert.match(messages([...netbirdEdge, p, assign("x"), assign("y"), manual]).join("\n"), /7 retained volume backups/);
  });

  it("rejects assigning a policy this stack does not define (Oracle's gold/silver/bronze)", () => {
    const assign = { ...resource(OCI_TYPES.volumeBackupPolicyAssignment, "bronze", { assetId: "a", policyId: "ocid1.volumebackuppolicy.oc1..bronze" }), propertyDependencies: { policyId: [] } };
    assert.match(messages([...netbirdEdge, assign]).join("\n"), /oci-backup-retention: .*bronze.*not defined in this stack/);
  });
});

describe("delete-before-replace", () => {
  it("rejects an instance without deleteBeforeReplace", () => {
    assert.match(messages([...without(netbirdEdge[6]), a1Instance("netbird-edge", {}, {})]).join("\n"), /oci-instance-delete-before-replace: .*netbird-edge.*deleteBeforeReplace/);
  });

  it("rejects deleteBeforeReplace: false", () => {
    assert.match(messages([...without(netbirdEdge[6]), a1Instance("netbird-edge", {}, { deleteBeforeReplace: false })]).join("\n"), /deleteBeforeReplace/);
  });
});

describe("quota allow-list", () => {
  it("rejects an edited statement and names both sides", () => {
    const edited = freeTierQuotaStatements(AD).map(s => s.replace("standard-a1-core-count to 2", "standard-a1-core-count to 4"));
    const out = messages([...without(netbirdEdge[1]), quota(edited)]).join("\n");
    assert.match(out, /oci-quota-allowlist: .*unexpected: set compute-core quota standard-a1-core-count to 4/s);
    assert.match(out, /missing: set compute-core quota standard-a1-core-count to 2/);
  });

  it("rejects a dropped statement", () => {
    const out = messages([...without(netbirdEdge[1]), quota(freeTierQuotaStatements(AD).slice(1))]).join("\n");
    assert.match(out, /missing: zero compute-core quotas in tenancy/);
  });

  it("rejects an added statement", () => {
    const out = messages([...without(netbirdEdge[1]), quota([...freeTierQuotaStatements(AD), "set vcn quota vcn-count to 50 in tenancy"])]).join("\n");
    assert.match(out, /unexpected: set vcn quota vcn-count to 50/);
  });

  it("rejects statements pinned to a different AD than the instance", () => {
    const out = messages([...without(netbirdEdge[1]), quota(freeTierQuotaStatements("Xyz:US-ASHBURN-AD-2"))]).join("\n");
    assert.match(out, /oci-quota-allowlist: .*unexpected: .*US-ASHBURN-AD-2/s);
  });

  it("rejects a stack with no quota at all", () => {
    assert.match(messages(without(netbirdEdge[1])).join("\n"), /oci-quota-allowlist: .*exactly one oci:Limits\/quota:Quota, found 0/);
  });

  it("rejects instances spread over two ADs", () => {
    const other = a1Instance("micro", { availabilityDomain: "Xyz:US-ASHBURN-AD-2", shape: "VM.Standard.E2.1.Micro", shapeConfig: undefined, sourceDetails: { sourceType: "image", bootVolumeSizeInGbs: "50" } });
    assert.match(messages([...netbirdEdge, other]).join("\n"), /oci-quota-allowlist: instances span 2 availability domains/);
  });

  it("checks the quota's own AD pin when the stack has no instance", () => {
    const noVm = netbirdEdge.filter(r => r.type !== OCI_TYPES.instance);
    assert.deepEqual(messages(noVm), []);
    const loosened = freeTierQuotaStatements(AD).map(s => s.replace(` where request.ad = '${AD}'`, ""));
    assert.match(messages([...noVm.filter(r => r.type !== OCI_TYPES.quota), quota(loosened)]).join("\n"), /oci-quota-allowlist:/);
  });
});

describe("unreadable values", () => {
  it("fails closed when a number cannot be read", () => {
    const out = messages([...without(netbirdEdge[6]), a1Instance("netbird-edge", { shapeConfig: { ocpus: "lots", memoryInGbs: 12 } })]).join("\n");
    assert.match(out, /oci-a1-allowance: .*netbird-edge.*ocpus/);
  });

  it("lets CrossGuard's unknown-value error through for pack.ts to report", () => {
    class UnknownValueError extends Error {}
    const shapeConfig = {
      get ocpus(): number {
        throw new UnknownValueError("number value at .shapeConfig.ocpus can't be known during preview");
      },
      memoryInGbs: 12,
    };
    const a1 = FREE_TIER_CHECKS.find(c => c.name === "oci-a1-allowance");
    assert.ok(a1);
    assert.throws(() => a1.check([a1Instance("netbird-edge", { shapeConfig })]), UnknownValueError);
  });
});

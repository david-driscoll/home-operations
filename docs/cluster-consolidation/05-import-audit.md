# 05 — Import audit (E)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). Self-contained
— no prior context assumed.

**One-line goal:** every permanent `import:` resource option in the Pulumi
tree is either proven safe or removed, before the DNS-heavy phases
([09](09-mqtt-ntp-renumber-ip-audit.md), [13](13-stage-sgc-apps.md)–[15](
15-migrate-apps.md), [21](21-repo-consolidation-flux-repoint.md)) put real
weight on this code path. Small piece, most of the actual risk turns out to
already be closed.

**As-of date for every live-code claim below: 2026-08-13.**

---

## What this audit was worried about

Pulumi's `import` resource option adopts a pre-existing resource into state
instead of creating a new one. It's dangerous specifically when combined
with `deleteBeforeReplace: true` and an id that doesn't match cleanly: a
replace plan destroys the live resource first, then re-imports — and if the
supplied id can never exactly equal what the provider stores back in state,
every subsequent run re-plans the same replace. Two live outages in this
repo are exactly that shape:

- **Cloudflare**, 2026-07-25: the DNS record provider's import id is
  `<zoneId>/<recordId>`, but state stores the bare `<recordId>`. Combined
  with `deleteBeforeReplace`, this wiped all 56 managed DNS records — twice
  — before being fixed.
- **UniFi**, discovered 2026-07-28: same shape, id is `<site>:<recordId>`
  vs. bare `<recordId>` in state. A record created with no import id, then
  re-created on the next run with one supplied by a live lookup, planned a
  replace-by-import that turned into delete-then-adopt. Nine records were
  destroyed before the pattern was understood.

Both are recorded in project memory
(`standarddns-cloudflare-import-outage`, `standarddns-unifi-import-armed-
deletes`) and both live in the same file, `components/StandardDns.ts`. The
July discovery comments (v2 §1.9, v2.1 §10 item 7) flagged this file plus
the Pulumi state Minio bucket (`stacks/home/index.ts`) as the two places
carrying a permanent `import:` and asked for both to be audited before this
migration leans on DNS management heavily.

---

## 1. `components/StandardDns.ts` — already fixed, verify it stays that way

**Current state, read directly from the file today:** both DNS-record
imports are structurally inert.

```ts
// components/StandardDns.ts:58 — inside the static create() factory
const unifiId = undefined;
// components/StandardDns.ts:71
const cloudflareId = undefined;
```

These two constants are the *only* values ever passed into the private
constructor's `unifiId`/`cloudflareId` parameters, which in turn feed:

```ts
// unifi.dns.Record, :119-120
{ deleteBeforeReplace: true, import: args.unifiId }
// cloudflare.DnsRecord, :155-156, :160
{ deleteBeforeReplace: true, import: args.cloudflareId, ignoreChanges: ["zoneId"] }
```

`StandardDns.create()` is the only public entry point (the constructor
itself is private), and its public signature
(`{ hostname, ipAddress?, type, record? }`) doesn't expose an id parameter
at all — there is no code path today by which a caller can thread a live
UniFi or Cloudflare record id into either `import:` option. Both landed as
deliberate fixes, **before** the July 29 discovery comment that flagged the
pattern as live:

| Fix | PR | Date |
|---|---|---|
| Cloudflare — stop adopting via `import` | #582 | 2026-07-25 |
| UniFi — stop adopting via `import` | #605 | 2026-07-28 |

Both PRs left extensive inline comments explaining exactly why (the id
mismatch, the specific outage counts — 45/45 healthy vs. 9 destroyed for
UniFi, "wiped all 56 managed records twice" for Cloudflare) and why a
future collision with an existing record should be handled by **reusing the
Pulumi resource name** so it becomes a same-name replacement rather than an
import, "same as the technitium record in `components/DockgeLxc.ts`."

**So the acute half of item E is already closed, and has been since before
the plan that asks for it was written.** Nothing further to do here to make
it safe today.

**Residual, non-blocking risk:** the *shape* is still wired up — the private
constructor still accepts `unifiId`/`cloudflareId` and still threads them
into `import:` + `deleteBeforeReplace: true`. A future change to
`StandardDns.ts` that adds an id-supplying code path (say, to handle a
genuine collision) could re-arm the exact bug if it doesn't read the
comments already sitting right above the line it's editing. Cheap
follow-up, not required for this piece to close: delete the dead
`unifiId`/`cloudflareId` parameters entirely, since `create()` is the sole
caller and always passes `undefined` — that turns "landmine with a warning
sign taped to it" into "no wire to step on." Fold into whichever PR next
touches this file; don't open a dedicated one just for this.

---

## 2. `stacks/home/index.ts` — the Minio state bucket import is still live

```ts
// stacks/home/index.ts:33-44
const _minioBucket = new minio.S3Bucket(
  `home-operations-minio-bucket`,
  { acl: "private", bucket: pulumi.interpolate`home-operations` },
  {
    provider: globals.truenasMinioProvider,
    protect: true,
    retainOnDelete: true,
    import: "home-operations",
  },
);
```

Unlike the DNS records, this `import:` is a **literal string**, not a
variable that can go inert — it is evaluated on every single run, for the
life of this resource in state.

**It is also meaningfully less dangerous than the DNS pattern was, by
construction:** this resource does **not** set `deleteBeforeReplace`.
Pulumi's default replace ordering is create-before-delete, and more to the
point, `protect: true` refuses *any* operation that would delete the
resource outright — including one a bad replace plan might otherwise
attempt — until someone runs `pulumi state unprotect` by hand first. The DNS
records that got wiped never had `protect: true`; they only had
`deleteBeforeReplace: true`, which is what let a bad plan execute
destroy-then-recreate without a human in the loop. So the failure mode that
hit `StandardDns.ts` twice cannot silently repeat here — the worst case is
the run fails loudly with a protect-resource error, not a silent live
delete.

**What's still genuinely unverified**, per v2.1 §10 item 7: *"whether
`import: "home-operations"` re-imports on every run"* — i.e., whether the
bucket-name-as-id happens to line up with what the Minio provider stores
back in state (likely, since S3-style bucket names typically **are** their
own id, unlike a DNS record's synthetic id), or whether it behaves like the
DNS case and perpetually plans something on every diff.

**Verification method — not yet executed as part of authoring this plan.**
This requires live OpenBao/Minio credentials this authoring session doesn't
have reachable; treat it as the first concrete step when this piece is
executed, not a finding already in hand:

1. Run `pulumi preview` on `stacks/home` twice in a row, with nothing else
   changing state in between.
2. Diff the two resource-operation lists for the `home-operations-minio-
   bucket` resource specifically. A clean *single* preview does not prove
   safety — the same class of bug (Cloudflare's id-format mismatch) can
   produce a plan that looks clean once and then re-triggers on the next
   run once the prior "import" step lands in state.
3. If the second preview still shows any planned change on that resource
   beyond a genuine drift (e.g. an ACL edit), that's the danger sign — stop
   and treat it exactly like the DNS cases: reuse the resource name instead
   of an id-based import, or drop `import:` once the resource is
   confirmed already tracked in state (it has been since this stack's
   first successful `up`, per `retainOnDelete: true` implying it predates
   any destroy).

**Recommendation regardless of what the two-preview test finds:** add a
short comment next to this resource, mirroring `StandardDns.ts`'s, stating
*why* `protect: true` is there and pointing at the two DNS incidents — so a
future edit doesn't casually drop `protect` without knowing what it's
standing in for.

---

## 3. Should the bucket stay a Pulumi resource once the backend moves?

[04 — Pulumi state backend](04-pulumi-state-backend.md) moves Pulumi's own
state backend off this bucket onto Postgres DIY on celestia (decision D2).
Once that lands, the `home-operations` bucket stops being any stack's active
backend (today all ten `Stack` CRs share it —
`s3://home-operations/<stack>?endpoint=truenas.driscoll.tech:9000&...`,
confirmed across every `kubernetes/apps/pulumi/*/stack.yaml`) and becomes
purely the versioned `stack export` archive, per the "Expansion v2" discovery
comment's own recommendation (its §3, "Backend": *"keep the Minio bucket as a
periodic `pulumi stack export` archive for all stacks, plus off-box
replication to B2"*).

**Recommendation: keep it as a Pulumi-managed resource, don't hand it off
to be manually created.** Three reasons:

1. `protect` + `retainOnDelete` are exactly the guardrails an archive
   bucket wants, and they only stay enforced — and drift-checked — while
   Pulumi manages the resource.
2. Making it unmanaged doesn't remove the "does this exist correctly"
   question at all; it just moves that check outside Pulumi's own audit
   trail, which is a worse place for it given this repo's stated
   preference for provider-managed infra over hand-run state.
3. The discovery comment's other recommendation — **enable bucket
   versioning** — is only expressible as Pulumi config if the resource
   stays managed. Confirmed the provider supports this as a separate
   resource (`@pulumi/minio`'s Terraform-derived shape,
   `minio.S3BucketVersioning`, taking `bucket` + `versioningConfiguration:
   { status: "Enabled" }`); add one alongside the bucket, same `protect`
   posture.

---

## 4. Sequencing

Not drawn as a dependency in the [README's sequencing diagram](
README.md#sequencing) — it doesn't block anything structurally. Recommend
completing it before:

- [04 — Pulumi state backend](04-pulumi-state-backend.md), since that's the
  moment the bucket's role changes and a natural checkpoint to also land the
  versioning addition.
- [09](09-mqtt-ntp-renumber-ip-audit.md), [13](13-stage-sgc-apps.md)–[15](
  15-migrate-apps.md), [21](21-repo-consolidation-flux-repoint.md) — the
  DNS-heavy phases this audit exists to de-risk in the first place.

## Deliverables

1. Two-consecutive-preview verification of `stacks/home`'s Minio bucket
   import (§2) — run it, record the diff, close v2.1 §10 item 7 for real.
2. A short "why `protect: true`" comment on the bucket resource.
3. `minio.S3BucketVersioning` added for the `home-operations` bucket.
4. Optional, low-priority cleanup: drop the dead `unifiId`/`cloudflareId`
   parameters from `StandardDns`'s private constructor (§1) — fold into any
   future touch of that file, not worth a standalone PR.

## See also

- [README.md](README.md) — decision ledger, full sequencing
- [03 — secrets bootstrap independence](03-secrets-bootstrap-independence.md)
- [04 — Pulumi state backend](04-pulumi-state-backend.md)

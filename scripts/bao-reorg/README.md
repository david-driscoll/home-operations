# bao-reorg

Executes the `secrets/shared/*` reorganisation decided in
[`docs/openbao-shared-secrets-reorg.md`](../../docs/openbao-shared-secrets-reorg.md).

```sh
npx tsx scripts/bao-reorg --preflight             # what the ACLs need. No credentials required.
scripts/bao-reorg/run.sh --phase 1                # plan
scripts/bao-reorg/run.sh --phase 1 --apply --copy # write destinations, keep sources
npx tsx scripts/bao-reorg/rewrite.ts              # what the repo edits would be
npx tsx scripts/bao-reorg/rewrite.ts --apply
scripts/bao-reorg/run.sh --verify --copy          # destinations present?
scripts/bao-reorg/run.sh --phase 1 --apply        # ... after the merge: reap the sources
```

| File | Role |
| --- | --- |
| `plan.ts` | The reorganisation as data. 146 entries — every path live under `shared/`. |
| `index.ts` | Drives the KV side. Delegates copies to `../bao-move.ts`. |
| `rewrite.ts` | Rewrites repo references from the same plan. |
| `run.sh` | Credentials wrapper. **Use it instead of `mise run vals-run`** — see below. |

## Why `run.sh` and not `mise run vals-run`

`vals-run` resolves EVERY `ref+` value in the environment in one pass and fails
the run if any of them 404s. `.config/mise.toml` names three of the paths this
reorganisation moves — the Minio credentials, the Pulumi passphrase and the
1Password Connect token. So from the moment the repo rewrite lands until phase 3
has run, `vals-run` cannot start at all:

```
expand openbao://secrets/third-party-tokens/onepassword/eris-connect#/credential:
  no secret found for path "secrets/data/third-party-tokens/onepassword/eris-connect"
```

That is a deadlock, not a bug: `vals-run` is how you get credentials to run the
migration, and the migration is what creates the paths `vals-run` now wants.

`run.sh` resolves the OpenBao AppRole out of `.config/bao-approle.sops.yaml` and
nothing else, so it is immune to the state of the thing it is migrating. It
re-execs itself under plain `mise exec` first — which sets the `[env]` values as
literals and resolves nothing — for `SOPS_AGE_KEY_FILE` and node on PATH.

Once phase 3 has run, `vals-run` works again and either is fine.

`plan.ts` is the single source of truth for both sides on purpose: a move whose
consumers were not rewritten is an outage, and a rewrite with no move behind it
is a 404. Neither shows up until something needs the credential.

## Read this before phase 3

**`eso-<cluster>` cannot read the new prefixes.** The policy the vault repo
writes is exactly:

```hcl
path "secrets/data/shared/*"       { capabilities = ["read"] }
path "secrets/metadata/shared/*"   { capabilities = ["read", "list"] }
path "secrets/data/clusters/*"     { capabilities = ["read"] }
path "secrets/metadata/clusters/*" { capabilities = ["read", "list"] }
```

A trailing `*` is a prefix glob and spans `/`, so everything landing under
`clusters/` is already covered — that is all of phase 2 and all of phase 4.
Phase 3 introduces `third-party-tokens/`, `apps/` and `docker/`, which **no ESO
policy grants**. Running it early does not fail here: the `pulumi` AppRole holds
`secrets/*` and writes happily. It fails later, as ~30 ExternalSecrets flip to
`SecretSyncedError` at their next refresh — up to an hour after the change, with
nothing in the commit to point at.

So `--phase 3` refuses to run without `--policies-widened`. Get the HCL from
`--preflight`, add it to `write_policies()` in the vault repo's
`bootstrap/openbao/equestria-init.sh`, apply it with a root ceremony, then pass
the flag to assert it happened.

`retired/` is deliberately absent from that grant: nothing reads a retired
secret, which is what makes it retired.

Pulumi needs nothing — the `pulumi` policy is `secrets/*`. Neither do the Dockge
`.env` files: they are resolved by the Pulumi-side `vals` pass in `DockgeLxc`,
under that same AppRole, never on the host.

## Order of operations

Per phase, and the order is not negotiable:

1. **Phase 3 only** — widen the `eso-*` policies (root ceremony).
2. `bao-reorg --phase N --apply --copy` — writes the new paths and **leaves the
   old ones alone**. Both spellings resolve from here on.
3. Merge the repo change (the `rewrite.ts` output).
4. Reconcile, then verify:
   - `kubectl get externalsecret -A` — every one `SecretSynced`
   - `mise run vals-run -- pulumi preview` on the touched stacks
   - `bao-reorg --verify --copy` — every destination present
5. `bao-reorg --phase N --apply` — same command without `--copy`. `bao-move`
   finds each destination already matching, reports `SAME`, and destroys the
   source.

**Step 2 must use `--copy`.** Without it the source is destroyed the moment the
copy verifies, which puts every consumer of the old path — a live cluster still
reconciling the pre-merge manifests — into `SecretSyncedError` for the whole
window between the move and the merge. With `--copy` that window has both
spellings live and nothing to race.

Step 5 is not optional either: two paths holding one credential is exactly the
drift the reorganisation exists to remove, and nothing tells you which one a
rotation updated. `--verify` (without `--copy`) fails while any source survives.

## What each operation does

**move** — delegates to `bao-move.ts --move`, which refuses to clobber a
destination holding different data and reads the destination back before
destroying the source. `dropFields` prunes stray fields *after* that verify, so
an interruption leaves the destination with too much rather than too little.

**retire** — the same move, into `retired/<slug>`. Used for the 60 paths with no
consumer anywhere: all still at version 1 with `updated_time` 2026-08-08, i.e.
written once by `op-to-bao --apply` and never read. Parking rather than
destroying means a wrong call is one `bao-move` away from being undone.

**delete** — `bao kv metadata delete`: every version plus metadata, no undo.
Reserved for SGC-era paths (piece 22 is deleting the thing they describe) and
for paths verified dead at the console.

**split** — `shared/media-management-secrets`, nineteen fields read by six
ExternalSecrets across two namespaces, becomes one path per app. Each
destination gets a single `credential` field; the source field name only ever
meant "which of the nineteen is this", and the path answers that now. The source
is **left in place** — unlike a move there is no single destination to read back
— and goes by hand once `spike-management-credentials` is confirmed unchanged.

## Things that bit, or nearly did

- **`shared/eris-ssh-key` was marked RETIRE and is not dead.** Namespace
  `stargate-command` runs *on equestria*; `home-assistant-ssh` is live,
  SecretSynced and mounted by the HelmRelease. It is a move now. Every other
  retirement was checked the same way — grep the repo, then check the live
  ExternalSecret — and the rest hold.
- **`rewrite.ts`'s leading regex guard must not exclude `/`.** With
  `(?<![\w/-])`, `key: shared/x` matched and `ref+openbao://secrets/shared/x`
  did not — half the estate silently untouched, and the run still reports
  success. It is `(?<![\w-])`.
- **The trailing guard must stay.** Without `(?![\w-])`, `shared/n8n` also
  matches inside `shared/n8n-api-key`, which is a different secret going
  somewhere else.
- **Title-addressed Pulumi reads cannot be rewritten.** `resolveBaoPath` derives
  the path from a 1Password title at runtime, so no file contains it. They live
  in `TITLE_PATHS` in `components/store/bao.ts`, which is now exhaustive — an
  unlisted title is an error rather than a derived `shared/` path that 404s.
  `rewrite.ts` prints every plan entry with no textual hit so this stays
  visible.
- **Removing `docker/alpha-site/prometheus-exporters/` does not stop the
  container.** Deleting a Dockge stack directory removes
  `/opt/stacks/<stack>/` and leaves the container running, orphaned, with
  `restart: unless-stopped` and autoheal resurrecting it. After the Pulumi run:

  ```sh
  ssh alpha-site 'docker rm -f adguard-exporter'
  ```

# Phase 6 — equestria ESO cutover: the inventory

> **Moved here from `david-driscoll/vault` on 2026-08-22.** This is a historical record of
> the 1Password → OpenBao migration, kept verbatim. "This repo" / "the vault repo" in the
> text below refers to `david-driscoll/vault` as it was at the time; the `bootstrap/` and
> `docs/openbao-migration/` paths it names now resolve inside home-operations, and its
> `stacks/vault` is now `stacks/vault` here. The vault repo's own code (`components/store`,
> its parity script) was a trimmed copy of this repo's and was not carried over.

What has to move, what cannot, and in what order. Written 2026-08-09 by resolving every
reference against the **live** OpenBao rather than against `mapping.yaml`, because that
file predates the Phase 8a generated families and understates readiness badly.

`PLAN.md` §G is the design. `STATUS.md` is the running state. This file is the worksheet.

---

## Status: PHASE 6 COMPLETE (2026-08-10)

**Zero live ExternalSecrets declare `onepassword-connect`, and exactly one
`OnePasswordItem` CR remains estate-wide.** Both halves are done.

The 21 convertible CRs were converted, merged and applied as five PRs:

| # | Scope | CRs | PR |
|---|---|---|---|
| 1 | `equestria` namespace (`shared/secrets` + `pvr/dispatcharr`) | 6 | equestria-cluster#3099 |
| 2 | `github-actions` runners | 3 | equestria-cluster#3100 |
| 3 | `network` + `cert-manager` | 7 | equestria-cluster#3101 |
| 4 | `tailscale-system` operator | 1 | equestria-cluster#3102 |
| 5 | `pulumi` namespace (defined in home-operations) | 4 | home-operations#709 |

`pulumi/pulumi-operator-passphrase` stays — bootstrap-tier — and is now the **last
OnePasswordItem in the estate**, which is why Phase 11 cannot remove `onepassword-connect`
from equestria.

Post-rollout verification (secret ownership, sha256 value parity against OpenBao, consumer
health, and why the two external-dns errors were pre-existing rather than caused) is in
`STATUS.md` under "Phase 6 — the OnePasswordItem CRs are done".

### What the conversion had to get right

1. **The 1Password Operator SANITISES Secret keys and OpenBao does not.** A field named
   `valid from` or `one-time password` reaches OpenBao verbatim, and a space is not a legal
   Kubernetes Secret key — so a bare `extract` makes the API server reject the **entire**
   Secret. Four paths need `rewrite: [^-._a-zA-Z0-9] -> -`, which reproduces the operator's
   own output (`valid-from`) exactly. The repo's usual `[\W] -> _` would have worked too but
   silently renamed the key.
2. **The operator invents a `website` key** from the item's URL. A URL is not a field, so
   Phase 4 never migrated it and three Secrets lose it — `unifi-credentials`, `dispatcharr`,
   `truenas-home-operations`. Confirmed unread by every pod, every `valuesFrom`, every
   `secretKeyRef` and every manifest in all four repos before dropping it.
3. **The substitution `itemPath`s were deleted, not translated.** `${CLOUDFLARE_SECRET}` and
   `${CLOUDFLARE_TUNNEL_SECRET}` are now literal `shared/…` paths in the manifest. Carrying
   a variable across is what broke dynacat: the reader cannot tell a 1Password item path
   from an OpenBao path. Both variables are now unreferenced outside their sops definitions.
4. **The old Secret is operator-OWNED, so it dies with the CR.** All 22 carry an
   `ownerReferences` entry pointing at their CR. Flux applies then prunes, the Secret is
   garbage-collected, and ESO recreates it — so expect a few seconds of absence and one
   transient `SecretSyncedError` per conversion. Env-var consumers do not notice; the
   volume-mounted ones (`crowdsec-secret`, `authentik-secret`, `pulumi-operator-github`)
   re-project on the next kubelet sync.
5. **`mapping.yaml` resolves the UUID-addressed CRs**, but titles surprise you: the CR named
   `unifi-credentials` addresses an item titled *Unifi Discord*, and
   `truenas-home-operations` addresses *minio root user*. Resolve by UUID, never by the CR's
   own name.

Parity was proved by script before any file was written: for each CR, fetch the live
OpenBao fields, apply the modelled rewrite, and diff against the live Secret's keys. The
only differences it reported are the three `website` drops and one gained `omdb_apikey`.

The rest of this document is the inventory as it stood when the phase began, kept because
the method and the traps are what carry over to Phase 7 (SGC).

## Headline (as of 2026-08-09)

| | Count | Verdict |
|---|---|---|
| ExternalSecrets declaring `onepassword-connect` | 93 | see the store breakdown below |
| …that actually read only from 1Password | **78** | the real Phase 6 scope |
| `OnePasswordItem` CRs | 22 | **21 convertible**, 1 stays |
| References needing a policy widening | **0** | — |

All 93 ExternalSecrets are currently `SecretSynced`, so this is a migration of working
things — any breakage is ours.

The zero in that table is the pleasant surprise. The concern going in was that
`eso-equestria` grants only `secrets/shared/*` and `secrets/clusters/equestria/*`, with no
`secrets/hosts/*` (verified: 403). **Nothing in the 93 references a host path**, so the
policy needs no change.

---

## `secretStoreRef` lies — check `sourceRef` too

93 ExternalSecrets *declare* `secretStoreRef: onepassword-connect`, but a `dataFrom`/`data`
entry can override the store per-reference with `sourceRef.storeRef`. Counting the effective
store:

| Effective store(s) | Count |
|---|---|
| `onepassword-connect` only | **78** |
| mixed — 1P plus `cluster` / `database` / `network` | 12 |
| never touches 1Password (vestigial `secretStoreRef`) | **3** |

So the top-level field overstates the scope by 15. `equestria/autobrr-oidc` is the clearest
example: it declares `onepassword-connect` and then reads everything from
`ClusterSecretStore/cluster`. Repointing it would change nothing.

The 12 mixed ones need care — they can be moved, but only the 1Password-sourced references
change, and the others must be left alone.

---

## The components live in TWO repos

`kubernetes/components/` exists in **both** `equestria-cluster` and `home-operations`, and
**16 equestria Kustomizations source from the home-operations copy**:

```
ks equestria/dynacat -> GitRepository/flux-system/home-operations  path=./dashboard
```

Editing only the cluster repo's copy moved 38 of 39 volsync ExternalSecrets and left
`dynacat` behind — with a Kustomization that had reconciled perfectly, which is what made
it confusing. Both copies need the same edit.

`home-operations/kubernetes/components/` has exactly two 1Password-backed components:
`volsync` and `alerts/github-status`. The second is the 17-namespace
`github-status-token`, so **it has a twin as well** and will hit this again.

**"grep the cluster repo" under-reports Phase 6 scope.** Check both.

## Two replicated components account for a third of the count

They look like many small migrations and are actually two:

- **`github-status-token`** — one manifest at
  `kubernetes/components/alerts/github-status/externalsecret.yaml`, replicated into
  **17 namespaces**. Every "single-secret namespace" (`cert-manager`, `cloudnative-pg`,
  `coder`, `system-upgrade`, …) contains only this. Editing it moves 17 at once.
- **`*-volsync`** — ~25 in `equestria`, every one extracting the same `Volsync Password`.

That kills the "start with the single-secret namespaces" idea from the first draft of this
document: those namespaces have nothing *but* the shared component, so there is no small
first step there.

---

## How readiness was decided

Title-matching against `mapping.yaml` gives the wrong answer. It reports 13 references as
unmapped that are in fact present in OpenBao, because the ExternalSecrets name **unprefixed**
keys while the 1Password items are **cluster-prefixed**:

```
ExternalSecret observability/grafana-secret   keys: grafana-postgres
1Password item                                title: equestria-grafana-postgres
OpenBao                                       path: secrets/clusters/equestria/apps/grafana/postgres
```

So each key was resolved by deriving candidate paths and asking the server which exists:

1. `mapping.yaml` entry for the key, if not skipped
2. `mapping.yaml` entry for `equestria-<key>` — the prefixed twin
3. `<app>-oidc-credentials` → `clusters/equestria/apps/<app>/oidc` (Phase 8a)
4. `<app>-postgres` → `clusters/equestria/apps/<app>/postgres`
5. `shared/<slug(key)>`

Rules 3 and 4 are the ones `mapping.yaml` cannot know about — those paths are written by
the Pulumi stacks, not by `op-to-bao`.

---

## The 4 ExternalSecrets that stay on 1Password

Every one is a deliberate estate decision, not a gap. **These are not Phase 6 work** and
should not be counted against it.

| ExternalSecret | Blocking key | Why it stays |
|---|---|---|
| `database/postgres-backup-config` | `Backblaze S3 Equestria Database` | B2/Backblaze excluded from migration (estate decision 2026-08-07) |
| `database/postgres-values` | `Backblaze S3 Equestria Database` | same |
| `tailscale-system/tailscale-resources-secret` | `Backblaze S3 Equestria` | same |
| `equestria/dynacat-env` | `Celestia PBS Backup User`, `Luna PBS backup user`, `GitHub Personal Access Token` | hand-created PBS items are out of Phase 8a scope (2026-08-08); the PAT is personal-scope and PLAN §G keeps it on 1Password |

`dynacat-env` is the awkward one: it pulls **17 keys**, of which 14 are ready and 3 are not.
It cannot be split without splitting the Secret, so it stays whole on `onepassword-connect`
until those three families are resolved. Worth revisiting rather than forcing.

---

## The 22 OnePasswordItem CRs

*(Converted 2026-08-10 — see the status block at the top for the PR split and what the
conversion had to get right. This section is the inventory as it stood beforehand.)*

These have no OpenBao equivalent — the 1Password Operator is a parallel mechanism — so each
becomes an ExternalSecret. 21 of 22 resolve into `secrets/shared/*`, all within policy.

The exception:

| CR | Item | Why it cannot move |
|---|---|---|
| `pulumi/pulumi-operator-passphrase` | `Pulumi Passphrase` | `PULUMI_CONFIG_PASSPHRASE` is bootstrap-tier per INVENTORY §2 — Pulumi must decrypt its own state before it can read anything, so it can never come from OpenBao. Move it to SOPS alongside the AppRole, or leave it. |

Four CRs address their item by **UUID** rather than title (`7ntcze3fqqzun7huc7vyoirco4` →
`Cloudflare (driscoll.tech)`, and similar). Those need the title resolved before rewriting;
the mapping is recorded in this repo's history and in `mapping.yaml`'s `uuid` field.

Note `pulumi/pulumi-operator-connect-token` is convertible and *not* circular: ESO reads
OpenBao directly, so fetching the Connect token from OpenBao introduces no cycle. It does
become meaningless at Phase 11, so it may be simpler to drop than to convert.

---

## What a rewrite actually looks like

```yaml
# before
  secretStoreRef:
    kind: ClusterSecretStore
    name: onepassword-connect
  dataFrom:
    - extract:
        key: Crowdsec ApiKey

# after
  secretStoreRef:
    kind: ClusterSecretStore
    name: openbao
  dataFrom:
    - extract:
        key: shared/crowdsec-apikey
```

The `key` becomes the path **within the `secrets` mount** — the store already pins
`path: secrets`, so it is not repeated. Field names inside the item are unchanged, which is
what makes the `template:` blocks survive untouched.

---

## Proposed order

Smallest blast radius first, and each step must be independently revertible.

1. ~~**Pilot — `equestria/obsidian-sync`**~~ ✅ done; values hash-match OpenBao.
2. ~~**Other standalone single-app secrets**~~ ✅ `kometa` and `playerr-env` done.
   `meilisearch-env` **pulled** — `secrets/shared/meilisearch-secret-key` has zero fields
   and `MEILI_MASTER_KEY` renders 0 bytes today. Populate the value first.
3. ~~**`*-volsync`**~~ ✅ done — 39, not the ~25 first estimated, and it took **two** PRs
   because of the two-repo component split above.
4. **`github-status-token`** — one manifest, 17 namespaces, **in both repos**. Low
   consequence (alerting), high fan-out; worth doing alone so a revert is unambiguous.
5. **The remaining `equestria` app secrets**, split by app group.
6. **The 12 mixed-store ones**, individually — only their 1Password references change.
7. **The 22 `OnePasswordItem` CRs** last. They break loudly (cert-manager,
   cloudflare-tunnel, external-dns, traefik/crowdsec, the tailscale operator, ARC runners)
   and converting a CR is a bigger change than repointing a `secretStoreRef`.

Do **not** remove `ClusterSecretStore/onepassword-connect` at the end of Phase 6 — 4
ExternalSecrets and 1 CR still depend on it by design, and PLAN §G Phase 11 keeps Connect
running as a frozen fallback regardless.

---

## Empty is not missing — the trap that broke kometa

The single most important thing learned so far, and it will recur across the
remaining ~74.

1Password items carry fields with **empty values**. `{{ .foo }}` on such a field
renders `""` quite happily. **Phase 4 did not migrate empty-valued fields**, so in
OpenBao that key is *absent* — and ESO renders templates with `missingkey=error`,
which fails the **entire ExternalSecret**, not just the one entry:

```
unable to mutate secret kometa-secret: could not apply template:
executing "KOMETA_OMDB_APIKEY" at <.omdb_apikey>:
map has no entry for key "omdb_apikey"
```

`KOMETA_OMDB_APIKEY` had rendered 0 bytes for its whole life, so nothing looked
wrong until the store changed.

**There are two fixes, and the first one is usually right.**

**1. Populate the field in OpenBao.** An empty field is often a bug in its own
right, and the migration is simply what surfaces it. This is what was done for
kometa: `omdb_apikey` was written into
`secrets/shared/media-management-secrets` (v2), and `KOMETA_OMDB_APIKEY` now
renders 8 bytes where 1Password gave 0. The ExternalSecret needed no change at
all, and the app is better off than before the migration.

**2. Make the template tolerant**, but only when the field is legitimately
optional:

```yaml
KOMETA_OMDB_APIKEY: '{{ index . "omdb_apikey" | default "" }}'
```

`index` returns the zero value for a missing key instead of erroring, so the
rendered Secret stays byte-identical to the 1Password era.

Reach for (2) only when empty is genuinely the intended value. Defaulting a
credential to `""` makes a real gap permanent and silent — the same failure the
0-byte key already represented. Prefer (1) unless you can say why the field
should be empty.

**Run `bootstrap/openbao/eso-parity-check.sh` before every batch.** It diffs each
template's references against the live OpenBao fields and models the `rewrite`
rules — which matters, because a naive comparison is wrong in both directions:

- its first version reported `coder` and `playerr` as broken when they were fine,
  because a `(.*)` rewrite source also matches the empty string at the end and
  duplicates the prefix
- the live `SecretSynced` status is what exposed that bug, which is the general
  lesson: **trust the server over the model**

## Risks worth naming

- **`refreshInterval` masks failures.** A repointed ExternalSecret keeps serving its old
  Secret until the next refresh, so a broken cutover can look fine for an hour. Check
  `status.conditions[-1].reason` per object, not the workload.
- **`creationPolicy: Owner` + `deletionPolicy`.** Several of these own their target Secret.
  Getting the rewrite wrong deletes and recreates it, which restarts consumers.
- **Field-name drift.** OpenBao paths were written from 1Password items field-for-field, so
  `template:` blocks should keep working — but Phase 4 hoisted the magic `"add more"`
  section to root, so an item that used it will have different keys.
- **The pilot must not be a storage class.** `longhorn-system`, `openebs-system`,
  `volsync-system` and `nfs-system` are single-secret and tempting, and are exactly the
  wrong place to learn something new.

# 06 — One age key (F)

Sub-issue **F** of [vault#84](https://github.com/david-driscoll/vault/issues/84) · [← plan index](README.md) · Decision **D5** (settled, not open) · Depends on: nothing structurally · Should land before [15 — migrate apps](15-migrate-apps.md) and [18 — SGC nodes join control plane](18-sgc-nodes-join-control-plane.md)

## What this delivers

Every `.sops.yaml` across the estate drops from three age recipients to one
(`age1eurl2t7…`, equestria's key). One `sops updatekeys` sweep per repo, one
in-cluster `sops-age` Secret rotation per cluster, one proof that decrypt and
Flux reconciliation both still work. No re-encryption-from-scratch, no
downtime, and — once one stale corner described below is fixed — no window
where anything becomes undecryptable.

## The decision (D5)

David settled this twice on the issue, and it is not relitigable:

- Q7 (["reduce to one age key"](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112158349)):
  *"We will reduce to one age key."*
- Q-D (identifying the third recipient,
  [`age150z0s36…`](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112326099)):
  *"Mine."* — his personal key, not CI, not a recovery key.

So the surviving recipient is **`age1eurl2t7pepw66guv8m7lxh5fjhs4t4frsntqjp08lmypwudlsp7qdusgnf`**
(equestria's), and the two retired recipients are:

| Retired key | Identity | Retired from |
|---|---|---|
| `age1klzrc4tp666ykn8u4y2nt80n0tcx52lvezrr54zswz55w2pdsgyqhcdfyr` | SGC's cluster key | Every `.sops.yaml` in the estate |
| `age150z0s36kl9vud8728c5e4zqq6nmyywekk76rwvjclcsfc8mrxuuqr0qfg6` | David's personal key (Q-D) | Every `.sops.yaml` in the estate |

The discovery comments ([v2 §1.6](https://github.com/david-driscoll/vault/issues/84#issuecomment-5112255273),
[v2.1 §5](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583))
both claim *"every encrypted file in both trees is already decryptable by the
equestria key… there is no window where anything becomes undecryptable."*
That claim is **re-verified below, per repo, and it is not quite true as
written** — two files in stargate-command-cluster fail it today.

## Scope has grown since the July discovery

The discovery only looked at the two cluster repos. As of **2026-08-13**,
four repos carry the same three-recipient policy and must move together:

| Repo | `.sops.yaml` scope | Recipients (verified today) |
|---|---|---|
| `equestria-cluster` | `talos/*.sops.yaml`, `(bootstrap\|kubernetes)/*.sops.yaml` | All 3, byte-identical to SGC's file |
| `stargate-command-cluster` | Same two rules, same paths | All 3, byte-identical to equestria's file |
| `vault` | `bootstrap/*.sops.yaml` — the OpenBao seal chain (recovery keys, transit token, Pulumi AppRole, break-glass AppRole) | All 3 |
| `home-operations` (this repo) | `kubernetes/*.sops.yaml` — the Pulumi operator's OpenBao AppRole | All 3 |

`equestria-cluster/.sops.yaml` and `stargate-command-cluster/.sops.yaml` are
**byte-identical** (`md5` matches). `vault/.sops.yaml` says so explicitly, in
its own comment header: *"Recipients are intentionally identical to
equestria-cluster/.sops.yaml and stargate-command-cluster/.sops.yaml so a
single age.key decrypts the whole estate… If you add a recipient here, add it
there too."* `vault/bootstrap/INVENTORY.md` §1 repeats it: *"The three age
public keys are committed in `.sops.yaml` in this repo and in both cluster
repos, and are identical across all three. Divergence is a bug."*
`home-operations/.sops.yaml` carries the same three keys with the same
comment. **Consolidating two of these repos and leaving the other two behind
recreates the exact divergence all four files warn against — this plan
updates all four in the same change.**

This matters most for `vault/bootstrap/openbao/*.sops.yaml` — recovery keys,
the transit unseal token, the Pulumi and break-glass AppRoles. These are the
files a human reads at 3am per `vault/bootstrap/RUNBOOK.md`, and per
`vault/bootstrap/INVENTORY.md` §1: *"`age.key` … Decrypts every row below.
Not in any repo, not in OpenBao, not recoverable. Losing it means re-keying
the estate from the surviving plaintext."* The bootstrap scripts already
hard-code this dependency —
`vault/bootstrap/openbao/eso-parity-check.sh:24` sets
`export SOPS_AGE_KEY_FILE=.../equestria-cluster/age.key` directly — so
equestria's key is already the estate's de facto single point of truth. This
plan makes that fact explicit in policy rather than leaving it implicit in
one script.

## The trap this plan almost inherited: two files were never re-keyed

Checking `.sops.yaml` tells you the *policy*; it does not tell you whether
every file was actually re-encrypted after the policy last changed. Auditing
every `sops:` footer in both cluster repos (not just the `.sops.yaml`
declarations) turns up an exception:

| File | Recipients actually present | Missing | Last `sops updatekeys` |
|---|---|---|---|
| `stargate-command-cluster/talos/talsecret.sops.yaml` | SGC's key, David's personal key | **equestria's key** | Never — `lastmodified: 2025-04-07`, unchanged since the repo's `shuffle things around` commit |
| `stargate-command-cluster/kubernetes/apps/flux-system/flux-instance/secret.sops.yaml` | SGC's key only | **equestria's key, David's personal key** | Never — `lastmodified: 2025-04-17`, unchanged since the repo's initial commit |

`talsecret.sops.yaml` holds SGC's Talos cluster identity (etcd CA/cert,
Kubernetes CA, service-account key) — the file `talhelper genconfig` reads
before every `talhelper gencommand apply`/`bootstrap`/`kubeconfig` in
`.taskfiles/bootstrap/Taskfile.yaml`. `flux-instance/secret.sops.yaml` holds
the GitHub webhook token SGC's Flux instance uses. Both are needed for as
long as SGC is alive, which is every phase up to
[22 — decommission SGC](22-decommission-sgc.md).

If the consolidation proceeds straight to "drop the SGC and personal
recipients from `.sops.yaml`, then `sops updatekeys` everywhere," these two
files get re-wrapped for a recipient set that **does not include the
recipient they're currently readable by**, and since the incoming
single-recipient set is *only* equestria's key, `talsecret.sops.yaml` and
`flux-instance/secret.sops.yaml` become permanently undecryptable — the exact
"undecryptable window" the discovery comments claimed does not exist. It
exists, in exactly two places, and only because nothing had run
`sops updatekeys` on them since 2025.

The fix is cheap and must run **before** the recipient list changes, while
SGC's own private key can still decrypt them:

```sh
cd stargate-command-cluster
SOPS_AGE_KEY_FILE=./age.key sops updatekeys talos/talsecret.sops.yaml
SOPS_AGE_KEY_FILE=./age.key sops updatekeys kubernetes/apps/flux-system/flux-instance/secret.sops.yaml
```

`sops updatekeys` re-encrypts a file's data key for whatever recipient set
`.sops.yaml` currently declares — today, still all three — so this step only
*adds* recipients (equestria's, and for the second file also David's
personal), it removes nothing and is trivially safe. After it, both files
match the shape of every other file in the tree (three recipients), and the
"every file is already decryptable by the equestria key" claim is actually
true, not just believed. Confirm before proceeding:

```sh
EQ_KEY="age1eurl2t7pepw66guv8m7lxh5fjhs4t4frsntqjp08lmypwudlsp7qdusgnf"
for repo in equestria-cluster stargate-command-cluster vault home-operations; do
  find "$repo" \( -iname '*.sops.yaml' -o -iname '*.sops.yml' \) ! -name '.sops.yaml' \
    -exec sh -c 'grep -q "recipient: '"$EQ_KEY"'" "$1" || echo "MISSING: $1"' _ {} \;
done
# Expect zero output. Non-empty output means a file cannot survive this plan
# yet — find and fix it before touching any .sops.yaml.
```

Nothing else in either cluster repo, the vault repo, or this repo failed
that audit as of 2026-08-13 — this was the only exception found across all
four trees.

## Steps

1. **Fix the two stale SGC files** (above) — this is the actual prerequisite,
   not a formality.
2. **Rewrite `.sops.yaml` in all four repos** to a single recipient. Only the
   `age:` list under `key_groups` shrinks, from three entries to one
   (`age1eurl2t7…`); leave `creation_rules`, `path_regex`, `encrypted_regex`,
   and `mac_only_encrypted` untouched.
3. **`sops updatekeys` across every tree**, one repo at a time:
   ```sh
   SOPS_AGE_KEY_FILE=/path/to/equestria-cluster/age.key \
     find . \( -iname '*.sops.yaml' -o -iname '*.sops.yml' \) ! -name '.sops.yaml' \
       -exec sops updatekeys --yes {} \;
   ```
   Equestria's key already decrypts every file after step 1, so one key file
   drives every repo's sweep, including `vault` and `home-operations`.
4. **Rotate the in-cluster `sops-age` Secret in both clusters.** The Secret's
   content comes from `kubernetes/flux/meta/sops-age.sops.yaml`
   (`stringData.age.agekey`), applied one-time via `apply_sops_secrets()` in
   each repo's `scripts/bootstrap-apps.sh` (also invoked by
   `task bootstrap:apps`). Re-run that step on **both** equestria and SGC
   after step 3 so kustomize-controller's mounted identity reflects the
   single-key world, and confirm the plaintext `age.agekey` value itself no
   longer needs to carry SGC's or the personal identity for decryption to
   work — trim it to the surviving identity if it was carrying more than one.
5. **Prove it, on a clean checkout.** With `SOPS_AGE_KEY_FILE` pointed at a
   copy holding *only* equestria's private key (not the laptop's normal key
   file, which may still hold the others) — decrypt one sample file from each
   of the four repos, including one of the two files fixed in step 1:
   ```sh
   sops -d stargate-command-cluster/talos/talsecret.sops.yaml >/dev/null && echo OK
   ```
   Then force a reconcile on both clusters and tail kustomize-controller for
   decrypt failures:
   ```sh
   flux reconcile kustomization <name> --with-source
   kubectl -n flux-system logs deploy/kustomize-controller --since=10m | grep -i decrypt
   ```
   No hits is the gate.

## Exit gate

- All four `.sops.yaml` files list exactly one recipient, `age1eurl2t7…`.
- The audit script in the trap section above returns zero output across all
  four repos.
- `sops -d` succeeds on a sample from each repo using *only* the equestria
  private key.
- Flux reconciles cleanly on both equestria and SGC, no decrypt errors in
  kustomize-controller logs.
- The live `sops-age` Secret in both clusters' `flux-system` namespace holds
  only the surviving identity.

## Rollback

Each repo's `.sops.yaml` edit and `updatekeys` sweep is its own commit.
`git revert` restores the prior three-recipient ciphertext, and equestria's
key already decrypts it — rollback never depends on keys you're retiring, as
long as step 1 ran first. **Do not delete
`stargate-command-cluster/age.key` or David's personal private key material**
until [16 — soak and gate](16-soak-and-gate.md) passes; keeping them costs
nothing and buys a rollback path with zero re-keying. Actual destruction of
the SGC key is in scope for [22 — decommission SGC](22-decommission-sgc.md),
not here.

## After this lands

Equestria's key becomes the estate's sole irreplaceable secret, explicitly —
not just de facto, as `vault/bootstrap/INVENTORY.md` already describes it.
Back it up accordingly; there is no longer a second or third key to fall back
on if it's lost. [03 — secrets bootstrap independence](03-secrets-bootstrap-independence.md)
and [07 — authentik → alpha-site](07-authentik-to-alpha-site.md) both consume
`SOPS_AGE_KEY_FILE=equestria-cluster/age.key` in their own bootstrap paths and
are unaffected by this change other than inheriting a simpler key story.

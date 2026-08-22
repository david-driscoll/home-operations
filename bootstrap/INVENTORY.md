# Bootstrap secret inventory

> **Moved here from `david-driscoll/vault` on 2026-08-22.** That repo is retired and
> archived; its `bootstrap/`, `docs/openbao-migration/` and `stacks/vault` now live in
> home-operations, unchanged except for path references. Where the text below says
> "this repo" it now means home-operations. The archived copy is frozen — every
> rotation or re-mint from now on updates the files HERE and nowhere else.

The authoritative index of every secret needed to bring the estate up from nothing.

**This file indexes; it does not duplicate.** Secrets that Flux and the cluster
bootstrap need in-tree stay next to the manifests that consume them (under `kubernetes/`
and `talos/` in this repo since the equestria consolidation) — copying them here would
create two sources of truth and one of them would go stale. What lives *under
`bootstrap/`* is the material that has no other home: the OpenBao seal chain and the
credentials that must exist before OpenBao can answer a single request.

Keep this file current. It is the thing you will read at 3am.

---

## Rule

A secret belongs here if it is required **before** OpenBao can serve reads. Everything
else belongs in OpenBao. If you are about to add a row, ask: *could this have been
fetched from OpenBao instead?* If yes, it does not belong here.

---

## 1. The root of trust

| Secret | Location | Consumed by | Notes |
|---|---|---|---|
| `age.key` | Operator laptop only. Gitignored in every repo. | `sops` everywhere | Decrypts every row below. Not in any repo, not in OpenBao, not recoverable. Losing it means re-keying the estate from the surviving plaintext. |

The age **public** keys are committed in `.sops.yaml` in this repo (the `bootstrap/`
rule carries the same two recipients the files were encrypted under) and in
`equestria-cluster`, and are identical. Divergence is a bug.

---

## 2. OpenBao seal chain — lives in `bootstrap/openbao/`

The chain is: `age.key` → static unseal key → `bao-transit` on alpha-site → the equestria
OpenBao cluster. Each link is useless without the one before it.

| File | Contents | Consumed by |
|---|---|---|
| `bootstrap/openbao/alpha-site-static-unseal.sops.yaml` | 32-byte AES-256-GCM-96 key for `seal "static"` on alpha-site's `bao-transit` | `bao-transit` container on alpha-site, via `env://BAO_UNSEAL_KEY` from the host env_file `/var/local/unseal-key` (dockge-as, root 0400). Committed 2026-08-22 and proven byte-identical to the running host by sha256 (`provision-static-unseal.sh verify` — all four checks green, `bao-transit` unsealed). Third copy: the 1Password item `OpenBao Alpha Site Static Unseal`. |
| `bootstrap/openbao/transit-token.sops.yaml` | Orphan periodic token the equestria cluster uses to reach the transit engine | `seal "transit"` in the equestria OpenBao config, via `VAULT_TRANSIT_SEAL_TOKEN` |
| `bootstrap/openbao/recovery-keys.sops.yaml` | `bao-transit` (alpha-site) recovery key shares, from `bao-transit.sh init` | Humans, for root-token regeneration and rekey on the seal root |
| `bootstrap/openbao/equestria-recovery-keys.sops.yaml` | equestria OpenBao recovery shares (3-of-5), from `equestria-init.sh init` | `root-ceremony.sh`; humans, for rekey |
| `bootstrap/openbao/break-glass-approle.sops.yaml` | AppRole whose ONLY capability is opening a root-generation attempt on `sys/generate-root-token/*` | `root-ceremony.sh` (RUNBOOK "Things that will bite you") |
| `bootstrap/openbao/pulumi-passphrase.sops.yaml` | `PULUMI_CONFIG_PASSPHRASE` — offline break-glass copy of `pulumi/pulumi-operator-passphrase`, written by `save-pulumi-passphrase.sh` | Humans, when OpenBao is sealed/unreachable and state must still be decrypted (`.config/mise.toml` explains when to point at it) |
| ~~`bootstrap/openbao/postgres-openbao.sops.yaml`~~ | **Not held here — see §3.** `task update` regenerates this credential in the equestria repo, so a copy here would fork from it silently on the next rotation. | — |
| `bootstrap/openbao/pulumi-approle.sops.yaml` | The `pulumi` AppRole the operator runs as | `bootstrap/openbao/pulumi-env.sh` (break-glass local runs); the applied copy is `kubernetes/apps/pulumi/secrets/openbao-approle.sops.yaml`. Day-to-day local runs use the separate `mise` role in `.config/bao-approle.sops.yaml` (`scripts/bao-mise-approle.sh`) |
| `bootstrap/openbao/restore-test-approle.sops.yaml` | AppRole for the monthly restore test — read on the single canary path only. Minted by `bootstrap/openbao/restore-test.sh`. | The monthly `openbao-replica` restore-test CronJob (RUNBOOK Scenario D); applied copy under `kubernetes/`, see §3 |

**Why each one can never move into OpenBao:**

- The static unseal key unseals the thing that unseals OpenBao.
- The transit AppRole is needed *in order to* unseal.
- Recovery shares exist precisely for when OpenBao is not answering.
- OpenBao cannot hold the password to its own storage backend.
- Pulumi must authenticate before it can read anything.

⚠️ **The transit key is the single most critical secret in the estate.** Back up
`bao-transit`'s entire storage alongside its static unseal key. Do **not** create the
transit key with `exportable = true` — an exportable key is retrievable by anyone holding
a read token, which is a strictly worse blast radius than an offline backup.

---

## 3. Per-cluster bootstrap — lives next to the manifests

Indexed here, not copied. Flux and the bootstrap scripts need these in-tree. Since the
repo consolidation (`docs/cluster-consolidation/`) equestria's tree is in THIS repo under
`kubernetes/` and `talos/`; `david-driscoll/equestria-cluster` is the pre-consolidation
home and is no longer what Flux reads.

### equestria (this repo)

| File | Contents | Applied by |
|---|---|---|
| `talos/talsecret.sops.yaml` | Talos cluster PKI, bootstrap token, secretbox encryption secret | `talhelper` via the `mise run talos:*` tasks (`genconfig`, `apply`) |
| `kubernetes/components/common/sops-age.sops.yaml` | `age.agekey` — the in-cluster decryption key | cluster bootstrap (`bootstrap/helmfile.yaml`) → `flux-system` |
| `kubernetes/components/common/cluster-secrets.sops.yaml` | 45 keys: cluster topology, DNS names, IPs, sizing. Mostly *non-secret configuration*. | cluster bootstrap; Flux `postBuild.substituteFrom` |
| `kubernetes/components/common/shared-secrets.sops.yaml` | Estate-wide host/IP/domain map, incl. `ALPHA_SITE_IP` / `ALPHA_SITE_TAILSCALE_IP` | same |
| `kubernetes/apps/kube-system/1password/secret.sops.yaml` | 1Password Connect `access-token` + `1password-credentials.json` | same |
| `kubernetes/apps/flux-system/flux-instance/secret.sops.yaml` | Flux webhook receiver token | Flux |
| `kubernetes/apps/database/postgres/app/passwords.sops.yaml` | Every CNPG role password, including `openbao-postgres-password` — the credential for OpenBao's own storage. **Authoritative.** Regenerated by `components/postgres/Update.cs` on `task update`; do not copy it into this repo. | Flux → CNPG; OpenBao reads it as a connection URL via `apps/kube-system/openbao/externalsecret.yaml` |
| `kubernetes/apps/kube-system/openbao/secret.sops.yaml` | The `openbao-seal` Secret — transit token only. The same value as `bootstrap/openbao/transit-token.sops.yaml`; this is the applied copy, that one is the minted original. If the token is ever re-minted, both change together. | Flux → `VAULT_TRANSIT_SEAL_TOKEN` |
| `kubernetes/apps/kube-system/openbao-replica/secret.sops.yaml` | The restore-test AppRole — applied copy of `bootstrap/openbao/restore-test-approle.sops.yaml`, same both-change-together rule. Placeholders until `restore-test.sh init` has run; the monthly test fails loudly until then. | Flux → the monthly restore-test CronJob |

### stargate-command (`david-driscoll/stargate-command-cluster`) — decommissioned

SGC was torn down and its nodes wiped on 2026-08-17
(`docs/cluster-consolidation/22-decommission-sgc.md`). Its sops files remain in that
repo's history only; nothing in the estate reads them.

### GitHub deploy keys — not held here

Flux syncs home-operations over public HTTPS (`kubernetes/apps/flux-system/flux-instance/helm/values.yaml`),
so no deploy key is load-bearing. The planned `bootstrap/<cluster>/github-deploy-key.sops.yaml`
files were never created. The one deploy key that did exist — for the retired private
`vault` repo — lives in OpenBao at
`secrets/third-party-tokens/github/david-driscoll/vault/deploy-key`
and has no consumer since the vault GitRepository was removed; it can be deleted from
GitHub when the repo is archived.

---

## 4. What is deliberately NOT here

- **Everything else.** App credentials, OIDC clients, database passwords, API tokens,
  provider credentials — all of it belongs in OpenBao under `secrets/`.
- **1Password.** It is retained for browser-fill logins, recovery codes, and
  personal-scope credentials. It is no longer infrastructure source of truth. The one
  remaining personal-scope reference in code is `dashboard/.mise.toml`
  (`op://Development/...`), left in place intentionally.

---

## 5. Adding a file here

```sh
# from the repo root, with age.key present and SOPS_AGE_KEY_FILE set
sops --encrypt --in-place bootstrap/openbao/<name>.sops.yaml
```

Then update this file. An undocumented bootstrap secret is a secret nobody will find
during an incident.

Do **not** run any formatter over a `*.sops.yaml`. `.config/hk.pkl` excludes them at the
top level for exactly this reason: a byte-level rewrite of an encrypted value invalidates
the SOPS MAC and the file becomes permanently undecryptable. (`mac_only_encrypted: true`
means key names and comments can be edited; the ciphertext cannot.)

Note that **key names remain in plaintext** — SOPS encrypts values only. Do not encode
anything sensitive into a key name.

---

## See also

- `bootstrap/RUNBOOK.md` — rebuild-from-nothing and break-glass procedures

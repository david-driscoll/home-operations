# OpenBao bootstrap material

> Moved here from `david-driscoll/vault` on 2026-08-22 (see `../INVENTORY.md`). Paths below
> are relative to the home-operations repo root.

The seal chain and the credentials that must exist before OpenBao can answer a request.
See `../INVENTORY.md` for why each one can never live inside OpenBao itself, and
`../RUNBOOK.md` for how they are used during recovery.

**Two of these are produced by `./bao-transit.sh init`** — `recovery-keys.sops.yaml` and
`transit-token.sops.yaml`. Don't hand-write those; the script encrypts them directly and
never puts a secret on disk in plaintext. See `../RUNBOOK.md` Scenario 0.

The rest need a real `age.key` and, for the postgres one, a `mise run update`.
The shapes below are the contract; fill in real values and encrypt in place.

```sh
sops --encrypt --in-place bootstrap/openbao/<name>.sops.yaml
```

Verify every generated file round-trips (`sops --decrypt`) **before** you rely on it, and
never let a formatter touch one.

⚠️ **Key names stay in plaintext.** SOPS encrypts values only; there is no mode that hides
keys. Every key name in the templates below is visible in git. Do not encode anything
sensitive into a key name.

---

## `alpha-site-static-unseal.sops.yaml` — Phase 2

Unseals `bao-transit` on alpha-site, which in turn unseals the equestria cluster. First
link in the chain.

```yaml
current_key_id: "YYYYMMDD-1"
current_key: "<32-byte key, base64>"
# On rotation, demote the outgoing key rather than deleting it:
# previous_key_id: "YYYYMMDD-0"
# previous_key: "<previous key material>"
```

Key format is confirmed against the OpenBao source docs
(`website/content/docs/configuration/seal/static.mdx`): **exactly 32 bytes**, used as an
AES-256-GCM-96 key. No other algorithm is supported. `current_key` accepts the key
inline (base64 or hex) or an `env://` / `file://` prefix.

```sh
openssl rand -base64 32          # inline / env:// form, which alpha-site uses
openssl rand -out unseal.key 32  # raw-bytes file:// form
```

`current_key_id` is a plain identifier, not a secret, and is **not** environment-
interpolated by OpenBao — it stays literal in the compose stack's `config.hcl`.

The alpha-site stack (`docker/alpha-site/bao-transit/`) reads the key as
`env://BAO_UNSEAL_KEY`, sourced from the host env_file `/var/local/unseal-key` on
dockge-as (root, 0400) — provisioned out of band by `provision-static-unseal.sh push`,
never rendered by anything automated (Phase 11 estate decision).

Committed 2026-08-22. It is the one link in the seal chain whose loss is not
recoverable from anything else here: RUNBOOK Scenario B needs a healthy
`bao-transit` to unseal the standby, so without this key the nightly dumps
cannot be read back at all. Check it with `provision-static-unseal.sh verify`,
which compares the stored copy against the running host by sha256 and never
prints the value.

---

## `transit-token.sops.yaml` — Phase 2

The token the equestria OpenBao cluster presents to the transit engine in order to unseal.

**Correction to the original plan:** this is a *token*, not an AppRole. The transit seal
stanza takes `address` / `token` / `key_name` / `mount_path` only — there is no AppRole
path. Confirmed in `go-kms-wrapping/wrappers/transit/transit_client.go`.

```yaml
token: "<orphan periodic token>"
```

Create it with a policy carrying nothing beyond `update` on the two transit paths:

```sh
bao token create -policy=equestria-unseal -orphan -period=768h
```

Orphan so it survives its parent expiring; periodic so it renews indefinitely. This is the
value that becomes `VAULT_TRANSIT_SEAL_TOKEN` in equestria's `openbao-seal` Secret.

---

## `recovery-keys.sops.yaml` — Phase 3

Output of `bao operator init` against the equestria cluster. With a transit seal these are
*recovery* shares, not unseal shares: they permit root-token regeneration and rekey, but
they cannot unseal without the transit key.

```yaml
threshold: 3
shares:
  - "<share 1>"
  - "<share 2>"
  - "<share 3>"
  - "<share 4>"
  - "<share 5>"
# Optional. Prefer regenerating on demand from the shares over storing a standing root token.
# initial_root_token: "<token>"
```

---

## ~~`postgres-openbao.sops.yaml`~~ — do not create this

**Superseded.** The original plan was to copy the CNPG credential for OpenBao's own
`openbao` database into this repo. Don't — it is a copy of a value that something else
regenerates, which is the definition of a secret that will drift.

`kubernetes/components/postgres/Update.cs` rewrites that password into
`kubernetes/apps/database/postgres/app/passwords.sops.yaml` on every `mise run update`. That
file is SOPS-encrypted in git and decrypts with the same `age.key` as everything here, so
it is already available offline during a cold rebuild — which was the only reason to copy
it in the first place.

In the cluster, OpenBao reads it as a ready-made connection URL:
`kubernetes/apps/kube-system/openbao/externalsecret.yaml` pulls the `uri` key out of the
generated `openbao-postgres` secret through `ClusterSecretStore/database`. That store is a
`kubernetes` provider reading the `database` namespace, so it is not backed by 1Password
and will not be backed by OpenBao — no bootstrap cycle.

For break-glass, read it straight from the manifest tree:

```sh
sops --decrypt kubernetes/apps/database/postgres/app/passwords.sops.yaml \
  | yq -r 'select(.metadata.name == "openbao-postgres-password") | .stringData.password'
```

---

## The equestria-side Secret these two feed

`kubernetes/apps/kube-system/openbao/secret.sops.yaml` (in this repo since the
consolidation) holds a Secret named `openbao-seal` with exactly two keys — nothing else about the server config
is secret:

| Key | Env var | Source |
|---|---|---|
| `pg-connection-url` | `BAO_PG_CONNECTION_URL` | `connection_url` above |
| `transit-token` | `VAULT_TRANSIT_SEAL_TOKEN` | `token` from `transit-token.sops.yaml` |

Both env vars override the config file, verified in the OpenBao source
(`physical/postgresql/postgresql.go:282` and
`go-kms-wrapping/wrappers/transit/transit_client.go`), which is why the rest of the
config can stay plaintext and reviewable in `helmrelease.yaml`.

---

## `pulumi-approle.sops.yaml` — Phase 3

How the Pulumi operator authenticates before it can read anything. Minted by
`equestria-init.sh init`; exported for a local break-glass run by `pulumi-env.sh`. The
applied copy is `kubernetes/apps/pulumi/secrets/openbao-approle.sops.yaml`, and
`.config/mise.toml` uses a separate `mise` role (`.config/bao-approle.sops.yaml`) so this
one can be rotated without touching the operator.

```yaml
role_id: "<uuid>"
secret_id: "<uuid>"
```

`PULUMI_CONFIG_PASSPHRASE` lives in its own file, `pulumi-passphrase.sops.yaml`
(`save-pulumi-passphrase.sh`) — it is needed before OpenBao is reachable, so it cannot
come from OpenBao.

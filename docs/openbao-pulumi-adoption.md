# Moving OpenBao configuration from bootstrap scripts into Pulumi

The `bootstrap/openbao/*.sh` scripts (moved here from the retired vault repo) were written before OpenBao had a Pulumi
provider in this estate. Now that `components/globals.ts` exposes `baoProvider` (the
official `@pulumi/vault` provider, adopted in home-operations#683), most of what those
scripts do is better expressed as resources.

This file records the split: what has moved, what is next, and the one category that can
never move.

## The dividing line

**Pulumi authenticates to OpenBao with a token.** Anything required to *make that token
exist* therefore cannot be a Pulumi resource — it would be a resource in the system it is
bootstrapping. Everything after the first working token is fair game.

## What can never move

| Operation | Script | Why it stays |
|---|---|---|
| `bao operator init` | `bao-transit.sh`, `equestria-init.sh` | Creates the barrier and the first root token. Nothing can talk to OpenBao before it. |
| Recovery-share handling | both | The shares come back once, from `init`, and go straight into SOPS. They are never re-derivable, so there is nothing for a provider to reconcile against. |
| Root-token regeneration | `equestria-init.sh regen_root` | A break-glass path that runs when normal credentials do not work — i.e. exactly when Pulumi cannot run. |
| The `pulumi` AppRole | `equestria-init.sh` | The credential this Pulumi code logs in with. Chicken-and-egg. |

## What has moved

| Resource | Was | Now |
|---|---|---|
| `viewer` policy | `equestria-init.sh oidc` | `vault.Policy` in `components/openbao/oidc.ts` |
| `oidc` auth method + its config | `equestria-init.sh oidc` | `vault.jwt.AuthBackend` |
| `admin` / `family` OIDC roles | `equestria-init.sh oidc` | `vault.jwt.AuthBackendRole` |

Wired into `stacks/home`. The win is more than tidiness: the Authentik client credentials
are produced by the `applications` stack, so a Pulumi-side consumer reads them directly
instead of a human copying `client_id` / `client_secret` / `issuer` into environment
variables for a one-shot script run.

## What should move next, and the catch

These are all portable in principle — the provider has a resource for each:

| Operation | Provider resource |
|---|---|
| `bao secrets enable -path={secrets,docs,meta}` | `vault.Mount` |
| `bao secrets enable transit` + `transit/keys/<name>` | `vault.Mount` + `vault.transit.SecretBackendKey` |
| `bao auth enable {kubernetes,approle}` | `vault.AuthBackend` |
| `bao write auth/kubernetes/config` | `vault.kubernetes.AuthBackendConfig` |
| `admin`, `pulumi`, `eso-equestria`, `eso-sgc`, `equestria-unseal`, `restore-test` policies | `vault.Policy` |
| `restore-test` AppRole | `vault.appRole.AuthBackendRole` |

**The catch: they already exist.** A plain `pulumi up` would try to *create* them, and
mounts and auth backends fail loudly on a path that is already in use (`path is already in
use at secrets/`). So adopting them means `pulumi import`, one resource at a time, each
verified against the live server before the next.

Two cautions specific to this estate before anyone starts:

1. **Do not reach for the `import` resource option as a shortcut.** The
   `StandardDns`/Cloudflare incident (`docs/openbao-migration/STATUS.md`, and
   the `standarddns-cloudflare-import-outage` note) is the precedent: an `import` that
   cannot match the provider's ID format re-imports on every run, and combined with
   `deleteBeforeReplace` it destroyed live records twice. Vault's IDs are stable and
   path-shaped, which is a much better case than Cloudflare's — but verify with a real
   `pulumi import` on one resource first, and confirm a follow-up `preview` is clean.
2. **Policies are the safe place to start.** `vault.Policy` create is a PUT, so adopting
   one is idempotent even without an import; the only consequence of Pulumi believing it
   created the policy is that a `destroy` would remove it. Mounts and auth backends have
   no such forgiveness.

Until that adoption happens the scripts stay authoritative for those resources, and
`equestria-init.sh status` remains the way to check them.

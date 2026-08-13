# 03 — Secrets bootstrap independence (C)

Part of the [cluster consolidation plan](README.md) for
[vault#84](https://github.com/david-driscoll/vault/issues/84). This file is
self-contained — it does not assume you've read the issue.

**One-line goal:** a local `pulumi preview` succeeds from a laptop with both
equestria and SGC powered off. Today it cannot, for a different reason than
the issue originally described.

**As-of date for every live-system claim below: 2026-08-13**, cross-checked
against `vault/docs/openbao-migration/STATUS.md` (last updated 2026-08-12)
and the current trees of `home-operations`, `equestria-cluster`,
`stargate-command-cluster` and `vault`.

---

## The framing has inverted since the issue was opened

The July 2026 discovery (issue comments, 2026-07-29/30) described a
**1Password Connect catch-22**: `.config/mise.toml` pointed `CONNECT_HOST` at
`op-connect.sgc.driscoll.tech`, so a laptop run of Pulumi depended on the
cluster this plan dissolves. That framing is **obsolete for reads**. Between
then and now, the
[1Password → OpenBao migration](../openbao-pulumi-adoption.md) completed —
see `vault/docs/openbao-migration/STATUS.md`, phases 0–11, all landed and
live as of 2026-08-12:

> "Pulumi reads NOTHING from 1Password: `VaultStore` is abstract, `BaoStore`
> is the only implementation, and a preview run with `CONNECT_*` set to EMPTY
> gets 64 resources in before failing on a WRITE — which is the proof, not an
> inference."

Confirmed against `components/globals.ts`: `GlobalResources`'s constructor
builds `this.store = new BaoStore()` and immediately calls
`store.getSecretByTitle(...)` seven times (Tailscale, Cloudflare, UniFi,
Technitium, Proxmox, TrueNAS, TrueNAS-Minio credentials) before any stack
code runs. Every one of the seven stack entry points that construct
`GlobalResources` — `stacks/{home,unifi-network,authentik,ocracoke,
applications,backups,gulf-of-mexico}/index.ts` — pays this cost on `preview`,
not just `up`, and not just stacks that touch OpenBao-managed resources.

So the actual dependency today is not "Pulumi needs 1Password Connect
running somewhere." It's **"Pulumi cannot construct `GlobalResources` at all
without a live, reachable OpenBao"** — and OpenBao runs *inside* equestria.
This piece has two genuinely separate halves as a result: a cheap,
independent cleanup (§1) and the real new catch-22 (§2).

---

## 1. The `CONNECT_HOST` repoint — still needed, but only for writes, and it's two lines

`OPClient` (`components/op.ts`) is still constructed and still used. Not for
reads — `dynamic/1password/OnePasswordItem.ts`'s dynamic-resource provider is
the only caller, and it only ever `create`s/`update`s/`delete`s items, never
reads them for anything a stack consumes. What still calls
`new OnePasswordItem(...)` today, verified by grep across the repo:

| Call site | Item | OpenBao twin? |
|---|---|---|
| `components/ProxmoxBackupServerLxc.ts:504` | `Proxmox Backup Server LXC: <host>` | **No** — 1Password-only by design (a human logs into the LXC with it) |
| `components/DockgeLxc.ts:418` | `DockgeLxc: <host>` | Yes, dual-write to `secrets/hosts/dockge/<slug>` (comment at `DockgeLxc.ts:457`) |
| `components/ProxmoxHost.ts:313` | `<host> Proxmox Info` | Yes, dual-write |
| `components/TruenasVm.ts:81` | TrueNAS VM info | Yes, dual-write |
| `components/tailscale.ts:108` | Tailscale export | Yes, dual-write to `_inventory/tailscale-export-<stack>` |
| `components/authentik.ts:216` | `<app>-oidc-credentials` | Yes, dual-write to `clusters/<key>/apps/<app>/oidc` |
| `components/BackupPlanOrchestrator.ts:60` | Backup plan | Yes, dual-write to `_inventory/<slug>` |
| `stacks/authentik/index.ts:58` | `Authentik Outputs` | Yes, dual-write |
| `stacks/home/index.ts:120` | `Thanos S3 Storage` | Yes, dual-write |

So **`STATUS.md`'s Phase 11 summary ("Pulumi writes to 1Password: the PBS
items only") undersells it** — as of today's code, nine call sites still
construct a live `OnePasswordItem`, and only the PBS one lacks an OpenBao
mirror. The other eight are still writing both stores on every apply,
unconditionally — there is no dual-write gate for 1Password the way
`baoDualWriteEnabled` gates OpenBao writes. Whether that's intentional
redundancy or an unfinished trim is worth asking whoever owns the OpenBao
migration; it isn't blocking, so this piece doesn't resolve it, but it does
mean `CONNECT_HOST`/`CONNECT_TOKEN` reachability is load-bearing for more
than "a human LXC login."

**The repoint itself.** `.config/mise.toml:80` (this repo) still reads:

```toml
CONNECT_HOST = "https://op-connect.sgc.driscoll.tech/"
```

`vault/.config/mise.toml:61` — same repo pattern, same stale value, same
fix. Both repos resolve their `[env]` block per-command now via
`mise run vals-run -- pulumi ...` (landed 2026-08-12: home-operations
`090d1d4d`, vault `9d042f8` four minutes later), so this is one line in each
file.

**The good news, verified by grepping all four repos for `op-connect` today:
almost everywhere else already made this move.**

| Location | Value today |
|---|---|
| `home-operations/.config/mise.toml:80` | ❌ `op-connect.sgc.driscoll.tech` |
| `vault/.config/mise.toml:61` | ❌ `op-connect.sgc.driscoll.tech` |
| `home-operations/docker/_common/backups/.env:2` | ✅ `op-connect.equestria.driscoll.tech` |
| `equestria-cluster/.config/mise.toml:77` | ✅ `op-connect.equestria.driscoll.tech` |
| `stargate-command-cluster/.config/mise.toml:77` | ✅ `op-connect.equestria.driscoll.tech` (already, and has been since before this migration) |

Both clusters run their own Connect HTTPRoute today
(`kubernetes/apps/kube-system/1password/httproute.yaml`, identical shape in
both repos: `op-connect.${CLUSTER_DOMAIN}`), so both hostnames are live —
this isn't a "the SGC one is broken" situation, it's a "why is our own repo
the odd one out" situation.

**This also closes the open item from the discovery comments** ("whether
anything outside Kubernetes uses `op-connect.sgc.driscoll.tech`",
v2 §12 item 7 / v2.1 §9 item 8): grepping all four repos for the literal
string today turns up exactly the two stale `mise.toml` lines above, plus
two crew-generated doc mirrors of the same (`docs/codebase/STACK.md` in both
repos, which regenerate off the source file and need no separate edit).
Nothing else — no CI workflow, no docker-compose file, no script —
references `op-connect.sgc` anywhere. The answer is "no, it's just these two
lines," which is a two-line PR, not an audit.

**Action:** change both `mise.toml` lines to
`https://op-connect.equestria.driscoll.tech/`. No dependency on anything
else in this plan — do it first, independent of sequencing, the same way
[06 (age keys)](06-age-key-consolidation.md) is called out as safe to do
early.

---

## 2. The real catch-22 today is OpenBao-shaped, not 1Password-shaped

### 2.1 Where OpenBao itself lives

Verified against `vault/docs/openbao-migration/STATUS.md` and
`vault/bootstrap/`:

- OpenBao runs as a 3-pod HA StatefulSet **inside equestria's `kube-system`**
  namespace (`kubernetes/apps/kube-system/openbao/` in equestria-cluster).
- Its storage backend is the **shared CNPG postgres**, database `openbao`
  (`kubernetes/apps/kube-system/openbao/secret.sops.yaml` in equestria-cluster
  supplies `BAO_PG_CONNECTION_URL`).
- It is **transit-sealed from alpha-site**: `seal "transit"` against
  `bao-transit`, a separate small OpenBao/transit-only compose stack on the
  `dockge-as` LXC, reached over Tailscale. Each equestria pod auto-unseals on
  restart against `bao-transit`; there is no manual unseal ceremony in the
  normal case.
- Pulumi authenticates to it with the `pulumi` AppRole
  (`role_id`/`secret_id` in `vault/bootstrap/openbao/pulumi-approle.sops.yaml`,
  SOPS-encrypted, decryptable with the estate `age.key`) — never with a
  standing token.

So OpenBao's own availability already depends on **both** equestria (the
pods + CNPG) and alpha-site (the transit seal). That dependency predates this
migration and isn't something 03 needs to fix — but it means "both clusters
down" and "OpenBao down" are close to the same event today, which is exactly
the scenario the exit gate has to survive.

### 2.2 PULUMI_CONFIG_PASSPHRASE moved into OpenBao too — as of yesterday

This is a genuinely new fact, one day old relative to this plan's other
source material, and worth stating precisely because it changes the shape of
the "bootstrap-tier secret" story. `.config/mise.toml:79` (this repo) and
`vault/.config/mise.toml:60` (same repo, same line):

```toml
PULUMI_CONFIG_PASSPHRASE = "ref+openbao://secrets/shared/pulumi-passphrase#/password"
```

Landed **2026-08-12 18:25**, home-operations commit `090d1d4d`
("`feat(mise): vals-run is a mise task, and the passphrase comes from
OpenBao`") and the paired vault-repo commit `9d042f8` four minutes later.
The commit message states the estate decision directly: *"it is fine for it
to live in the store."* A dedicated break-glass copy,
`vault/bootstrap/openbao/pulumi-passphrase.sops.yaml`, is kept for when
OpenBao itself is sealed or unreachable — `vault/bootstrap/openbao/
save-pulumi-passphrase.sh` syncs it from the live cluster Secret
(`pulumi/pulumi-operator-passphrase`) and refuses to overwrite a copy that
would leave old state undecryptable.

**Two vault-repo docs are stale against this same-day decision** — worth
folding into this piece as a one-line fix each, since whoever executes this
piece will read them and get the wrong mental model otherwise:

- `save-pulumi-passphrase.sh`'s own header comment says the passphrase "is
  the one value a local run needs that can NEVER come from OpenBao" — written
  in the *same commit* that made it come from OpenBao as primary. Reword to
  describe the file as the break-glass copy, not the sole source.
- `bootstrap/INVENTORY.md` §2 still lists `PULUMI_CONFIG_PASSPHRASE` as living
  in `pulumi-approle.sops.yaml` (it doesn't any more — that file holds only
  `role_id`/`secret_id` now) and doesn't list `pulumi-passphrase.sops.yaml`
  as its own row at all.

Net effect on the bootstrap chain: it's now **one chain, not two**. Before
2026-08-12, the passphrase was a SOPS-only secret independent of OpenBao's
availability; now it's `age key → sops → AppRole → OpenBao`, same chain as
every other credential a local run needs. That's simpler to reason about,
but it also means there is no longer a secret that's exempt from "OpenBao has
to be reachable" — including the one that decrypts Pulumi's own state.

### 2.3 What a cold-start run actually needs, end to end

Two independent OpenBao auth paths run inside one `pulumi preview`, both
gated on the same underlying credential:

1. **`BaoClient`** (`components/bao.ts`), used by `BaoStore` for every
   `globals.store.getSecretByTitle(...)` call inside the Pulumi program
   itself. Does its own AppRole login lazily, straight off
   `BAO_ADDR`/`BAO_ROLE_ID`/`BAO_SECRET_ID`.
2. **`vals`**, invoked by the `mise run vals-run` wrapper *before* Pulumi
   even starts, to resolve every `ref+openbao://` literal in `.config/
   mise.toml`'s `[env]` block (`AWS_ACCESS_KEY_ID`, `PULUMI_CONFIG_
   PASSPHRASE`, `CONNECT_TOKEN`, `AUTHENTIK_TOKEN`/`URL`). `vals` speaks the
   raw Vault HTTP API and can't do an AppRole exchange itself, so it needs an
   already-minted `VAULT_TOKEN`.

`vault/bootstrap/openbao/pulumi-env.sh` — `eval "$(bootstrap/openbao/
pulumi-env.sh)"`, run from the vault repo — is what feeds both: it decrypts
`pulumi-approle.sops.yaml`, exports `BAO_ADDR`/`BAO_ROLE_ID`/`BAO_SECRET_ID`
for path 1, and separately exchanges the same AppRole for a `VAULT_TOKEN` for
path 2 (failing that mint is a warning, not fatal — the AppRole exports still
work, `vals` just can't resolve references until a token exists). Its
default `BAO_ADDR` is `https://bao.equestria.driscoll.tech` — i.e. equestria,
live, by default. `BAO_ADDR` is deliberately overridable, "so a break-glass
run can point the same credential at a restored standby" (the script's own
comment) — that override is the entire mechanism §3 below depends on.

Full chain for a cold laptop, nothing running yet:

```
age.key (laptop, never recoverable)
  → sops --decrypt vault/bootstrap/openbao/pulumi-approle.sops.yaml
  → BAO_ADDR / BAO_ROLE_ID / BAO_SECRET_ID (+ VAULT_TOKEN for vals)
  → BaoClient AppRole login against BAO_ADDR
  → GlobalResources constructor succeeds (7 credential reads)
  → mise's [env] ref+openbao:// values resolve (state passphrase, AWS/minio
    creds, CONNECT_TOKEN, AUTHENTIK_TOKEN/URL)
  → pulumi preview can run
```

Separately, and independently of OpenBao: the **state backend** itself is
still Minio on truenas (`10.10.10.10:9000`, bucket `home-operations` —
see [05](05-import-audit.md)) — a third host, not gated on either cluster,
already resilient to "both clusters down" today. [04](
04-pulumi-state-backend.md) moves this to Postgres DIY on celestia, which
doesn't change this piece's analysis (celestia isn't equestria or SGC
either).

**The upshot:** every step above works fine with *both clusters up*, or with
*SGC down and equestria up*. The chain breaks at exactly one point when
*equestria* is down: `BAO_ADDR` (default or otherwise) has nothing live to
answer, because OpenBao's serving pods are inside the cluster that's off.

---

## 3. The exit gate, defined literally

The discovery comment's gate was: *"on a laptop with `KUBECONFIG` unset and
both clusters powered down, `pulumi preview` succeeds on at least two
stacks."* That's still the right test. What it actually requires today,
traced against `vault/bootstrap/RUNBOOK.md`:

### 3.1 The break-glass path exists and is live — but it is not one command

`RUNBOOK.md` **Scenario B — "the equestria cluster is gone"** is written and,
per `STATUS.md`'s Phase 5 completion note, its infrastructure is confirmed
live as of 2026-08-10:

- `openbao-replica` CronJob in equestria ships an age-encrypted `pg_dump` of
  the `openbao` CNPG database nightly (03:00) to a receiver on alpha-site's
  `dockge-as` LXC, 30-day retention (`bao-standby` stack,
  `home-operations#685`).
- A **monthly** `openbao-replica-restore-test` CronJob (1st of the month,
  05:00) actually restores the newest dump into a scratch Postgres sidecar,
  starts a throwaway `bao` against it, unseals it via the real transit key,
  and reads a canary path — reporting to the `OpenBao Break Glass` Gatus
  group, which pages on silence past 33 days as well as on failure. Verified
  running end-to-end (`lastSyncTime`, restic path) on 2026-08-10.
- The tcp:2023 ACL that had blocked this (a "connection refused" that looked
  like the receiver was down but was actually a missing UniFi ACL grant) is
  **applied**, confirmed 2026-08-09.

But the standby itself — the container that would actually *serve* Pulumi's
reads during a real outage — **is deliberately stopped by default**
(`docker compose --profile break-glass`), specifically so alpha-site doesn't
permanently co-locate the transit-seal key with a live copy of everything it
protects. Bringing it up is a manual procedure (`RUNBOOK.md` Scenario B,
steps 1–7): confirm a recent dump exists on `dockge-as`, decrypt it
**off-alpha-site** (the dump carries an age layer specifically so possession
of alpha-site alone isn't enough), copy the plaintext back, run `restore.sh`
with the transit token, wait for `"sealed":false`, then re-point `BAO_ADDR`
at the standby container directly (never a Service or ingress — the standby
is intentionally single-node) and log in with the AppRole that "rides inside
the dump" (it's part of the restored KV data).

**So the literal test is a procedure, not a command.** The monthly drill
proves the dump is restorable into a *scratch* instance; it does not prove a
real `pulumi preview` can run against the *actual* break-glass standby,
because the drill's scratch `bao` is never wired up as something Pulumi
points at.

### 3.2 What this piece's exit gate actually is

Not "run `pulumi preview` and see if it fails" — that will just fail today,
correctly, because `BAO_ADDR` defaults to a cluster that's off and nothing
here changes that default. The deliverable is:

1. **Rehearse Scenario B for real**, once, in a planned window: restore the
   nightly dump into `bao-standby` on alpha-site, unseal it, and run an
   actual `pulumi preview` against it (`BAO_ADDR=http://<dockge-as tailnet
   IP>:8201 pulumi preview` from a stack that doesn't also need equestria's
   kubeconfig, e.g. `stacks/home`). This is the first time anyone would have
   pointed a live Pulumi run at the standby rather than a scratch sidecar.
2. **Confirm `RUNBOOK.md` Scenarios B/C's root-generation instructions are
   current.** `STATUS.md`'s "Known issues, not yet fixed" list flags that
   Scenarios B/C were written against `bao operator generate-root`, which
   403s on the unauthenticated endpoint by design — the fix
   (`root-ceremony.sh` + the `break-glass` AppRole) exists and is
   referenced inline in Scenario B already, but the doc itself hasn't had
   the stale line removed as of 2026-08-12. Small doc fix, do it alongside
   the rehearsal so nobody follows the wrong instruction mid-incident.
3. **Stand the standby back down afterward** (Scenario B step 7) — it must
   not keep running on the host that also holds the transit key.

### 3.3 Break-glass artifacts that must exist and be verified decryptable

All SOPS-encrypted in `vault/bootstrap/openbao/`, decryptable with the
estate `age.key`, per `vault/bootstrap/INVENTORY.md` §2:

| File | Unlocks | Consumed by |
|---|---|---|
| `alpha-site-static-unseal.sops.yaml` | `bao-transit` itself | `bao-transit` container, `env://BAO_UNSEAL_KEY` |
| `transit-token.sops.yaml` | equestria OpenBao's transit seal | `VAULT_TRANSIT_SEAL_TOKEN`, and the token restore.sh needs to unseal the standby |
| `pulumi-approle.sops.yaml` | Pulumi's own read/write access | `pulumi-env.sh` → `BAO_ROLE_ID`/`BAO_SECRET_ID` |
| `pulumi-passphrase.sops.yaml` | Pulumi state decryption, break-glass copy | `PULUMI_CONFIG_PASSPHRASE`, only if OpenBao itself is unreachable |
| `recovery-keys.sops.yaml` | Root-token regeneration / rekey | Humans, via `root-ceremony.sh`, 3-of-5 threshold |
| `break-glass-approle.sops.yaml` | Opens a `sys/generate-root` attempt only | `root-ceremony.sh` |
| `restore-test-approle.sops.yaml` | Canary read only | The monthly drill |

Run `sops --decrypt` against each one from a machine that is *not*
alpha-site before relying on any of this in anger — the RUNBOOK's own
prerequisite section says the same: no `age.key` means none of the above is
recoverable, by design.

---

## 4. Why this gates the authentik move and the node phases

`.config/mise.toml`'s CONNECT_HOST fix (§1) has no dependents. The OpenBao
break-glass rehearsal (§3) does — the discovery comment for
[07 — authentik → alpha-site](07-authentik-to-alpha-site.md) named it
explicitly as a **prerequisite, not hardening**:

> "You must not be able to reach a state where authentik is broken *and* the
> only tool that can rebuild it needs authentik's cluster to be up."

Once authentik moves to alpha-site, alpha-site's own Dockge stacks are
*provisioned by Pulumi*, which needs OpenBao, which (today) needs equestria.
If equestria is ever down at the same time authentik needs rebuilding on
alpha-site, the rebuild path is exactly the Scenario B procedure in §3 — so
it has to actually work, rehearsed, before 07 is safe to execute. The same
logic extends to every later node-touching phase ([10](
10-drain-safety.md) onward): the plan's stated principle is "per-step
reversibility beats speed," and reversibility assumes a working local
`pulumi` the whole way through, including at the moment equestria is
mid-rotation and briefly less available than usual.

---

## 5. Concrete deliverables

1. Repoint `CONNECT_HOST` to `op-connect.equestria.driscoll.tech` in
   `home-operations/.config/mise.toml:80` and `vault/.config/mise.toml:61`.
   No dependency on anything else — do first.
2. Vault-repo doc hygiene: update `save-pulumi-passphrase.sh`'s header
   comment and `INVENTORY.md` §2 to reflect the 2026-08-12
   passphrase-in-OpenBao decision, and remove the stale
   `generate-root`-endpoint line from `RUNBOOK.md` Scenarios B/C.
3. Rehearse `RUNBOOK.md` Scenario B end to end against a real `pulumi
   preview`, not just the monthly scratch-sidecar drill. This *is* the exit
   gate — record the run (which stacks, what `BAO_ADDR`, what output) as the
   artifact that proves it, then stand the standby back down.
4. Re-run the rehearsal (or at minimum the monthly drill's Gatus status)
   immediately before [18 — SGC joins as control planes](
   18-sgc-nodes-join-control-plane.md), since that's the point-of-no-return
   phase and the last moment a stale rehearsal is cheap to redo.

## Open questions

- Should the eight non-PBS `OnePasswordItem` dual-writes (§1's table) be
  trimmed to match the "PBS items only" end state `STATUS.md` describes, or
  is the redundancy intentional? Not this piece's call — flag to whoever owns
  the OpenBao migration rather than deciding here.
- `RUNBOOK.md` step 6 ("re-point consumers" — ESO `ClusterSecretStore`
  server addresses during a real break-glass event) has never been tested
  live, only described. Worth a separate, smaller rehearsal, possibly folded
  into [20 — low-power tier](20-low-power-tier.md)'s own rehearsal since both
  exercise "alpha-site is now load-bearing for more than usual."

## See also

- [README.md](README.md) — decision ledger, full sequencing
- [04 — Pulumi state backend](04-pulumi-state-backend.md)
- [05 — import audit](05-import-audit.md)
- [06 — age key consolidation](06-age-key-consolidation.md)
- [07 — authentik → alpha-site](07-authentik-to-alpha-site.md)
- `vault/docs/openbao-migration/STATUS.md`, `PLAN.md`
- `vault/bootstrap/INVENTORY.md`, `RUNBOOK.md`

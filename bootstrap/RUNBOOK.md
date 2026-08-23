# Bootstrap and break-glass runbook

> **Moved here from `david-driscoll/vault` on 2026-08-22.** That repo is retired and
> archived; its `bootstrap/`, `docs/openbao-migration/` and `stacks/vault` now live in
> home-operations, unchanged except for path references. Where the text below says
> "this repo" it now means home-operations. The archived copy is frozen — every
> rotation or re-mint from now on updates the files HERE and nowhere else.

> **Status: partially built.** Steps are marked ⏳ where the infrastructure they describe
> does not exist yet. Phases refer to the migration plan; see `INVENTORY.md` for what is
> already in place. Do not assume a ⏳ step works — verify before you need it.

Read `INVENTORY.md` first. It tells you which secrets exist and where. This file tells you
what to do with them.

---

## Prerequisites for everything below

- `age.key` present on the machine, `SOPS_AGE_KEY_FILE` pointing at it
- `mise install` complete in this repo (`sops`, `age`, `kubectl`, `talhelper`, `flux`); `bao` is not pinned here, install it separately
- Tailscale connectivity to alpha-site

If you do not have `age.key`, stop. Nothing below is possible without it, and there is no
way to derive it. Recovery in that case means re-keying from whatever plaintext survives.

---

## Scenario 0 — first-time setup of bao-transit

`bootstrap/openbao/bao-transit.sh` does this. It is idempotent: each step checks first
and skips what is already done, so a re-run after a partial failure resumes.

```sh
export BAO_ADDR=http://<ALPHA_SITE_TAILSCALE_IP>:8200
export SOPS_AGE_KEY_FILE=/path/to/age.key

./bootstrap/openbao/bao-transit.sh status   # changes nothing — safe any time
./bootstrap/openbao/bao-transit.sh init
```

`init` initialises, enables transit, creates the `openbao-equestria-unseal` key, writes
the `equestria-unseal` policy, issues an orphan periodic token, then **revokes the root
token it minted**. It writes `recovery-keys.sops.yaml` and `transit-token.sops.yaml`
encrypted — no secret is printed or written in plaintext at any point.

Root is deliberately not retained. Regenerate one from the recovery shares if you ever
need it.

`status` is also the monitoring command: run it while waiting for the stack to come up.
It distinguishes *unreachable* (not deployed yet) from *sealed* (deployed, but the static
seal did not take), which are different problems.

---

## Scenario A — OpenBao is sealed after a restart

Expected symptom: pods running, `bao status` reports `Sealed: true`, ExternalSecrets stop
refreshing (existing Secrets keep their last-synced values).

Normally this resolves itself: the equestria cluster auto-unseals via `seal "transit"`
against `bao-transit` on alpha-site. If it has not:

1. Check alpha-site reachability first — this is the usual cause.
   ```sh
   tailscale ping alpha-site
   curl -s http://<ALPHA_SITE_TAILSCALE_IP>:8200/v1/sys/health | jq
   ```
2. If `bao-transit` is itself sealed, unseal it. It uses `seal "static"`, so it should
   self-unseal on boot; if the key file did not mount, re-apply it:
   ```sh
   sops --decrypt bootstrap/openbao/alpha-site-static-unseal.sops.yaml
   # place at the path the bao-transit container expects, then restart it
   ```
3. Once `bao-transit` is healthy, restart the equestria OpenBao pods. They will unseal
   on their own.

**Known trade-off:** transit unseal means equestria's OpenBao cannot start while
alpha-site is down. Already-unsealed pods keep serving, so a brief alpha-site outage is
survivable — but do not roll the StatefulSet during one.

---

## Scenario B — break-glass: the equestria cluster is gone

Goal: get secret reads working again without rebuilding Kubernetes first.

The pieces: the `openbao-replica` CronJob in equestria ships an age-encrypted `pg_dump`
of the `openbao` database nightly (03:00) to the `bao-standby` stack on the dockge-as
LXC, 30-day retention. The stack's `standby-postgres` and `bao-standby` containers are
stopped by default behind a compose profile (`break-glass`) — only its dump receiver
runs.

1. **Confirm you have a dump.** They land in `/opt/stacks-data/bao-standby/dumps` on
   dockge-as, named `openbao-YYYYMMDD-HHMMSS.sql.age`.
   ```sh
   ssh root@dockge-as.<tailscale-domain> 'ls -lt /opt/stacks-data/bao-standby/dumps | head'
   ```
   If Scenario D has reported green within the last month, the newest dump is known
   restorable. If it has not, keep going — but expect surprises.
2. **Decrypt it — NOT on alpha-site.** The dump carries an age layer *on top of*
   OpenBao's own encryption, deliberately: that host also holds the transit key, so
   possession of it alone must not be sufficient. Copy the dump to a machine holding
   `age.key`, decrypt there, copy the plaintext `.sql` back:
   ```sh
   age --decrypt -i "$SOPS_AGE_KEY_FILE" openbao-<stamp>.sql.age > openbao.sql
   ```
3. **Restore and start the standby.** `restore.sh` in the stack directory drives the
   whole sequence: starts `standby-postgres`, restores (refusing a non-empty database
   or a still-encrypted file), then starts `bao-standby` with the transit token you
   supply from `bootstrap/openbao/transit-token.sops.yaml`
   (`sops -d --extract '["token"]'` it on the machine with `age.key`):
   ```sh
   # on dockge-as
   cd /opt/stacks/bao-standby
   BAO_STANDBY_TRANSIT_TOKEN=<token> bash restore.sh /path/to/openbao.sql
   ```
4. **It unseals via the same transit key**, so `bao-transit` must be healthy — see
   Scenario A step 2. `restore.sh` waits for `"sealed":false` and fails loudly if it
   never comes.
5. **Verify before trusting it:**
   ```sh
   export BAO_ADDR=https://bao-standby.<tailscale-domain>   # or http://<dockge-as tailnet IP>:8201
   bao status                                          # unsealed, active
   bao kv get secrets/third-party-tokens/cloudflare/driscoll-tech  # canary read
   ```
   The canary read needs a token. **Reach for an AppRole first — they ride inside the
   dump**, so they exist the moment the restore finishes: the pulumi AppRole
   (`bootstrap/openbao/pulumi-approle.sops.yaml`) or the restore-test AppRole
   (`bootstrap/openbao/restore-test-approle.sops.yaml`, canary-read only):
   ```sh
   bao write auth/approle/login role_id=<role_id> secret_id=<secret_id>
   ```

   **If you genuinely need root**, use `root-ceremony.sh` — not
   `bao operator generate-root`, which speaks only the authenticated
   `sys/generate-root-token/*` path and 403s without a policy that grants it (that is
   the whole reason the break-glass AppRole exists). Two things about the standby
   differ from equestria and both matter:

   - `BAO_ADDR` must point at the **single** standby container. That is already true
     here — the standby is one node, so the pod fan-out hazard that applies inside the
     equestria cluster (see "Things that will bite you") does not arise. Still point it
     at the container directly, never at a Service or ingress that could fan out.
   - The script's own preflight (`probe`) proves reachability and share decryption
     **without consuming anything**. Always run it first.

   ```sh
   export BAO_ADDR=http://<dockge-as tailnet IP>:8201
   export SOPS_AGE_KEY_FILE=<path to age.key>
   ./bootstrap/openbao/root-ceremony.sh probe    # consumes nothing
   ./bootstrap/openbao/root-ceremony.sh run
   ```

   The old instruction here — set `disable_unauthed_generate_root_endpoints = false`
   and restart the container — is **wrong and unnecessary**. That flag is not set in
   the estate's config at all; the unauthenticated endpoints are already reachable. The
   belief that they 403 came from measuring with the CLI, which contacts the *other*
   endpoint. See STATUS.md, "facts established the hard way".
6. **Re-point consumers.** ESO in any surviving cluster needs its `ClusterSecretStore`
   server address changed to the standby. Pulumi and laptops need `BAO_ADDR` changed.
   From a tagged tailnet host both the Traefik route and the direct `:8201` port work;
   from a cluster's pods, the port must first be declared on that cluster's dockge-as
   egress Service (`apps/tailscale-system/services/Update.cs`).
7. **Afterwards**, stand the standby back down — it must not keep running on the host
   that also holds the transit key:
   ```sh
   cd /opt/stacks/bao-standby && docker compose --profile break-glass down
   # wipe /opt/stacks-data/bao-standby/postgres if the restored state should not linger
   ```

**What this does not give you:** anything written to OpenBao since the last nightly dump.
RPO is up to 24 hours.

---

## Scenario C — total rebuild from nothing

Order matters. Each step depends on the one before it.

1. **Recover `age.key`.** Everything else is gated on this.
2. **Talos + Kubernetes** — in this repo (`talos/`, driven by the `mise run talos:*`
   tasks: `genconfig`, then `apply`; needs `age.key` + `talos/talsecret.sops.yaml`).
   45+ min. Do not cancel. Read `docs/cluster-consolidation/` first — it records the
   traps the consolidation hit.
3. **Cluster bootstrap secrets and CRDs:** `bootstrap/helmfile.yaml` plus the sops files
   under `kubernetes/components/common/` (sops-age, cluster-secrets, shared-secrets).
4. **Flux syncs**, which brings up CNPG, then the `openbao` database.
5. **OpenBao** — restore the database from the alpha-site dump (Scenario B steps 1–2,
   restored into the CNPG `openbao` database instead of the standby), or re-initialise
   from scratch if you accept losing everything.
6. **Unseal** via `bao-transit` (Scenario A).
7. **Verify** with the canary read, then let ESO reconcile.

If step 5 finds no usable dump, the estate's secrets are gone. That is what the nightly
replication and the monthly restore test exist to prevent — see Scenario D.

---

## Scenario D — verifying the backup

An unverified backup is not a backup. The `openbao-replica` restore-test CronJob
(equestria, kube-system, monthly on the 1st at 05:00) runs Scenario B as a drill with
nothing mocked:

1. Pulls the NEWEST dump back from alpha-site over the same SFTP path the nightly job
   ships through — and fails if it is older than 3 days, because a clean restore of a
   stale dump is still a dead replication pipeline
2. Decrypts it with the estate age identity (the in-cluster `sops-age` Secret — the
   same key a human would use in Scenario B step 2)
3. Restores into a scratch Postgres sidecar, then starts a throwaway `bao` against it
   and lets it unseal via the real transit key on alpha-site
4. Logs in with the restore-test AppRole and reads the canary key
   (`secrets/third-party-tokens/cloudflare/driscoll-tech`)
5. Reports to the `OpenBao Break Glass` Gatus group on uptime — which pages on an
   explicit failure AND on silence: the nightly-dump heartbeat lapses after 26h, the
   restore-test heartbeat after 33 days, and both re-page daily until fixed

**If the restore-test endpoint is red or has not reported green in over a month, treat
the backup as untrusted** and run Scenario B manually as a drill. To re-run the check
without waiting for the 1st:

```sh
kubectl -n kube-system create job --from=cronjob/openbao-replica-restore-test restore-test-drill
```

One-time provisioning: the AppRole the test logs in with is minted by
`bootstrap/openbao/restore-test.sh init` (needs an admin token — see the script header),
which also prints the commands that place the credentials into the
`openbao-replica` secret. Until that has run, the test fails at approle login — loudly,
by design.

**If the canary path ever moves, the policy does not follow it.** The policy grants
exactly one path, and four places name it: this file, `restore-test.sh` (which WRITES
the policy), the `openbao-replica` HelmRelease `CANARY_PATH`, and
`docker/alpha-site/bao-standby/restore.sh`. Editing the first, third and fourth changes
what is *read*; only re-running `restore-test.sh init` under a root ceremony changes
what is *permitted*. Miss that step and the role keeps a grant on a path that no longer
exists — which is exactly what the `shared/` → `third-party-tokens/` reorganisation did
in August 2026.

`./restore-test.sh status` is the check for it: it now compares the live policy's grant
against `CANARY_PATH` and exits non-zero on drift, instead of reporting that the policy
"exists".

---

## Rotating the static unseal key ⏳

`seal "static"` supports rotation via `current_key_id` / `previous_key_id`. Add the new
key as `current_*`, demote the old to `previous_*`, restart, confirm unseal, then drop the
previous key on the next pass. Update
`bootstrap/openbao/alpha-site-static-unseal.sops.yaml` in the same commit.

---

## Things that will bite you

- **Never run a formatter over a `*.sops.yaml`.** A trailing-whitespace or final-newline
  rewrite invalidates the MAC and the file is permanently undecryptable. `.config/hk.pkl`
  excludes them at the top level; keep it that way.
- **The age recipient list must stay identical** across every `.sops.yaml` creation rule
  in this repo. A divergent set is how a secret becomes undecryptable on the one machine
  that needs it.
- **`bao-transit` and `bao-standby` are deliberately separate.** Co-locating them would
  put the ciphertext and the key that decrypts it in one container. They share a host,
  which already weakens this — the age layer on the dump and keeping `bao-standby` stopped
  are what compensate.
- **`bao operator generate-root` cannot mint a root token here, and never could.** It
  speaks only the authenticated `sys/generate-root-token/*` path, which 403s without a
  policy granting it — including `-status` and `-decode`, which also contact the server.
  Use `bootstrap/openbao/root-ceremony.sh`, or hold the break-glass AppRole
  (`bootstrap/openbao/break-glass-approle.sops.yaml`), whose only capability is opening
  an attempt on that path. Completing one still needs 3 of the 5 recovery shares.
- **In the cluster, point the ceremony at ONE STANDBY pod, never the ingress.**
  `sys/generate-root/*` is served by standby nodes; the active node answers
  `unsupported operation`. `bao.equestria.driscoll.tech` fans out across all three, so
  the attempt and the share submissions can land on different nodes — spending recovery
  shares for nothing. `root-ceremony.sh` now refuses to start in that case, but the
  remedy is yours: `kubectl -n kube-system port-forward pod/<a-standby> 18200:8200`.
- **Use `root-ceremony.sh resume`, not `run`, for a policy or auth-role edit.** `run`
  also calls `restore-test.sh init`, which refuses to overwrite an existing approle file
  and fails the whole ceremony *after* minting a root token.
- **Long-running bootstrap commands take 45+ minutes.** Cancelling one mid-flight leaves
  the cluster in a state that is harder to recover than starting over.

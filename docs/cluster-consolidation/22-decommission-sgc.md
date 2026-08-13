# 22 — Decommission SGC (Letter U)

> Every SGC reference retired: VIP, DNS, stacks, OpenBao mounts, cluster
> definitions, repos archived. Part of the
> [cluster consolidation plan](README.md) for
> [vault#84](https://github.com/david-driscoll/vault/issues/84); see that file
> for the decision ledger (D1–D12) and full sequencing graph. This file stands
> alone — no prior context required.

## What this delivers

By the time this piece starts, SGC no longer exists as infrastructure — its
three nodes are equestria's control planes (phases 18–19) and its five unique
apps live in the merged cluster (phases 13–15). What's left is **reference
rot**: names, IPs, credentials, mounts, dashboards, docs, and CI jobs that
still point at a cluster that is gone. This is the piece where forgotten
references live for months before someone trips over them — a DNS record
nobody deletes, a policy nobody revokes, a Gatus check that goes red forever.
The discipline here is exhaustive enumeration over cleverness: grep, list,
check off.

## Depends on / sequencing

**Nothing here starts until [21](21-repo-consolidation-flux-repoint.md)'s exit
gate: the merged cluster reconciles from `home-operations` alone.**
Decommissioning SGC's Pulumi-managed artifacts while two repos are still live
GitOps sources risks deleting something 21 still needs mid-flip. This piece
is intentionally last.

## Inventory — every class of reference found, verified 2026-08-13

Each row below was verified by reading or grepping the actual file, not
inferred. Grep commands are given so this stays reproducible after other
work has landed on top.

### 1. The Talos API VIP — `10.10.209.201`

SGC's Talos control-plane endpoint. Referenced from two places in
`home-operations`, both Pulumi:

- `stacks/home/index.ts:385` — `OpenBaoClusterAuth("openbao-sgc-auth", { clusterKey: "sgc", clusterTitle: "Cluster: Stargate Command", kubernetesHost: "https://10.10.209.201:6443" })`. Deleting this resource block (see §5) is what tells OpenBao to stop dialing the VIP.
- `stacks/unifi-network/acl-manager.ts:109` — `kubeApiIp: "10.10.209.201"` inside the `sgc` cluster's ACL zone entry (line 106, `tag: tag.sgc`), and again in `publicIps: [..., "10.10.209.101", "10.10.209.202"]` at line 110.

Once every Kubernetes-facing consumer is gone (§5), release the VIP itself —
it was never a Cilium-managed LoadBalancer, so there is no `CiliumLoadBalancerIPPool`
entry to remove; it was the Talos `endpoint`/`additionalApiServerCertSans`
address in SGC's own `talconfig.yaml`, which dies with the node wipe in
phases 18–19 and the repo archival in §9. No separate release step is needed
beyond confirming nothing still tries to reach it.

### 2. DNS records — `op-connect.sgc.driscoll.tech` and `*.sgc.driscoll.tech`

**Not Pulumi-managed.** Verified: `grep -rn "op-connect\|sgc\.driscoll\.tech" stacks/ components/ --include="*.ts"`
in `home-operations` finds no DNS-record-creating code for the `sgc.driscoll.tech`
zone — SGC's own `network/cloudflare-dns` and `network/technitium-dns`
external-dns instances create these records *from inside the SGC cluster*
via Ingress/Service annotations. That means **the records do not clean
themselves up when the cluster stops existing** — external-dns simply stops
running. Every record it ever created (`op-connect.sgc.driscoll.tech`,
`iris.driscoll.tech` per SGC's `authentikDomain`, and whatever else SGC's
Ingresses generated) becomes an orphan in Cloudflare and in Technitium.

Action: enumerate live records via the Cloudflare API and Technitium's API
for anything under `sgc.driscoll.tech` or pointed at `10.10.209.x`, delete
them manually. This cannot be done by deleting a Pulumi resource because none
manages them.

### 3. Pulumi — the `sgc` application stack

- `kubernetes/apps/pulumi/applications/sgc.yaml` — the `Stack` CR, `stack:
  sgc`, `backend: s3://home-operations/applications?...`. **Note
  `destroyOnFinalize: false`** (same as every Stack CR in this repo,
  verified against `applications/equestria.yaml` too — it's the template
  default, not sgc-specific). Deleting this CR does **not** tear down what
  the `sgc` Pulumi stack manages. Run `pulumi destroy` (or a targeted
  `pulumi destroy --target` against whatever the `sgc`-keyed instance of
  `stacks/applications` owns — an Authentik brand/OIDC config scoped to
  `Cluster: Stargate Command`, per `stacks/applications/index.ts:16`'s
  `clusterDefinition.key === "sgc"` branch) **before** deleting the CR, or
  those resources become orphaned live state with nothing managing them.
- `kubernetes/apps/pulumi/applications/kustomization.yaml` — remove the
  `./sgc.yaml` resource entry.
- `stacks/applications/Pulumi.sgc.yaml` — the stack config file
  (`applications:clusterCredential: 'Cluster: Stargate Command'`). Delete
  after the `pulumi destroy` above.
- `stacks/applications/index.ts:16` — `if (clusterDefinition.key === "sgc" || clusterDefinition.key === "equestria")`.
  Once no `sgc`-keyed stack instance exists this branch is simply dead code
  for `sgc`; remove the literal as part of the exhaustive-cleanup discipline
  this piece exists for, not because it's unsafe to leave.
- `kubernetes/apps/pulumi/kubeproxies/services.yaml` — the `sgc-kubeproxy`
  `ExternalName` Service that lets Pulumi workspace pods reach SGC's API
  server over the Tailscale `tailnet-inbound` egress ProxyGroup. Delete once
  nothing (the `sgc` stack instance above, chiefly) needs to reach that API
  server anymore.
- `kubernetes/apps/pulumi/history-pruner/cronjob.yaml:44` — a comment
  ("equestria/sgc share...") describing the Pulumi backend prefix layout.
  Update the comment; verify the CronJob's actual prefix list doesn't need a
  matching code change (it references backend roots, which is unaffected by
  sgc's stack disappearing — the `s3://home-operations/applications` prefix
  stays, just with one fewer stack instance under it).
- `components/store/clusters.test.ts:204` — `assert.equal(CLUSTERS.find(c => c.key === "sgc")?.rootDomain, "sgc.driscoll.tech")`. Once `clusters/sgc.yaml` is gone (§4) this assertion fails because `.find()` returns `undefined`. Remove the assertion line (keep the `alpha-site`/`skystar` ones next to it).

### 4. The cluster definition — `clusters/sgc.yaml` and its OpenBao twin

- `clusters/sgc.yaml` (repo root) — the checked-in cluster definition,
  loaded by `components/store/clusters.ts` into the `CLUSTERS` array.
  Deleting the file is what removes `sgc` from that array.
- `stacks/system/index.ts` is the **producer**: it loops `for (const entry of
  CLUSTERS)` and publishes each to OpenBao at `clusters/${entry.key}/details`
  (line 76–79). Once `clusters/sgc.yaml` is gone, the next `pulumi up` on the
  `system` stack plans a delete of the `clusters/sgc/details` OpenBao
  resource — verify that delete actually happens (Pulumi resource deletion
  for a removed loop iteration, not a no-op) rather than assuming it.
- The credential itself, `secrets/clusters/sgc/cluster` (OpenBao KV path
  named directly by `clusters/sgc.yaml`'s `secretField: secret`, per
  `components/store/clusters.ts`'s own doc comment), is **not** written by
  `stacks/system` — it's written by whatever stack generates it. Confirm
  which stack that is and that it's cleaned up too; it is not automatically
  removed by deleting `clusters/sgc.yaml`.

### 5. OpenBao artifacts — the `kubernetes-sgc` mount and `eso-sgc` policy/role

**Precondition, verified live 2026-08-13: don't delete the mount while something still
authenticates through it.** SGC's `ClusterSecretStore/openbao` (`kubernetes-sgc`-backed) is
still `Ready: True` and actively syncing 20 `ExternalSecret`s as of this session, spread
across `sgc` (`authentik`, `authentik-bootstrap`, `authentik-volsync`, `cloudflare-tunnel`,
`home-assistant-credentials`, `media-management-credentials`, `truenas-credentials`,
`unifi-credentials`), `network` (`technitium-env`, `technitium-tsig-key`,
`technitium-volsync` — SGC's own, separate technitium instance, still live), `tailscale-system`
(`tsiam-volsync`, `tsidp-volsync`) and one `github-status-token`/namespace pair per namespace
(a Flux-wide credential, unrelated to any single app). Most of these are apps this phase (or
an earlier one) has already retired — `home-assistant-credentials` in particular is pure
debris, per [13](13-stage-sgc-apps.md#status-as-of-2026-08-13--read-this-before-doing-anything).
**The mount can only go once SGC's Flux tree itself is suspended and not reconciling**
(§9) — at that point nothing is evaluating these `ExternalSecret`s regardless of whether the
mount still exists, so deletion order is: suspend the tree first, delete the mount second,
not the other way round. If anything above is still `Ready: True` with a *live workload
behind it* (not just a stale credential) when you reach this step, stop and find out why
before deleting.

Two different management paths, verified against
`vault:bootstrap/openbao/equestria-init.sh` and `home-operations:components/openbao/clusterAuth.ts`:

- **`kubernetes-sgc` auth mount + its role** — Pulumi-managed, via
  `stacks/home/index.ts:381`'s `OpenBaoClusterAuth("openbao-sgc-auth", {...})`
  (backed by `components/openbao/clusterAuth.ts`, which creates
  `vault.AuthBackend` at path `kubernetes-sgc`, a `vault.kubernetes.AuthBackendConfig`,
  and a `vault.kubernetes.AuthBackendRole` named `eso-sgc`). **Delete this
  block from `stacks/home/index.ts` and let `pulumi up` tear it down.** No
  root ceremony needed: the `pulumi` OpenBao policy already grants
  `capabilities = ["create", "read", "update", "delete", "sudo"]` on
  `sys/auth/kubernetes-sgc` and `["create", "read", "update", "delete", "list"]`
  on `auth/kubernetes-sgc/role/*` (`equestria-init.sh:195-209`) — deletion is
  a normal Pulumi-authenticated operation, same as any other resource this
  stack owns.
- **`eso-sgc` policy** — written directly by `equestria-init.sh`'s bash (`bao
  policy write "eso-${cluster}" ...` in a `for cluster in equestria sgc`
  loop), **not** by Pulumi. Removing it is `bao policy delete eso-sgc`
  against the live OpenBao with an **admin token** — this is an admin-scope
  write, same tier as the policy's own creation, and does **not** require a
  root ceremony (root ceremony is only `sys/generate-root/*`, per the
  estate's own note on that procedure's fragility — unrelated machinery).
  Do this by hand or fold it into a corrected `equestria-init.sh` that drops
  `sgc` from its `for cluster in equestria sgc` and `for p in admin pulumi
  eso-equestria eso-sgc viewer` loops, so a future re-run of the init script
  doesn't recreate what this piece just deleted.
- Verify with `equestria-init.sh status` afterward — it already checks `for p
  in admin pulumi eso-equestria eso-sgc viewer` and will flag `eso-sgc` as
  unexpectedly present if the delete didn't take; update that check list to
  drop `eso-sgc` once it's confirmed gone, or the script will nag forever
  about an absence that is now correct.

### 6. SGC cluster-secret keys

- `stargate-command-cluster:kubernetes/flux/meta/cluster-secrets.sops.yaml`
  holds `AUTOMATION_VIP` (`10.10.209.203`, mosquitto — already retired per
  the MQTT renumber, **Q-F**), and the equivalent for `TECHNITIUM_VIP`/`ADGUARD_VIP`
  (`10.10.209.202`) and `CHRONY_VIP` (`10.10.209.204`, renumbered per the
  2026-08-01 answer, "Lets renumber"). These die with the repo archival
  (§9) — no separate action needed once the repo is read-only, since nothing
  live reads from it after phases 13–15 cut the apps over.
- `home-operations:kubernetes/components/common/shared-secrets.sops.yaml`
  has its own `SGC_API_IP` key (verified present, value still `ENC[...]` —
  never decrypted in this session, only confirmed the key exists). Remove it
  with `sops unset` (not hand-editing the encrypted blob) once nothing reads
  it — grep every `${SGC_API_IP}` / `SGC_API_IP` consumer first. `sops unset`
  rewrites the whole document and renormalises indentation, so diff the
  result whitespace-stripped to confirm the change is cosmetic-plus-one-key,
  the same discipline the OpenBao migration used for the equivalent
  `CLOUDFLARE_SECRET` cleanup (`vault:docs/openbao-migration/STATUS.md`).

### 7. The three SGC 1Password Backblaze items (OpenBao-migration Phase 7 leftovers)

Per `vault:docs/openbao-migration/STATUS.md` ("The three Backblaze ones are a
REMOVAL"), SGC has the same three items equestria already cleaned up
(#3092/#3093): `tailscale-resources-secret` (dead since 2026-03-12, delete
outright), and `postgres-backup-config` + `postgres-values` (drop the
`${BACKBLAZE_DATABASE}` extract and `[backblaze]` rclone block; the endpoint
was already Minio, only the bucket name still came from Backblaze — SGC's
`BACKBLAZE_DB_BUCKET` is `stargate-command-db`, rendering
`stargate-command-db-restore`). **As of STATUS.md's last update (2026-08-10)
these three were still open** ("What is left" under Phase 7), alongside
deleting SGC's now-unreferenced `CLOUDFLARE_SECRET`/`CLOUDFLARE_TUNNEL_SECRET`
sops keys. Given OpenBao Phase 8 is recorded complete-and-live as of
2026-08-12 in this session's own memory, **verify these are actually done
before archiving the SGC repo read-only** (§9) — if they're not, archiving
freezes them undone, since the fix lives inside `stargate-command-cluster`'s
own sops files and a read-only repo can't take the follow-up PR.

### 8. Dashboards, alerts, and monitoring

- `dashboard/resources/servers/sgc.yaml` (glance page: Stargate Command) —
  delete the file.
- `dashboard/resources/dynacat.yml:113` — `- $include: servers/sgc.yaml` —
  remove the include.
- `dashboard/resources/homelab.yaml:5,9` — `${GLANCE_K8S_SGC_URL}`,
  `${HEADLAMP_SGC_URL}` — remove the widget block that used them (or the
  whole block becomes dead once `servers/sgc.yaml` is gone; check for other
  consumers of these two env vars before assuming homelab.yaml's is the
  only one).
- `dashboard/resources/compose.yaml` — `SGC_TUNNEL_USERNAME`,
  `SGC_TUNNEL_CREDENTIAL`, `GLANCE_K8S_SGC_URL`, `HEADLAMP_SGC_URL` env
  entries; the `sgc-glance` service block; the `./sgc.kubeconfig.json`
  volume mount. Remove all of it — this is a live Docker Compose stack
  (glance runs on Docker, not in-cluster), so this is an actual running
  container to retire, not just config.
- `components/constants.ts:19-33` — the `dnsServers` map's `"Stargate
  Command": { ips: ["10.10.209.202"], use: true, internal: true }` entry.
  **This is live config, not just documentation**: `dns.internalIps`
  (derived from this map) is consumed by
  `stacks/unifi-network/local-dns.ts:84` to build UniFi's advertised
  internal DNS server list (`.slice(0, 4)`). Removing this entry changes
  what DNS servers UniFi hands out — verify via `pulumi preview` on
  `unifi-network` that the resulting list is still correct (four internal
  resolvers minus one, not a hole) before applying.
- `stacks/unifi-network/acl-manager.ts` — beyond the VIP/IP entries in §1:
  `kubernetesDevices: ["sgc", "equestria"]` (line 84, drop `"sgc"`),
  `tag: tag.sgc` (line 106), `clusterNetwork: "10.209.0.0/16"` (line 107),
  `manager.setExitNode(tag.sgc)` (line 687). Each is a live UniFi ACL/routing
  rule — `pulumi preview` each change individually rather than deleting the
  whole `sgc` zone block in one edit, since this file has already been the
  site of two live-DNS-wiping incidents from careless `import`/`deleteBeforeReplace`
  changes (see the estate's standing caution on `StandardDns`).
- **Prometheus/Thanos/Alertmanager**: no static SGC-cluster scrape config
  exists in `home-operations` (equestria's observability stack discovers
  targets via ServiceMonitor/PodMonitor inside the cluster, not hardcoded
  hostnames) — this class of reference disappears by construction once SGC
  stops existing as a Kubernetes cluster. The dashboard's `Cluster: Stargate
  Command` glance widget queries Thanos with a literal `cluster="sgc"` label
  filter (`dashboard/resources/servers/sgc.yaml`), covered above.
- **unifipoller**: no SGC-specific config found (`grep`-verified across
  `home-operations`) — the estate's UniFi poller scrapes network devices,
  not cluster-scoped resources. No action expected; re-verify at execution
  time in case something was added since.
- **docker/ compose references**: none found in `home-operations`'s
  `docker/` tree (`grep -rln -i "sgc\|10\.10\.209\." docker/` returns
  nothing) beyond `dashboard/resources/compose.yaml` above, which lives
  outside `docker/`. Confirmed clean.
- **Gatus schema references**: `docker/alpha-site/uptime/definition.yaml`
  and `docker/alpha-site/uptime/config/*.yaml` point their
  `# yaml-language-server: $schema=` comments at
  `raw.githubusercontent.com/david-driscoll/stargate-command-cluster/refs/heads/main/schemas/...`.
  Cosmetic (editor validation only, not a runtime dependency), but repoint
  to wherever `home-operations` publishes the equivalent schema, or to
  `equestria-cluster`'s copy if `home-operations` doesn't have one yet — an
  archived-but-still-public repo keeps serving raw file content on its
  default branch, so this won't actually break, but it's a stale pointer
  worth fixing while touching the area. **Not checked this session:**
  whether the Gatus config itself (not just its schema comment) has any
  `endpoints:` entries probing SGC hosts or `*.sgc.driscoll.tech` — verify
  at execution time.

### 9. Repos, docs, CI, and the crew's own routing

- **`equestria-cluster`** and **`stargate-command-cluster`** — both archived
  read-only after [21](21-repo-consolidation-flux-repoint.md)'s exit gate.
  Not deleted: they're the rollback reference and hold the sops history for
  everything that predates this migration. (Both, not just SGC's — by this
  point `home-operations` is the sole live source for the merged cluster,
  so equestria's own repo is equally retired.)
- **Disable `equestria-cluster:.github/workflows/sgc-sync.yaml`
  before archiving either repo**, not after — it syncs files into
  `stargate-command-cluster` on a nightly cron and every push to `main`; once
  the target is archived and read-only, this workflow starts failing
  (`repo-file-sync-action` can't open a PR against a read-only repo) instead
  of quietly becoming a no-op. Disabling the workflow is a one-line change
  (delete the file or its triggers); do it as the first step of this
  sub-piece, not an afterthought.
- **`.crew/routing.md:10`** — the routing table entry naming Tank's scope as
  "the `equestria` and `sgc` application namespaces". Update to drop `sgc`.
- **`.crew/team.md:62,69`** — "vs `sgc` 11" (a namespace-count comparison)
  and the ownership table row `flux-system, equestria, sgc | Tank`. Update
  both; the count comparison becomes stale prose once sgc's namespace is
  gone, not just the ownership row.
- **`.crew/agents/tank/charter.md:15,30`** — Tank's charter explicitly lists
  `sgc` (11 releases) as owned scope in two places. Update.
- **`.crew/casting/history.json`** — mentions `sgc` in a historical note
  about Tank's charter being narrowed. **Do not edit** — it's a record of a
  past decision, not current state; rewriting history here defeats its
  purpose.
- **`scripts/op-to-bao/mapping.yaml`** — contains ~11 SGC-related entries
  (`clusters/sgc/apps/*`, `shared/sgc-*`). This is a **generated,
  one-time-review artifact** from the completed 1Password→OpenBao migration
  (per `scripts/op-to-bao/mapping.ts`'s own doc comment: "a proposal... for a
  human to review before anything is written"), not live configuration
  consumed at runtime. No action needed — flagged here only so it isn't
  mistaken for a live reference during the grep pass this piece is built
  around.
- **`.claude/skills/triage-alerts/SKILL.md`**, and its duplicates
  `.agents/skills/triage-alerts/SKILL.md` and
  `.apm/skills/triage-alerts/SKILL.md` (three copies, one per agent
  framework this repo supports — update all three together or they drift):
  - "AlertManager runs in the equestria cluster... and covers alerts from
    **both equestria and SGC**" — update once SGC alerts no longer exist
    separately.
  - `SGC=/Users/david/Development/david-driscoll/stargate-command-cluster/kubeconfig`
    and `KF=$EQ  # or $SGC depending on the cluster` — remove the `$SGC`
    variable and its usage.
  - The triage-report format ("Sort alerts flat by severity... then cluster
    (equestria before sgc)") and its worked example (`[error] sgc |
    namespace | AlertName`) — update to a single-cluster format.
- **`.github/copilot-instructions.md`** — an infrastructure table row,
  `"**Stargate Command (SGC)** | Dockge/Docker | Docker host; hosts
  Authentik, 1Password Connect"` — stale on two counts by this point
  (authentik moved to alpha-site per phase 7/07, and SGC isn't Dockge/Docker,
  it's/was a Talos cluster — this row looks like leftover copy-paste from a
  template and is worth fixing properly, not just deleting). Also line 124,
  `"Test destructive changes on **Alpha Site** before Celestia/Luna/SGC"` —
  remove `SGC` from that list; note this line's Alpha Site framing is the
  same test-target question [08](08-test-target-redesignation.md) raises for
  `CLAUDE.md:63` (**D12**, unresolved) — fix both together once David
  confirms the re-designation, don't fix one and leave the other stale.
- **`docs/codebase/STACK.md`**, **`docs/codebase/INTEGRATIONS.md`** — both
  mention `sgc` in generated codebase documentation. Regenerate (per
  whatever produces `docs/codebase/*`, evidenced by `.codebase-scan.txt`
  sitting alongside them) rather than hand-editing, so they stay consistent
  with whatever else changed in this piece.
- **`docs/openbao-pulumi-adoption.md`** — mentions `sgc` in the context of
  the cluster-auth adoption pattern this piece's §5 exercises. Update once
  §5 is done, noting the mount was retired rather than adopted.
- **CLAUDE.md / AGENTS.md**: no `sgc` literal found in either at the repo
  root (verified via grep). No action needed there specifically, but see the
  `copilot-instructions.md` note above for the equivalent stale line in that
  file.
- **A minor, low-priority find**: `equestria-cluster:talos/talconfig.yaml`'s
  `additionalApiServerCertSans` list includes
  `k8s-equestria.sgc.svc.cluster.local` — a cross-cluster SAN left over from
  the kubeproxy-routing pattern (§3). It doesn't need urgent action (a stale
  SAN on an already-issued cert isn't a live problem), but note it for
  whoever next regenerates equestria's control-plane certs, so it isn't
  carried forward by habit.

## Procedure

1. **Disable `sgc-sync.yaml` first** (§9) — do this before anything else in
   this piece, so no later step races a scheduled sync job.
2. **Verify OpenBao-migration Phase 7 leftovers are actually closed** (§7).
   If not, close them inside `stargate-command-cluster` before archiving it.
3. Work through §1–§8 in any order — they're independent of each other, but
   each is a real `pulumi preview`/`pulumi up` or a real edit, not a batch
   find-and-replace. Confirm each with its own preview before moving to the
   next; this file's structure is the checklist.
4. **Re-run backup verification end to end** — the migration phases (13–19)
   already moved SGC's data; this is a final confirmation that nothing
   backup-related quietly depended on SGC still existing (VolSync repos,
   `pg_dump` targets, PBS datastore references).
5. **Archive both cluster repos read-only** (§9) — last, after everything
   above, so the archival can't block a fix that turned out to still be
   needed.
6. Update the runbooks/CLAUDE/AGENTS/crew docs enumerated in §9.

## Exit gate

`grep -rn "sgc\|10\.10\.209\." --include="*.ts" --include="*.yaml" --include="*.yml" --include="*.md" --include="*.json" .`
across `home-operations` (excluding `node_modules`, `package-lock.json`, and
this planning doc set) returns **zero live-configuration hits** — only
historical records (`.crew/casting/history.json`) and the generated
`scripts/op-to-bao/mapping.yaml` artifact, both explicitly exempted above.
OpenBao has no `kubernetes-sgc` mount and no `eso-sgc` policy
(`equestria-init.sh status` confirms). The Talos API VIP `10.10.209.201` is
unreferenced. DNS records under `sgc.driscoll.tech` and `*.209.*` PTR/A
records are gone from Cloudflare and Technitium. Backup verification has run
clean end to end. Both cluster repos are archived read-only.

## Risks and rollback

| Step | What breaks | How you'd know | Rollback | Point of no return |
|---|---|---|---|---|
| §3, `pulumi destroy` on the `sgc` application stack | Destroys live-but-unused Authentik OIDC config scoped to SGC | `pulumi preview` shows the delete before `up` applies it | None needed if previewed first — this is deliberate, not accidental | None — this is intentional teardown, gated by preview |
| §5, OpenBao mount/policy deletion | ExternalSecrets that still (incorrectly) reference `kubernetes-sgc` fail login | ESO logs, `ClusterSecretStore` unhealthy | Recreate the mount/policy from `equestria-init.sh`'s definitions if something unexpected still needs it | None — nothing should still need it at this point in the sequence |
| §2/§6, DNS record deletion | Deleting the wrong record (namespace collision with a similarly-named equestria record) | Something can't resolve | Re-add from Cloudflare/Technitium history | None if scoped correctly — this is the same class of risk the estate's `StandardDns` incidents came from; double-check before deleting, this repo has wiped live DNS twice before from adjacent carelessness |
| §9, archiving too early | A leftover Phase-7 OpenBao item (§7) becomes unfixable because the repo is read-only | Discovered later, can't open a PR | Un-archive temporarily to land the fix, then re-archive | Soft — GitHub archival is reversible, just an extra round-trip |

## Cross-references

- [README.md](README.md) — decision ledger, full sequencing graph
- [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md) — hard prerequisite; this piece starts at its exit gate
- [23-talos-in-pulumi.md](23-talos-in-pulumi.md) — sibling follow-on, also gated on 21, independent of this piece

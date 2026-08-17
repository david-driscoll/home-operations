# 22 — Decommission SGC (Letter U)

> Every SGC reference retired: VIP, DNS, stacks, OpenBao mounts, cluster
> definitions, repos archived. Part of the
> [cluster consolidation plan](README.md) for
> [vault#84](https://github.com/david-driscoll/vault/issues/84); see that file
> for the decision ledger (D1–D12) and full sequencing graph. This file stands
> alone — no prior context required.

> **Revision 2026-08-16 — re-audited live, and the plan below changed shape.** Four
> parallel read-only audits (repo grep, live cluster, Pulumi state, secrets/backups)
> re-verified this file against the estate. The inventory's *taxonomy* held; a lot of its
> *facts* did not. Read this block before executing any section.
>
> **The premise was wrong.** This file opens with "By the time this piece starts, SGC no
> longer exists as infrastructure." SGC is a **fully live 3-node Talos cluster** —
> `milky-way`/`othalla`/`pegasus` all Ready, 77 Flux Kustomizations Ready, 41
> ExternalSecrets syncing. Phases 18–19 have not run. What *has* changed is that its
> workloads are gone: only superseded authentik remains in namespace `sgc`, and tsidp/tsiam
> now run on equestria. So this piece is executable **against a live cluster**, which several
> steps actually require — but it is not the post-mortem cleanup the text assumes.
>
> **Corrections that change what you do:**
>
> - **§1–§8 are not independent.** The procedure said "work through §1–§8 in any order."
>   They are strictly ordered — see *Rules that govern the order* below. Two of the
>   orderings are the difference between a clean teardown and an estate-wide outage.
> - **Deleting `clusters/sgc.yaml` breaks the SSO control stack**, not just a test. §4 missed
>   that `stacks/authentik` read the SGC cluster definition. Defused in #875 — but the
>   ordering constraint it implies (five consumers, not one) is real and enumerated below.
> - **`pulumi destroy` on the `sgc` stack breaks three unrelated stacks.** `BACKUP_PLAN_KEYS`
>   hard-required `stargate-command-backup-plan`, and `backupPlanKeys()` throws on a missing
>   entry, taking `stacks/home`, `stacks/ocracoke` and `stacks/gulf-of-mexico` with it. Also
>   defused in #875.
> - **`pulumi destroy` does not clean OpenBao.** `baoKvSecret` sets `retainOnDelete: true`
>   (`components/bao.ts:372`), so every `clusters/sgc/*` path survives the destroy. §4's open
>   question — "verify the delete actually happens" — resolves to **no**. Hand-deletion with
>   `bao kv metadata delete` is a required step, not a fallback.
> - **§8's "no static SGC-cluster scrape config exists in `home-operations`" was wrong.**
>   There were three blackbox probes and a `severity: critical` pager. Retired in #874,
>   at the generator rather than the rendered YAML.
> - **§6's file path was wrong.** `SGC_API_IP` is at `kubernetes/flux/meta/shared-secrets.sops.yaml`,
>   not `kubernetes/components/common/`.
> - **The exit gate was unachievable as written.** It exempts `scripts/op-to-bao/mapping.yaml`,
>   which no longer exists, and does not account for the 108-file `$schema=` class or the
>   incident citations that should deliberately survive. Rewritten below.
> - **`stacks/home` owns `cnpg-sgc-backups`** with `protect: true, retainOnDelete: true` —
>   SGC's CNPG recovery window, deliberately destroy-proof. Absent from this file entirely.
>
> **Naming trap, stated once because it is genuinely confusing:**
> `kubernetes/apps/stargate-command/` is a **namespace in the merged cluster** holding chrony,
> matter, mosquitto and home-assistant — the apps that already migrated, every `ks.yaml`
> carrying `deletionPolicy: Orphan` on purpose. It is **not** the SGC cluster. Deleting it
> deletes running home automation.

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

## Rules that govern the order

Four constraints, each learned from something that already went wrong. Everything in the
inventory sections is subordinate to these.

**1. Stop SGC's external-dns before touching any DNS source.** SGC runs three external-dns
controllers — `cloudflare-dns`, `technitium-dns`, `unifi-dns` — with
`--policy=sync --txt-owner-id=sgc --domain-filter=driscoll.tech`. That filter is the whole
estate zone, **not** `sgc.driscoll.tech`. Under `policy=sync` a controller deletes records it
owns when their source disappears, and Cloudflare-side TXT ownership is confirmed for
`truenas.driscoll.tech` and `odyssey.driscoll.tech`. So deleting the SGC DNSEndpoints — or
merely suspending SGC's Flux tree — while those controllers run makes them **delete live
estate records on the way out**. Suspend the HelmReleases, scale the Deployments to zero,
confirm zero pods, and only then touch a DNSEndpoint.

*Executed 2026-08-16:* all three are suspended and scaled to 0 on the live cluster, with no
corresponding commit. If anything resumes SGC's Flux they come back. See *Live state not in
git* below.

**2. `pulumi destroy` needs SGC's API reachable, but `pulumi preview` will not work later.**
The `sgc` stack's program enumerates the live cluster (`coreApi.listNamespace()`, then
`ApplicationDefinition` CRs per namespace) — so once SGC is down or `sgc-kubeproxy` is gone,
`pulumi preview` on it cannot run at all. `destroy` does *not* run the program, so it still
works — but it deletes `Secret` objects **inside** SGC, so the API and the kubeproxy path
must both still be alive. **Gate with `pulumi destroy --preview-only`, never `pulumi preview`,
and run it while SGC is up.**

**3. Pulumi deletions do not reach OpenBao.** `retainOnDelete: true` on `baoKvSecret` means
the destroy drops resources from state and leaves the KV paths live. Every SGC path needs an
explicit `bao kv metadata delete`. Until that happens, the three `BackupPlanDirector`s keep
minting backrest jobs for a dead cluster.

**4. Retire monitoring before power-off, not after.** SGC's probes report healthy today, so
removing them is a no-op now. Leave them and `BlackboxProbeFailingCritical` pages within
**two minutes** of shutdown. Same shape for Gatus: 14 pushover-alerting checks plus 9 volsync
heartbeats.

**5. Two removals are only safe *after* the thing they describe is actually gone.**

- `kubernetes/apps/tailscale-system/services/Update.cs`'s `decommissionedServers` entry (added by
  #874) excludes `sgc` from the generated tailnet probes. Remove it only **after SGC's machines
  leave the tailnet** — while the Tailscale API still returns the device, regeneration re-emits all
  four probes, which then flatline and page at `severity: critical` within two minutes via the
  non-probe-scoped `BlackboxProbeFailingCritical`. The entry is self-documenting about this; the
  step just was not in any procedure.
- `components/constants.ts:120`'s `tag:sgc` and the generated `types/tailscale-grants.d.ts` member
  are strictly ordered behind the three `acl-manager.ts` usages (`:84`, `:106`, `:687`). Constant
  first is a compile break; hand-editing the generated type before regenerating just gets reverted
  by codegen.

**6. Archiving `stargate-command-cluster` is itself a gated step, and more depends on it than §9
records.** Beyond the sops keys and debris ExternalSecrets that must land first, the crew still
routes work to that repo (`.crew/config.json`, `manifest.json`, `crew-registry.json`,
`comment-watch.md`, `routing.md`, `team.md`, and the `link`/`morpheus`/`sparks` charters), and
`home-operations.code-workspace` depends on the local clone both as a folder root (`:12-13`) and
for `sops.defaults.ageKeyFile` (`:43`). **Leave the crew references in place until the SGC repo's
own cleanup PRs have landed** — retiring the routing first means the crew cannot work the repo it
still needs to change.

## Depends on / sequencing

**[21](21-repo-consolidation-flux-repoint.md)'s exit gate is met.** Phase C completed
2026-08-14 — `kubernetes/flux/cluster/ks.yaml` records *"This is now the live root:
equestria-cluster is no longer a GitOps source"*, with prune restored. The merged cluster
reconciles from `home-operations` alone.

What remains of the original two-repo concern is that **SGC still self-reconciles from
`stargate-command-cluster`**, which is the thing being retired rather than a blocker on
retiring it. So this piece is no longer gated behind phases 18–19; the parts of it that need
a live SGC (rule 2) are in fact *easier* now than after the node phases.

The genuine remaining prerequisite is [07](07-authentik-to-alpha-site.md) step 9 — SGC's
authentik scaled to zero — and that is itself gated on 07's soak, because SGC's database is
the rollback artifact for a cutover completed 2026-08-16.

## Inventory — every class of reference found, verified 2026-08-13

**Partially superseded.** The taxonomy below is sound and still the right checklist shape, but
individual line numbers, file paths and "nothing depends on this" claims were re-audited
2026-08-16 and several did not survive. Where a section carries an inline **corrected
2026-08-16** note, that note wins. Re-run each section's grep before acting on it rather than
trusting the counts here.

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
- `home-operations:kubernetes/flux/meta/shared-secrets.sops.yaml` — **corrected 2026-08-16;**
  the `kubernetes/components/common/` path named here originally does not hold it. Re-verified:
  `SGC_API_IP` has **zero consumers** across all four repos — defined, never substituted — so
  it is one of the few items in this file with no blocker at all
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
- **Prometheus/Thanos/Alertmanager**: ~~no static SGC-cluster scrape config~~ — **wrong,
  corrected 2026-08-16.** `kubernetes/apps/tailscale-system/services/sgc.yaml` carried three
  blackbox `Probe`s and a `severity: critical` `TechnitiumDnsUnhealthy` rule, and
  `sgc-kubeproxy.yaml` a fourth probe. Worse, the shared `BlackboxProbeFailingCritical` is not
  probe-scoped, so it matched all four at **2 minutes**. Both files are generated from
  `Update.cs`, so the rendered YAML alone would have regenerated. Retired at the generator in
  #874. Original text follows, for the parts that were right: no static scrape config
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

## Live state not in git

Things already done to the running estate that no commit records. Reconcile or remove these
deliberately; do not let them be discovered later.

| What | Where | Why it matters |
|---|---|---|
| `cloudflare-dns`, `technitium-dns`, `unifi-dns` HelmReleases **suspended**, Deployments scaled to **0** | SGC ns `network`, 2026-08-16 | Rule 1. If SGC's Flux resumes, they return and re-assert `replicator.driscoll.tech → 10.10.209.203`. Needs a `stargate-command-cluster` commit, or must simply outlive SGC |
| Stale `replicator.driscoll.tech` A records deleted by hand — `10.10.209.202` (Cloudflare, by record id) and `10.10.209.203` (Technitium) | 2026-08-16 | Was a live three-way split-brain: half of all resolutions returned an address with no broker behind it. Fixed; all five Technitium resolvers, MagicDNS and public now return `10.10.206.203` alone |
| `sgc/automation-dns`, `sgc/discord-dns`, `sgc/spike-dns` DNSEndpoints **still present** | SGC ns `sgc` | Inert only because rule 1 stopped their controllers. Delete them in the SGC repo during teardown, never by `kubectl` against a running controller |
| **`pulumi destroy --stack sgc` executed**, 2026-08-17 09:44 | Minio `applications/sgc` | Established from the state checkpoint (~1.1 MB → 21 KB across three writes in one minute) and corroborated live: authentik applications 128 → 113 (the stack owned exactly 15 `ApplicationDefinition`s), users 12 → 11 (the outpost's service account), no `sgc` outpost or service connection left. **The stack still exists in the backend as an empty checkpoint** — `pulumi stack rm sgc` finishes it |
| `sgc` Stack CR pruned via `# - ./sgc.yaml`, 2026-08-17 12:37 | `kubernetes/apps/pulumi/applications/kustomization.yaml` | Safe **only because the destroy came first**. `destroyOnFinalize: false` means pruning the CR abandons resources rather than destroying them — had the order been reversed, everything the stack owned would now be live and unmanaged with no reconciler |
| Orphaned Gatus file **deleted by hand**, 2026-08-17 | `dockge-as:/opt/stacks-data/uptime/config/uptime-cluster-apps-sgc.yaml` | Survived the destroy by construction (`addUptimeGatus` → `copyFileToRemote` with no `withRemoveCommand`, `components/helpers.ts:229`). Its estate-wide `Authentik` check needed no relocation after all — alpha-site's own definition already publishes four checks covering the same names |

## Latent, not live — two things that read as emergencies and are not

A 2026-08-17 sweep flagged both of these as imminent breakage. Both were checked against the
running estate and neither is. Recorded here so the next reader does not re-raise them.

- **`iptv-sync`'s S3 endpoint on SGC.** `kubernetes/apps/equestria/pvr/iptv-sync/secret.yaml:36`
  sets `AWS_ENDPOINT_URL_S3: https://s3.sgc.${ROOT_DOMAIN}`. The app is **disabled** —
  `kubernetes/apps/equestria/pvr/kustomization.yaml:8` is `# - ./iptv-sync/ks.yaml`, and no CronJob
  or ExternalSecret exists in the cluster. It is a landmine for whoever re-enables it after
  teardown, not a running failure. A warning comment at the line is the right fix, not a scramble.
- **The `dns.config` Gatus fan-out.** `components/constants.ts:32-37` marks Stargate Command
  `uptime: true`, and `components/StandardDns.ts:242` would emit a Gatus DNS check per record
  against `10.10.209.202`. It does not: the generated `uptime-dns-*.yaml` files on `dockge-as`
  contain **zero** `Stargate` and exactly one group, `DNS @ Discord`. The entry is inert. Remove it
  as cleanup, not as an alert-storm mitigation.

## Verified clean — negative space worth trusting

Checked 2026-08-17 and found to need no action. Listed so the same ground is not re-audited.

- **Thanos ruler.** `kubernetes/apps/observability/thanos/resources/ruler.yml:8` is
  `sum by (cluster) (up{job=~".*prometheus.*"}) == 0`. Series *disappearance* yields no vector
  element, so `== 0` cannot match — SGC's remote-write stopping produces no false page.
- **Alertmanager** routes on `severity` only, with no `cluster` matcher, and no SGC-scoped silence.
- **1Password Connect.** `kubernetes/apps/kube-system/external-secrets/stores/onepassword-store.yaml:11`
  points in-cluster on equestria, not at `op-connect.sgc.driscoll.tech`. All 28 consumers are safe.
- **Grafana/Prometheus** carry per-cluster `externalLabels` and label-driven dashboard variables
  that self-prune; the GPU dashboard and intel-gpu-exporter references are comments only.
- **No arity assumptions.** `components/store/index.ts`'s cluster getters are plain filters; no
  `replicas: 2` or similar pair-sized value keyed to there being two clusters exists anywhere.

## Additional inventory classes, found 2026-08-17

Not in §1–§9. Each is small; the value is that they are written down.

| Item | Where | Note |
|---|---|---|
| Eight `sgc` npm scripts | `stacks/applications/package.json` ~18-29 | `up:sgc`/`down:sgc`/`cancel:sgc`/`refresh:sgc` plus four aggregates. `up` and `refresh` chain with `&&`, so they exit non-zero once `Pulumi.sgc.yaml` goes. Remove **after** the destroy, **before** deleting the config |
| `Pulumi.sgc.yaml`, and the Stack CR manifest | `stacks/applications/`, `kubernetes/apps/pulumi/applications/sgc.yaml` | Both orphans now — the CR is already commented out of its kustomization |
| The cluster/type mapping is **wrong**, not merely stale | `CLAUDE.md:39` | Lists Celestia and Luna as Kubernetes and Equestria/SGC as Dockge. It is the reverse. Same defect class as `.github/copilot-instructions.md:15`. §9's "no `sgc` literal found, no action needed" was a `sgc`-only grep and missed `Stargate` |
| `$cluster = 'sgc'` default in two live-ops cells | `playbook/volsync.ipynb` ~53, ~83 | Builds `/mnt/stash/backup/$cluster/volsync` paths an operator would hit post-teardown |
| A three-repo invariant that archival makes unmaintainable | `kubernetes/apps/kube-system/openbao-replica/resources/age-recipients.txt:2` | Declares the recipient set must stay identical across this repo, `vault` and `stargate-command-cluster`. Once the third is read-only, a future rotation diverges permanently — and the failure mode the file itself names is an undecryptable dump. Reword to a two-repo invariant as part of archival |
| `docs/codebase` regeneration is wider than §9 says | `ARCHITECTURE.md:93`, `STRUCTURE.md:133`, `CONCERNS.md:63,67` | §9 names only `STACK.md` and `INTEGRATIONS.md`. Regeneration must cover four more |
| A branch that can no longer match | `stacks/applications/index.ts:16` | `if (clusterDefinition.key === "sgc" \|\| clusterDefinition.key === "equestria")` — there is no `sgc` stack left to instantiate it. Harmless, but the condition and its comment block want a pass once the iris re-home settles |
| External-dns **TXT registry** records, not just the A records | Cloudflare | Every SGC-published record has a paired ownership TXT prefixed `sgc.` (`txtPrefix: "${CLUSTER_CNAME}."`). Equestria's external-dns will never reap records owned by `sgc`, and SGC's own is stopped — so nothing cleans either the records or their TXT twins. Grep for `sgc.`-prefixed TXT as well as the A records |

## The two phases, and why the split is where it is

**Decision, David, 2026-08-17:** everything that touches a live network surface — the Tailscale
ACL, UniFi's DHCP nameserver list, the tailnet tag set — is deferred to **the final
decommissioning of the cluster**, not done piecemeal as reference cleanup.

That is the right cut, and it is not merely about convenience. Reference rot is safe to remove
early because nothing reads it. These are different: each one is *live configuration that
currently works*, describing a cluster that still exists. Removing them early buys nothing and
each carries its own preview-and-verify cost — `pulumi preview` is untrustworthy on exactly the
three stacks involved (phantom `StandardDns`/`TailnetKey`/`DeviceTags` deletes), a full `refresh`
hard-errors on the UniFi read-404, and the tag removal is a strict three-step ordering across a
constant, its usages and a generated type. Doing them once, together, against a cluster that is
actually gone, is both cheaper and safer than doing them one at a time against one that is not.

### Phase 1 — reference cleanup, safe while SGC still runs

Steps 1–13 below, minus the items pulled into phase 2. These remove things nothing reads, or
things whose removal was already gated and cleared. Most are done.

### Phase 2 — final decommissioning, at power-off

Do these as one deliberate exercise, in this order, when the cluster is actually being retired:

1. **Suspend SGC's Flux tree.** Gate for the OpenBao work below — 41 ExternalSecrets authenticate
   through `kubernetes-sgc`, and deleting the mount first breaks all of them at once.
2. **`openbao-sgc-auth` out of `stacks/home`**, then `up`. Targeted `--target` refresh only; judge
   from `pulumi stack history`, never preview.
3. **`clusters/sgc.yaml`**, and the hand-deletion of every OpenBao path behind it (rule 3 —
   `retainOnDelete` means Pulumi never reaches them).
4. **The `kubernetes-sgc` mount and `eso-sgc` policy/role.**
5. **The Tailscale ACL surface**, strictly ordered: `stacks/unifi-network/acl-manager.ts`'s three
   usages (`:84` `kubernetesDevices`, `:106-110` the `sgc` zone / `kubeApiIp` / `publicIps` /
   `clusterNetwork`, `:687` `setExitNode`) — each previewed on its own — then
   `components/constants.ts:120`'s `tag:sgc`, then regenerate `types/tailscale-grants.d.ts`.
   Constant-first is a compile break; hand-editing the generated type before regenerating gets
   reverted by codegen.
6. **`components/constants.ts:32-37`**, the `"Stargate Command"` DNS server entry. Two consumers:
   `stacks/unifi-network/local-dns.ts:84` (UniFi's advertised DHCP nameservers, `.slice(0, 4)`) and
   `components/StandardDns.ts:242` (the Gatus fan-out, currently emitting nothing — see *Latent,
   not live*). Then `up` on `home`, `gulf-of-mexico` and `ocracoke`.
7. **`sgc-kubeproxy`** — both the `pulumi` namespace ExternalName and the `tailscale-system` one.
   Late, because the destroy path needed it while it existed.
8. **The backup estate, in one change**: `/spike/backup/sgc/`, the three backrest copy jobs, and
   the nine `sgc-volsync-*` Gatus heartbeats. They stay green after teardown because local copy
   jobs feed them, then page simultaneously when the data goes.
9. **`cnpg-sgc-backups`.** `protect: true` + `retainOnDelete: true`, holding a 13-day CNPG recovery
   window. Pulumi cannot delete it; only a deliberate manual Minio delete can. **This is the real
   point of no return for SGC's data** and wants an explicit decision, not a step that falls out of
   a checklist — see the note below.
10. **Crew references and archival**, in that order, then `Update.cs`'s `decommissionedServers`
    entry once the machines have left the tailnet.

**On step 9, stated plainly because it is easy to let slide:** SGC's authentik database is still
the rollback artifact for the alpha-site cutover, and the barman window is one of only two things
protecting it (the other being the nightly `authentik.sql.gz`). Both die with the cluster. Retiring
that bucket is the moment authentik's pre-cutover state stops existing anywhere. Piece 07's soak is
what should decide the date, not this file.

## Procedure

Ordered. The first four steps are ordering-critical; the rest are genuinely independent of
each other but all sit behind them.

1. **DONE 2026-08-17. Confirm the fuses are reconciled green.** #875 (`BACKUP_PLAN_KEYS`, `stacks/authentik`)
   and #874 (probes and alerts) must both be live in the cluster, not merely merged —
   otherwise steps 5 and 7 break other stacks. Check the `home-operations`, `authentik`,
   `ocracoke` and `gulf-of-mexico` Stacks are `succeeded` at a commit at or after both.
2. **DONE 2026-08-16, verify it has not been resumed. Stop SGC's external-dns** (rule 1) if it has been resumed since 2026-08-16. Verify zero
   pods before continuing.
3. **N/A here. Disable `sgc-sync.yaml`** — it lives in `equestria-cluster`, not here (§9). Confirmed
   absent from `home-operations`; `.github/workflows/` holds only `label-sync.yaml`.
4. **Scale SGC's authentik to zero** — [07](07-authentik-to-alpha-site.md) step 9, after its
   soak. Re-probe first: SGC was still answering `authentik.${tailscaleDomain}` for skystar's
   outpost as late as 2026-08-16 20:15Z via a serve config nobody could locate, which cleared
   on a pod restart rather than by configuration. Send a marked request and confirm it lands
   on alpha-site, and that skystar's outpost is bound there, before scaling down.
5. **DONE 2026-08-17 09:44, in the correct order. Destroy the `sgc` Pulumi stack** while SGC is still up (rule 2):
   ```sh
   pulumi stack export --stack sgc > /tmp/sgc-state.json   # read the real ledger, not the program
   pulumi destroy --stack sgc --preview-only               # gate. NOT `pulumi preview`
   pulumi destroy --stack sgc                              # no --yes; read the confirmation
   ```
   Then remove the Stack CR, `Pulumi.sgc.yaml`, and the `./sgc.yaml` kustomization entry.
   Do **not** pass `--run-program`.
6. **DONE 2026-08-17. Delete the orphaned Gatus file by hand.** `addUptimeGatus` calls `copyFileToRemote`
   *without* `withRemoveCommand: true` (`components/helpers.ts:229`, option at :114-126), so
   the resource has no delete behaviour and
   `/opt/stacks-data/uptime/config/uptime-cluster-apps-sgc.yaml` survives the destroy on
   `dockge-as`. **First relocate the `Authentik ` check inside it** — that one is the
   estate-wide SSO check, now pointing at alpha-site; deleting the file wholesale silently
   drops SSO uptime monitoring.
7. **Remove `openbao-sgc-auth` from `stacks/home`** and `up`. Targeted `--target` refresh only
   — a full refresh hard-errors on the UniFi read-404 — and judge from `pulumi stack history`,
   never from preview, which invents phantom deletes on this stack.
8. **Delete `clusters/sgc.yaml`.** Five consumers, verified: `stacks/home:422`,
   `stacks/authentik:115` (defused in #875), `stacks/applications` instance `sgc`,
   `components/authentik/flows.ts:196` (tailscale OAuth redirect URIs),
   `stacks/applications/warpgate.ts:20`, plus **seven** assertions in
   `components/store/clusters.test.ts` — not the single `:204` this file used to name.
9. **Hand-delete every OpenBao path** (rule 3): `clusters/sgc/details`,
   `clusters/sgc/cluster` (written by no stack — it came from the one-shot
   `scripts/migrate-cluster-secrets.ts`), the nine `clusters/sgc/apps/*` paths,
   `clusters/_inventory/stargate-command-backup-plan`, the eleven unread `shared/sgc-*` and
   `shared/stargate-command-*` keys, and `shared/authentik-{secret-key,admin,token}` once
   SGC's authentik stops. **Keep `shared/stargate-command-cloudflare-tunnel`** until
   `dynacat-sgc-glance` is retired — it is read by a running pod on equestria.
   Then `bao policy delete eso-sgc` and drop `sgc` from both loops in the vault repo's
   `equestria-init.sh` (lines ~214 and ~322).
10. **Delete the `kubernetes-sgc` mount** — only after SGC's Flux tree is suspended. 41
    ExternalSecrets authenticate through it; deleting it first breaks all of them at once.
11. **Retire the backup estate together**: `/spike/backup/sgc/`, the three backrest copy jobs,
    and the nine `sgc-volsync-*` Gatus heartbeats. They stay green after teardown because
    they are fed by local copy jobs, then all page simultaneously when the data is removed.
    `cnpg-sgc-backups` is `protect: true` — Pulumi cannot delete it; retiring the recovery
    window is a separate, manual, deliberate act.
12. **Re-run backup verification end to end**, then **archive both cluster repos read-only**
    — last, and only after the six dead `CLOUDFLARE_*`/`BACKBLAZE_*` sops keys and the eight
    debris ExternalSecrets in `stargate-command-cluster` are fixed, since archival freezes
    them.
13. Update the runbooks/CLAUDE/AGENTS/crew docs in §9 — and repoint
    `home-operations.code-workspace`'s `sops.defaults.ageKeyFile`, which points at
    `../stargate-command-cluster/age.key`. Archival does not break that; deleting the local
    clone does. Its `folders` entry at `:12-13` has the same dependency and is
    not in §9. Also reword `age-recipients.txt:2`'s three-repo invariant, and regenerate the four
    additional `docs/codebase` files listed above.
14. **Remove `Update.cs`'s `decommissionedServers` entry — last, and only once SGC's machines have
    left the tailnet** (rule 5). Doing it earlier regenerates the probes that #874 retired.

## Exit gate

The old gate was a single repo-wide grep returning "zero live-configuration hits." That is
not achievable and never was — it exempted a file that no longer exists and ignored a
108-file class. Replace it with these, each checkable:

- **No live SGC config in the repo.** `grep -rniI -E 'sgc|stargate|10\.10\.209\.|odyssey'`
  excluding `node_modules`, `.git`, `package-lock.json` and `docs/cluster-consolidation/`
  returns only: the `$schema=` comment URLs (108 files — editor-time validation against a
  public archived repo, which keeps serving raw content); the incident citations deliberately
  kept (`.crew/casting/history.json`, `.crew/agents/seraph/charter.md`,
  `scripts/crew-sync-baseline-2026-07-28.json`, `.github/renovate.json5`,
  `kubernetes/components/volsync/AGENTS.md`, `kubernetes/apps/tailscale-system/iam/tsiam.yaml`,
  `kubernetes/apps/equestria/home/dynacat/ks.yaml`, `stacks/authentik/README.md`); and the
  `stargate-command` **namespace** tree, which stays.
- **OpenBao is clean.** No `kubernetes-sgc` mount, no `eso-sgc` policy or role, and
  `bao kv list secrets/clusters/sgc/` returns nothing. `equestria-init.sh status` agrees.
- **No SGC-owned DNS anywhere.** No records under `sgc.driscoll.tech`, no `10.10.209.*` A or
  PTR records, and no `sgc.*` TXT ownership litter, in **all three** providers — Cloudflare,
  Technitium (check every one of the five instances, not one resolver's answer) and UniFi.
- **Nothing pages and nothing is permanently red.** No Prometheus rule or blackbox probe
  references SGC; Gatus has no permanently-failing SGC endpoint; the estate-wide `Authentik`
  check still exists somewhere.
- **Backup verification runs clean end to end**, and the CNPG recovery window has been
  retired deliberately rather than left orphaned.
- **Both cluster repos archived read-only**, after their own leftovers are fixed.

## Risks and rollback

Re-derived 2026-08-16. The old table rated the `sgc` destroy as "None — this is intentional
teardown, gated by preview." Both halves of that were wrong: it had three cross-stack fuses,
and `pulumi preview` is not the gate.

| Step | What breaks | How you'd know | Rollback | Point of no return |
|---|---|---|---|---|
| Deleting a DNSEndpoint, or suspending SGC's Flux, while external-dns runs | external-dns `policy=sync` **deletes live estate records** it owns — `truenas.driscoll.tech`, `odyssey.driscoll.tech` — from Cloudflare | Something estate-wide stops resolving; this is the same class as the two prior live-DNS wipes | Re-add from Cloudflare history, or the next `stacks/home` run for Pulumi-owned names | None if rule 1 is followed. **This is the highest-consequence ordering error in the piece** |
| §3 `pulumi destroy` on the `sgc` stack, before #875 is reconciled | `stacks/home`, `stacks/ocracoke`, `stacks/gulf-of-mexico` all throw on `backupPlanKeys()`; the SSO `authentik` stack throws on `getCluster` | Four stacks fail at once, one of them the stack whose preview output is already untrustworthy | Restore the KV path, or revert the constant | None — but verify #875 is *reconciled*, not merely merged |
| §3 destroy, after SGC is unreachable | `pulumi preview` cannot run (the program enumerates the live cluster); the destroy cannot delete in-cluster `Secret`s | Preview errors on the provider | Bring the kubeproxy path back, or accept orphaned in-cluster objects that die with the node wipe | Soft — but the clean path closes when SGC does |
| Deleting the `sgc` Brand | `iris.driscoll.tech` falls back to authentik's default brand. It is **not** unused — alpha-site serves that name now, and only `sgc`/`equestria` get Brands, so alpha-site has none of its own | Visibly different login page on one hostname | Recreate the Brand, or give alpha-site its own | None — cosmetic, but do not be surprised by it |
| §5 OpenBao mount/policy deletion before SGC's Flux tree is suspended | All 41 of SGC's ExternalSecrets fail login simultaneously | ESO logs, `ClusterSecretStore` unhealthy | Recreate from `equestria-init.sh` | None if ordered |
| §2/§6 DNS record deletion | Deleting a record an adjacent equestria record shadows | Something can't resolve | Re-add from provider history | None if scoped. **Delete Cloudflare records by record id, never by name** — a name can carry several records, and this estate has wiped live DNS twice from adjacent carelessness |
| Retiring `/spike/backup/sgc/` | 9 `sgc-volsync-*` Gatus heartbeats page **together** — they stay green after teardown because local copy jobs feed them | Nine simultaneous pushover alerts | Recreate the paths | None — but retire data, jobs and heartbeats in one change |
| Deleting `cnpg-sgc-backups` | Discards SGC's entire CNPG recovery window (13-day unbroken chain at audit time) | — | **None** | `protect: true` blocks Pulumi; only a deliberate manual Minio delete does it. Treat that as the real point of no return for SGC's database |
| §9 archiving too early | The six dead `CLOUDFLARE_*`/`BACKBLAZE_*` sops keys and eight debris ExternalSecrets become unfixable | Discovered later, can't open a PR | Un-archive, land the fix, re-archive | Soft |

## Cross-references

- [README.md](README.md) — decision ledger, full sequencing graph
- [21-repo-consolidation-flux-repoint.md](21-repo-consolidation-flux-repoint.md) — hard prerequisite; this piece starts at its exit gate
- [23-talos-in-pulumi.md](23-talos-in-pulumi.md) — sibling follow-on, also gated on 21, independent of this piece

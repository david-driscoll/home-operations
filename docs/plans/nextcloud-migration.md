# Nextcloud on equestria — replacing OpenCloud

**Status:** built 2026-09-27 (this PR adds `kubernetes/apps/equestria/home/nextcloud` and unlists OpenCloud); not yet merged. Decisions marked ✅ were taken by David
on 2026-09-26; ❓ items in §G still need an answer.

## Why, and what changes

OpenCloud (#1982/#1986/#1994/#2107) went live 2026-09-23 and works, but it gives the family
Files plus a header-trusting Radicale sidecar, and nothing for Notes or Deck. Nextcloud gives
Files, CalDAV/CardDAV, Notes, Deck and Office from one app with mature iOS, Android and
desktop clients. Photos stay on Immich, media on Plex/Jellyfin, location on Dawarich.

| | OpenCloud today | Nextcloud target |
|---|---|---|
| Host | `cloud.driscoll.tech` (+`cloud.<tailnet>.ts.net`) | `cloud.driscoll.tech` only |
| Exposure | internal gateway, LAN + tailnet | same (✅ nothing public) |
| Auth | public OIDC client `web`, built-in IDM | confidential OIDC client, `user_oidc`, local break-glass admin |
| Calendars | Radicale sidecar, `X-Remote-User` trust | Nextcloud DAV, app passwords |
| Office | Collabora in the same HelmRelease | same Collabora, via `richdocuments` (✅) |
| DB | none | shared CNPG `postgres` (PG 18.6) |
| Data | 50Gi Longhorn RWO, volsync | 100Gi Longhorn RWO, volsync (✅) |
| Nightly shed | yes (sync fails 01:00–07:00 ET) | **excluded** |

**Data to migrate: effectively none.** Restic's 2026-09-26 14:06 UTC run of the OpenCloud
PVC processed 212 files / 424.8 KiB, i.e. config and IDM, with no user content. §C and §D are
therefore "prove it's empty, carry over the stragglers", not a bulk copy.

## Target

```
 iPhone / Mac / PC (LAN, or Tailscale off-LAN)
        │  https://cloud.driscoll.tech           https://collabora.driscoll.tech
        ▼                                               ▼
 Gateway `internal` (Traefik) ── local-api + nextcloud-headers ── local-user
        │                                               │
 ┌──────┴── Deployment nextcloud (Recreate, downscaler/exclude) ──┐   Deployment nextcloud-collabora
 │ app:      nextcloud:35.0.1-apache  (:80)                        │   collabora/code (uid 1001, MKNOD)
 │ cron:     same image, php cron.php every 5 min (uid 33)         │◄── WOPI callbacks
 │ exporter: xperimental/nextcloud-exporter (:9205)                │
 └──┬──────────────┬───────────────────────┬──────────────────────┘
    │ PVC nextcloud (longhorn, RWO, volsync→restic nightly)
    │              │ postgres-rw.database:5432 db `nextcloud` (components/postgres, rotating pw)
    │                                      │ valkey.database:6379 db 13 (locking + distributed cache)
    ▼
 authentik (VIP 10.10.255.10, equestria + alpha-site) — web logins only
```

## A. Deployment design

**A1. Packaging: bjw-s app-template, not the official chart, and not AIO.**

- Every equestria app is app-template. Using it lets us reuse `components/volsync` (PVC,
  restic, nightly test restore), `components/postgres`, the umbrella drift patches, Reloader,
  and the route/middleware shapes as they are.
- The official chart (9.3.0, ships 34.0.4) would be the only foreign values shape in the
  namespace, and would still need `existingClaim` against the volsync PVC.
- Nextcloud-specific pieces the chart would have given us are about 60 lines: the cron
  sidecar, the exporter sidecar and the `.well-known` redirects.
- AIO needs the Docker socket and runs its own orchestration. That's a non-starter here.

**A2. Image: `nextcloud:35.0.1-apache@sha256:…`.**

- Apache+mod_php: one container, and `.htaccess` handles pretty URLs.
- fpm+nginx means maintaining Nextcloud's ~150-line nginx config for no gain at family scale.
- Pin by digest; Renovate rules in §F.

**A3. Database: Postgres on the shared CNPG `Cluster/postgres`.**

- There is no MariaDB operator, and PG 18 is supported by Nextcloud 35.
- Add `components/postgres` to `ks.yaml` to get `DatabaseRole`/`Database nextcloud` and Secret
  `nextcloud-postgres`, read through the `database` ClusterSecretStore with the `postgres_`
  rewrite (as outline and freshrss do).
- Expect the documented first-deploy race: the `system` stack stalls, then recovers via the
  ORDER OF OPERATIONS block in `kubernetes/components/postgres/ks.yaml`.
- **Rotation trap (FreshRSS, 2026-08-27):** the installer writes `dbpassword` into
  `config.php` and never reads the env again. The OpenBao static role rotates it every 30 days.
- Fix: a ConfigMap-mounted `zz-db.config.php` returns
  `['dbhost'=>getenv('POSTGRES_HOST'),'dbuser'=>…,'dbpassword'=>getenv('POSTGRES_PASSWORD')]`.
  Nextcloud merges `config/*.config.php` after `config.php`, so it wins on every request.
  Reloader restarts the pod when `nextcloud-postgres` changes. No init-copy dance is needed.
- Verify it in §verification with a forced rotation.

**A4. Redis: shared Valkey, `dbindex 13`.**

- Set by `zz-redis.config.php`: `memcache.locking` and `memcache.distributed` = Redis,
  `memcache.local` = APCu.
- Leave `REDIS_HOST` unset so the image's own `redis.config.php` stays inert (it can't set
  `dbindex`).
- Add `dependsOn: valkey/database`.
- A Valkey restart briefly fails file locking. That's acceptable and already true of 6 apps.

**A5. Cron: sidecar, not a CronJob.**

- The PVC is RWO. A CronJob pod lands on another node and can't mount it (the kometa caveat).
- The sidecar is the same image running as uid 33:
  `while true; do php -f /var/www/html/cron.php && date +%s > /tmp/hb; sleep 300; done`
- A liveness probe fails if `/tmp/hb` is older than 15 min.
- Set `occ background:cron` once in the hook (A9).

**A6. Previews and PHP tuning (≤10 users).**

- Previews are on-demand only, with no previewgenerator and no Imaginary (Immich owns photos).
- `preview_max_x/y: 2048`, `preview_max_filesize_image: 50`.
- Env: `PHP_MEMORY_LIMIT=1024M`, `PHP_UPLOAD_LIMIT=16G`, `APACHE_BODY_LIMIT=0`.
- A `zz-opcache.ini` in `/usr/local/etc/php/conf.d/`: `opcache.memory_consumption=256`,
  `interned_strings_buffer=64`, `max_accelerated_files=20000`, `revalidate_freq=60`,
  `apc.shm_size=128M`.
- Resources: app requests 250m / 768Mi with a 2Gi limit. Collabora copies OpenCloud's
  current values.
- `default_phone_region: US`. `maintenance_window_start: 6` (UTC, i.e. 02:00 ET).
  `log_type: errorlog`, so logs go to stderr and then Loki.

**A7. Storage (✅ Longhorn + volsync).**

- One PVC `nextcloud` from `components/volsync`: `VOLSYNC_CAPACITY: 100Gi`,
  `VOLSYNC_ACCESSMODES: ReadWriteOnce`, `VOLSYNC_CACHE_CAPACITY: 10Gi`,
  `VOLSYNC_PUID/PGID: 33`.
- Mounted at `/var/www/html`. It holds `config/`, `custom_apps/`, `themes/` and `data/`
  together, so a volsync snapshot is one self-consistent point in time.
- DB storage is CNPG's `longhorn-local`, already handled.
- Capacity can only ever be **raised**. Changing the storageClass or lowering the capacity
  deletes the PVC (`kustomize.toolkit.fluxcd.io/force`).
- POSIX, not S3: Garage has ~60Gi usable, and S3-primary makes files opaque and restores
  two-phase.
- Nothing is reusable from OpenCloud's `decomposed` store. It's content-addressed blobs, and
  it's empty anyway.
- **Config overlays are copied, not mounted** (changed while building). The image's
  entrypoint seeds `config/` from `/usr/src/nextcloud/config` only when that directory is
  **empty**. A subPath file mounted there on first boot makes it non-empty and skips the seed,
  so `apps.config.php` never lands, and apps get installed into the code tree that the next
  upgrade's `rsync --delete` wipes.
  - The `zz-*.config.php` files are mounted at `/opt/nextcloud`.
  - The `before-starting` hook (A9) copies them into `config/` on every start.
  - That also makes the app-template mount-order trap moot; the render was checked with
    `helm template`.
- Pod `fsGroup: 33`. The app container starts as root, which the image's entrypoint and Apache
  need, then drops to www-data.

**A8. Routing (Gateway API HTTPRoute via app-template `route:`).**

- `route.app` on `internal`, hostname `cloud.${ROOT_DOMAIN}`, rules in this order:
  1. `Exact /.well-known/caldav` and `Exact /.well-known/carddav` →
     `RequestRedirect {scheme: https, path: ReplaceFullPath /remote.php/dav/, statusCode: 301}`.
     This is done at the Gateway because Apache's `.htaccess` redirect is built from the
     *http* scheme it sees behind TLS termination.
  2. `/` → `nextcloud:80`, filters `local-api` then `nextcloud-headers`.
- **`local-api`, not `local-user`, for the whole host.** error-pages rewrites every 401–599,
  which would break:
  - the DAV Basic-auth challenge (the iOS "Add CalDAV Account" failure fixed for OpenCloud in
    8e2bf833 on `feat/family-setup-guide`);
  - the sync client's 412/423/409 handling;
  - the web UI's JSON errors.

  Nextcloud renders its own error pages.
- New `nextcloud-headers` Middleware (pattern: `navidrome/middleware.yaml`):
  `stsSeconds: 15552000`, `stsIncludeSubdomains: true`. Nextcloud sets the other security
  headers itself.
- Upload limits: none. Traefik entrypoints have `readTimeout: 0s` and there is no buffering
  middleware. Clients chunk uploads (10 MiB pieces).
- Nextcloud config:
  - `overwriteprotocol: https`
  - `overwrite.cli.url: https://cloud.driscoll.tech`
  - `trusted_domains: [cloud.driscoll.tech]`
  - `trusted_proxies: [10.206.0.0/16]` (`talos/talconfig.yaml` clusterPodNets)
  - `forwarded_for_headers: [HTTP_X_FORWARDED_FOR]`

  Brute-force protection depends on the last two.
- **No `components/tailscale` / `TAILSCALE_HOST`.** `tailscale-local` also chains
  error-pages. Tailnet devices already reach `cloud.driscoll.tech` through the internal
  gateway, since `internal-network` admits 100.64.0.0/10. One hostname means one redirect URI
  and one Collabora alias.
- `route.collabora`: `collabora.${ROOT_DOMAIN}` → `nextcloud-collabora:9980`, `local-user`
  (browser-only iframe, as today).

**A9. Declarative first-run config: image hooks.**

- `/docker-entrypoint-hooks.d/before-starting/10-configure.sh` is a ConfigMap script. The
  entrypoint runs it on every start, as www-data, after install or upgrade. It is idempotent.
  It:
  - copies the config overlays into `config/` (A7) and refreshes `.htaccess`;
  - enables or installs the apps, tolerating an app-store outage (it returned 503 on
    2026-09-26); apps persist in `custom_apps` after the first success;
  - sets `background:cron`;
  - applies the `user_oidc` provider (B1), from env out of `nextcloud-oidc`, only once that
    Secret exists;
  - sets the `richdocuments` `wopi_url` / `public_wopi_url`;
  - sets the serverinfo token.
- Only the config copy may fail the start; network-dependent steps just warn.
- The ConfigMap has Flux substitution disabled (it is shell and PHP). The domain reaches it as
  `NC_HOST` / `COLLABORA_URL` environment variables.
- Apps: `user_oidc calendar contacts notes richdocuments`. Add `deck` once a 35-compatible
  release is in the store.
- Install itself uses the image's env autoconfig: `POSTGRES_*` plus `NEXTCLOUD_ADMIN_USER` /
  `NEXTCLOUD_ADMIN_PASSWORD`.

**A10. Collabora (✅ keep).**

- Move the `collabora` controller out of `opencloud/helmrelease.yaml` (lines ~425–639) nearly
  verbatim:
  - the fonts init (with `APT::Sandbox::User=root`), `MKNOD`, uid 1001;
  - the image's own entrypoint, with **no `command:` override** (the #1994 lesson).
- Changes: the admin creds come from `nextcloud-collabora`. `aliasgroup1`,
  `frame_ancestors` and `extra_params` stay as OpenCloud had them, already pointing at
  `cloud.${ROOT_DOMAIN}`.
- richdocuments: `wopi_url` and `public_wopi_url` are both
  `https://collabora.${ROOT_DOMAIN}`. The server fetches discovery through the gateway, as
  OpenCloud did, which avoids a split internal/public URL. No `wopi_allowlist`: the network
  gate is `local-api`/`local-user`, and WOPI calls carry their own access tokens.
- Collabora may be shed nightly. Only the `nextcloud` controller gets `downscaler/exclude`.

**A11. Secrets.**

**Nothing is seeded by hand** (changed while building). Every credential not owned by another
system comes from an ESO `Password` generator with `refreshPolicy: CreatedOnce`.

| Secret | Source | Keys |
|---|---|---|
| `nextcloud-admin` | generator | `NEXTCLOUD_ADMIN_USER=ncadmin`, `NEXTCLOUD_ADMIN_PASSWORD` |
| `nextcloud-collabora` | generator | `username`, `password` |
| `nextcloud-metrics` | generator | `NC_METRICS_TOKEN` = `NEXTCLOUD_AUTH_TOKEN` |
| `nextcloud-db` | store `database` ← `nextcloud-postgres` (rotating static role) | `POSTGRES_HOST` (host:port), `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| `nextcloud-oidc` | store `cluster` ← Pulumi `nextcloud-oidc-credentials` | `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_DISCOVERY_URL` |

- The break-glass password is read with
  `kubectl -n equestria get secret nextcloud-admin -o jsonpath='{.data.NEXTCLOUD_ADMIN_PASSWORD}' | base64 -d`.
- The installer reads it once. If the Secret is ever regenerated, reset the account with
  `occ user:resetpassword ncadmin`.
- `secret`, `passwordsalt` and `instanceid` are generated by the installer into `config.php`
  on the PVC. They're covered by volsync, and nothing is imported from OpenCloud.
- The stale `secrets/shared/opencloud` entry stays untouched.

## B. Identity

**B1. authentik provider (`definition.yaml`).**

- `authentik.oauth2`, **confidential**: omit `clientType: public`, so Pulumi mints a secret.
- `redirectUris` (strict):
  - `https://cloud.${ROOT_DOMAIN}/apps/user_oidc/code`
  - `https://cloud.${ROOT_DOMAIN}/index.php/apps/user_oidc/code`
- `propertyMappings: [openid, profile, email, groups]`. `groups` is the existing custom scope
  in `components/authentik/property-mappings.ts`, so no `stacks/authentik` change is needed.
- `includeClaimsInIdToken: true`.
- `access_policy.groups: [family, admins]`.
- `gatus`: `GET /status.php`, expecting 200, `[BODY].installed == true` and
  `[BODY].maintenance == false`.

`user_oidc`, as applied by `resources/10-configure.sh`. The flag names were checked against
user_oidc's `UpsertProvider.php`, and `--clientsecret-env` keeps the secret off the command
line:

```bash
occ user_oidc:provider authentik \
  --clientid="$OIDC_CLIENT_ID" --clientsecret-env=OIDC_CLIENT_SECRET \
  --discoveryuri="$OIDC_DISCOVERY_URL" \
  --scope="openid email profile groups" \
  --unique-uid=0 --mapping-uid=preferred_username \
  --mapping-display-name=name --mapping-email=email \
  --mapping-groups=groups --group-provisioning=1 \
  --group-whitelist-regex='/^(family|admins)$/' \
  --group-restrict-login-to-whitelist=1 \
  --send-id-token-hint=1 --check-bearer=0
occ config:app:set user_oidc allow_multiple_user_backends --value=0   # auto-redirect to authentik
# system config: 'user_oidc' => ['soft_auto_provision' => false]
```

- **`--unique-uid=0` + `preferred_username`**: the Nextcloud uid *is* the authentik username,
  matching OpenCloud's claim. Same rule as before: don't rename people in authentik.
- `soft_auto_provision=false` stops an OIDC login from adopting a same-named local account
  (i.e. the break-glass admin).
- **Group mapping:** `family` and `admins` are mirrored on every web login. Groups outside the
  whitelist (hand-made sharing groups) are left alone.
- Nextcloud's privileged group is literally `admin`. Grant it once with
  `occ group:adduser admin <david>` rather than adding a new authentik mapping. If that should
  be authentik-driven instead, see ❓G5.
- **No LDAP backend.** No LDAP outpost exists (the `ProviderLdap` block in
  `components/authentik.ts` is commented out), and adding one puts a second authentik
  dependency on every request path.
- Cost of going claims-only:
  - a user exists in Nextcloud only after their first login, so onboarding includes one login
    per person;
  - group changes apply at the next *web* login, not on app-password clients.

**B2. When authentik is down.**

| Keeps working | Breaks |
|---|---|
| Desktop, iOS and Android file sync: app passwords from Login Flow v2, verified locally | New browser logins |
| CalDAV/CardDAV on phones (app passwords) | Pairing a new device or client (Login Flow v2 opens a web login) |
| Existing browser sessions until they expire; Office in an open session | |
| Break-glass admin at `/login?direct=1` | |

- Topology: authentik runs active-active (equestria + alpha-site Pi behind VIP
  `10.10.255.10`), and Nextcloud lives on equestria. "Nextcloud up, authentik down" therefore
  means an authentik app or DB fault, not a site loss.
- An equestria loss takes both down. Recovery waits on the manual Pi standby promotion in
  `docker/alpha-site/authentik-pg-standby/FAILOVER.md`.
- **Break-glass:** the local admin is named `ncadmin` (not an authentik username), with its
  password in the OpenBao `…/nextcloud/config` doc. No 2FA; it's LAN/tailnet-only.
- **Deprovisioning caveat:** disabling someone in authentik does **not** revoke their app
  passwords. Offboarding is authentik disable **plus** `occ user:disable <uid>`.

## C. Files from OpenCloud

1. **Prove it's empty** (before the PR):
   - `kubectl -n equestria exec deploy/opencloud -c opencloud -- du -sh /var/lib/opencloud/storage`
   - list the space directories;
   - ask each family member.

   The 425 KiB restic figure says there is nothing to move.
2. **If anything exists:** the `decomposed` driver stores blobs, so export through OpenCloud,
   not the disk.
   - A handful of files: the user downloads a zip from the OpenCloud web UI and drops it into
     Nextcloud after first login. Owner = uploader; mtime is lost.
   - More than a handful: `rclone copy oc:/ nc:/`
     - both remotes are WebDAV;
     - `nc` uses `vendor=nextcloud`, logged in as *that user* with an app password, so the
       owner is correct and `X-OC-Mtime` keeps mtimes;
     - `oc` needs an OpenCloud app token (`auth-app` service), which isn't enabled today.
3. **Shares and public links:** none are expected. Anything found is re-created by hand; no
   tool maps OpenCloud shares to Nextcloud.
4. **Verify:** per-user file counts and total bytes via `rclone size` on both sides, plus
   `rclone check --size-only`. OpenCloud and Nextcloud don't expose a common hash.

## D. Calendars and contacts from Radicale

1. **Export** before the PR:
   `kubectl -n equestria exec deploy/opencloud -c radicale -- tar c -C /var/lib/radicale collections > radicale.tar`.
   Collections live at `collection-root/<user>/<collection>/`, one `.ics`/`.vcf` per item.
   `def-calendar` and `def-addressbook` exist for every user who logged in, and are probably
   empty.
2. **Import:**
   - Calendars: wrap the items into one VCALENDAR per collection, then
     `occ calendar:import <uid> personal <file>.ics` (list URIs with
     `occ dav:list-calendars <uid>`).
   - Contacts: concatenate the `.vcf` files and import through the Contacts app while logged
     in as that user.
3. **Clients:**
   - First, **delete the old OpenCloud CalDAV/CardDAV accounts** on each device. They point at
     the same hostname and will start failing auth.
   - **iPhone** (flow verified against the nextcloud/ios and server stable35 source,
     2026-09-26; see the note below):
     1. On the web (`cloud.driscoll.tech`, authentik login): avatar › Settings › Security ›
        Devices & sessions › enter an app name › "Create new app password". Keep it on screen
        or copy it. OIDC users get no password-confirm prompt, because user_oidc's
        `canConfirmPassword()` is false.
     2. Install the Nextcloud app. Server `cloud.driscoll.tech`, then the authentik login.
        Files are done.
     3. In the app: More › Settings (gear) › "Calendar and Contacts" › "Download the
        configuration profile". This **requires Safari as the default browser**.
     4. iOS Settings › Profile Downloaded › Install. When asked for the password, paste the
        app password from step 1. Calendar and Contacts are done.

     That's one web login, one app login and one profile per person.
     `AppleProvisioningPlugin` puts only the username in the profile, and the app serves the
     `.mobileconfig` from `localhost:8080/install` **without** touching the clipboard. The
     app password has to be created by hand, and that is the one fiddly step for the family.
   - **Android:** DAVx⁵ › Provider-specific login › "Nextcloud" › Continue › "Nextcloud
     server address" = `cloud.driscoll.tech` (the **base** address; DAVx⁵ appends
     `index.php/login/v2` and resolves `remote.php/dav` itself) › Login. It opens authentik
     and mints its own app password. Files come from the Nextcloud Android app.
   - **Mac/PC:** the Nextcloud desktop client (Login Flow v2).
   - **MDM:** none exists in the repo. The per-user Nextcloud profile makes one unnecessary for
     now. An MDM would still need a per-user app password in the payload, so it's out of
     scope.
   - Off-LAN phones need Tailscale on, **and** the tailnet grant to the authentik VIP
     (`9ecaab10` via #2120, ✅G2).
4. **Webcal subscriptions** to third-party feeds work from the Calendar app (the pod needs
   internet egress, as it has today).
   - Public read-only links work **only for LAN/tailnet subscribers** (✅ nothing public).
     Google/Outlook cannot fetch them.
   - Known limitation: subscribed ICS feeds are ignored by appointment conflict detection
     (reported as nextcloud/server#60312; also nextcloud/calendar#8446, open). Don't rely on
     Appointments to avoid clashes with subscribed feeds.

## E. Cutover and rollback

No parallel run on one hostname is possible: `cloud.driscoll.tech` moves. The empty OpenCloud
makes that cheap. The "read-only OpenCloud" period becomes "OpenCloud directory and restic repo
kept for 4 weeks".

**One PR, not two** (changed while building). The two-PR split existed to free the `cloud`
tailnet name, and Nextcloud no longer takes a tailnet name at all. The only overlap is the
`cloud.` / `collabora.` HTTPRoutes during the minute before Flux prunes OpenCloud. Gateway API
gives a contested hostname to the older route, so OpenCloud keeps serving until it's gone.

**Step 0 was not run.** It needs `kubectl exec`, which the agentboard pod lacks. The restic
figure (212 files / 425 KiB for the whole volume) says there is nothing to export. The
OpenCloud restic repo stays on NFS, so any straggler can still be restored from it later.

| # | PR / step | What | Gate to proceed |
|---|---|---|---|
| 1 | PR | Unlist `./opencloud/ks.yaml` (directory stays) **and** add `home/nextcloud/` | Flux Ready (after the postgres race recovery); OpenCloud pods, routes and PVC pruned; `/repository/opencloud` still on NFS |
| 2 | — | `stacks/applications` (operator, on merge) removes OpenCloud's authentik app and writes `nextcloud-oidc-credentials`; **delete the Nextcloud pod** if SSO hasn't appeared (Reloader ignores Secret *creation*, per the aurral lesson) | SSO login works |
| 3 | — | Verification (below) + the restore drill (F1) while it's still disposable | all green |
| 4 | — | David-only soak, 1 week | no cron or lock alerts |
| 5 | — | Family onboarding (D3), per person, using the rewritten setup guide | #2120 merged (authentik VIP grant); each: Files + Calendar + Contacts on the phone, tested once off-LAN on Tailscale |
| 6 | follow-up PR (+4 wks) | Delete `home/opencloud/`, the OpenBao `…/apps/opencloud/config`, and `/repository/opencloud` | — |

**Rollback:**

- **Before step 5:**
  1. Revert the PR, or just swap the two lines in `home/kustomization.yaml`.
  2. OpenCloud's PVC re-seeds from restic via `opencloud-dst` (`restore-once`).
  3. `pulumi up` `stacks/applications` recreates the authentik app. `clientId: web` is pinned
     and public, so there's no secret churn.
  4. Nextcloud's restic repo and DB (`Database` has a retain reclaim policy) survive for a
     retry.
- **After step 5:** first export each user's calendars and contacts from Nextcloud (Calendar
  → export `.ics`, Contacts → `.vcf`) and any new files. Rollback then costs a re-import into
  Radicale, so the bar is higher.

## F. Operations

**F1. Backups.**

- Files, config and apps: volsync restic nightly at 14:00 UTC with the automatic nightly test
  restore. Also picked up by `stacks/applications/kubernetes-backups.ts` (backrest).
- DB:
  - the nightly `pg_dump` CronJob (02:00, all `Database` CRs → NFS `pgdump`);
  - CNPG barman base backups.
- The DB and files are not captured at the same instant. After any restore:
  `occ maintenance:mode --on` → restore the DB dump → restore the PVC →
  `occ files:scan --all` → `occ maintenance:data-fingerprint` (clients re-sync safely rather
  than delete) → maintenance off.
- **Restore drill (at step 3, then yearly):**
  1. Scale to 0.
  2. Delete the PVC and let volsync re-seed it.
  3. Drop the `nextcloud` DB and restore last night's dump.
  4. Start and run the sequence above; check `occ status` and file counts.

**F2. Monitoring.**

- `xperimental/nextcloud-exporter` sidecar (token auth via serverinfo), PodMonitor on
  `metrics`, and a `GrafanaDashboard` CR (grafana.com dashboard for nextcloud-exporter;
  confirm the ID).
- `PrometheusRule nextcloud-rules` (pattern `coder/forgejo/prometheusrule.yaml`):
  - `absent(up{job=~".*nextcloud.*"})` or `nextcloud_up == 0` for 10m;
  - cron container restarts (its heartbeat liveness probe) > 0 in 1h → "cron not running";
  - `nextcloud_apps_updates_available > 0` for 7d (info).
- Already covered by existing rules: PVC fill (`longhorn/rules/pvc-usage-rules.yaml`), 5xx
  (`ServiceSustained5xx`), Gatus uptime from `definition.yaml`.
- Failed background jobs: Nextcloud has no metric. Use a Loki alert on
  `{app="nextcloud"} |= "cron" |= "\"level\":3"` **if** the Loki ruler is enabled
  (check at build). Otherwise use a Grafana log panel plus the weekly admin overview.

**F3. Upgrades.**

- Renovate (`.github/renovate.json5`): a `nextcloud` packageRule with no automerge for any
  update type, and `separateMultipleMajor: true`, so 35→36 and 36→37 arrive as separate PRs.
  Patches get merged monthly.
- **Majors strictly one at a time.** The image refuses to skip a major and runs `occ upgrade`
  on start (strategy `Recreate`).
- Before a major:
  1. Wait for x.0.2+.
  2. Check app `max-version` for everything installed (Deck lagged 35).
  3. Confirm last night's volsync and pg_dump succeeded.
  4. Merge outside the backup window.

## G. Risks and open questions

1. ❓ **Deck on 35.** Its 35 branch is `1.19.0-dev` today. Ship without Deck and add it when
   released (the hook tolerates it), or start on 34.0.4 and step to 35 later? *Proposed: ship
   without it.*
2. ✅ **Tailnet reachability for family: merge `9ecaab10` first** (decided 2026-09-26).
   `member-home-subnet-access` already grants the cluster gateways. `9ecaab10` adds the
   authentik VIP; without it, family members off-LAN reach Nextcloud but fail at the authentik
   hop. It ships in #2120 (`feat/family-setup-guide`, CI green) and is a prerequisite for
   step 5, not for the Nextcloud PR. That PR's OpenCloud DAV-route commit (`8e2bf833`) is harmless
   but moot once OpenCloud is unlisted.
3. ✅ **Family setup guide** (`setup.driscoll.tech`, Forgejo `docs/setup`) documents
   OpenCloud. The rewrite for D3 is handed to the session that owns the guide (2026-09-26),
   to land once Nextcloud is live.
4. ❓ **Quotas.** A default quota per user, or none (100Gi PVC, raise as needed)?
5. ❓ **Admin via authentik.** Is a one-time `occ group:adduser admin` acceptable, or add a
   `nextcloud` scope mapping in `stacks/authentik` that emits `admin` for `admins`?
6. Risk: shared, passwordless Valkey. Any pod can read Nextcloud's lock and cache keys. This
   matches the existing pattern; no user data is cached there.
7. Risk: app-password persistence after authentik disable (B2): an offboarding checklist
   item.
8. Risk: public links and public calendars only work on LAN/tailnet (✅ chosen). Revisit via
   a path-limited external route for `/remote.php/dav/public-calendars/` if needed.
9. Optional: re-add `crowdsecurity/nextcloud` in `network/crowdsec/values.yaml`. It's low
   value while nothing is public.

## Verification (definition of done for step 3)

- `hk check` passes, and `helm template` of the app-template values renders cleanly. Both
  were done before merge.
- After first boot, `config/` holds the image's seeded files (`apps.config.php` among them)
  **and** the four `zz-*` overlays:
  `kubectl -n equestria exec deploy/nextcloud -c nextcloud -- ls /var/www/html/config`.
- `curl -sI https://cloud.driscoll.tech/.well-known/caldav` and `…/.well-known/carddav` each
  return 301 with `Location: https://cloud.driscoll.tech/remote.php/dav/`, never an `http://`
  Location. The iOS "Download the configuration profile" setup fails otherwise
  (nextcloud/ios#3333). This is also a pre-merge item on the setup-guide PR (Forgejo
  docs/setup#1).
- `curl -s …/status.php` shows `installed:true`.
- An unauthenticated PROPFIND on `/remote.php/dav/` returns **401 with a `WWW-Authenticate`
  header** (not error-pages HTML).
- Admin → Overview shows no setup warnings for HSTS, trusted proxies, memcache, cron or
  `.well-known`.
- Login redirects to authentik and lands as `<preferred_username>` in `family`/`admins`.
  `/login?direct=1` works for `ncadmin`.
- iPhone test device: a web app password, the app login and the profile (Safari as default
  browser) give Files, Calendar and Contacts. Android: DAVx⁵ with the base address. Create an
  event on the phone and see it on the web.
- Desktop client syncs a 2 GiB file (chunking, no timeouts).
- Office: open a `.docx`, edit it, and see it saved.
- Forced DB rotation: `bao write -f database/rotate-role/nextcloud` (or the equivalent
  static-role rotate), then the pod restarts via Reloader and the site still works.
- Exporter metrics are in Prometheus. Kill the cron loop and the alert fires.
- The restore drill (F1) passes.
- At 01:00–07:00 ET the `nextcloud` pod stays up.

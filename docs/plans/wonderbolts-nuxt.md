# The region picker as a Nuxt app

**Status:** designed 2026-11-07 (grilled the same day), nothing built. Owner: David. Decision
record: [ADR 0006](../adr/0006-region-picker-own-app.md), amending ADR 0005. Replaces the
pages in [region-exits.md §D4](region-exits.md#d4-region-picker). Terms: GLOSSARY.md (Region
exit, Region, Region picker).

**Deadline:** cut over **before 2026-11-30**, as soon as phase 3's checks pass, so family only
ever learn the new picker. Tailscale's Mullvad add-on ends then and family are moving to region
exits now.

## Goal

The region picker at `wonderbolts.<root domain>` becomes its own app: Nuxt 4 with a Nitro server
([nuxt.com/docs/4.x/getting-started/server](https://nuxt.com/docs/4.x/getting-started/server)),
one Deployment in `netbird-system`, owning the route. It replaces the overview (`/`) and the
per-exit pages (`/<name>`) that every region exit's `picker` sidecar serves today. The URLs
stay the same, so bookmarks, the runbook and the Gatus check keep working.

"Region picker" is the app family use. `wonderbolts` is only its hostname and its Kubernetes
name, never a term in prose. The per-pod sidecar is called "the agent" in this plan and in
code comments; it gets no glossary entry, because it's implementation, not domain.

## What exists today

`kubernetes/apps/netbird-system/region-exits/`: a `picker` container in each of the five
region-exit pods, plain `node:http`, shipped as the `region-exit-picker` ConfigMap and run by
stripping types. It does two different jobs:

| Job | Files | Must stay in the pod? |
| --- | --- | --- |
| Reads pod-local state: gluetun's control API on `127.0.0.1:8000`, `/gluetun/servers.json` on the shared emptyDir, `/proc/net/nf_conntrack`, tailscaled's LocalAPI socket, `wt0` flags in sysfs; writes `region-exit-<name>-state` with the pod's ServiceAccount | `picker.ts` (`status`, `saveRegion`, `applyRegion`), `activeClients.ts`, `overlays.ts`, `metrics.ts` | **Yes.** All of it is loopback, a shared emptyDir or the pod's network namespace. |
| Renders HTML: the overview (fan-out to every exit's `/status` through service-link env vars), the page, the confirm page | `overview.ts`, `html.ts`, `renderPage`, `renderConfirm` | No |

So this is a split, not a move. The agent keeps the first job and stops serving HTML; Nuxt
takes the second.

## Target shape

```
browser
  -> Traefik, internal Gateway, `authenticated-user` (Authentik forward auth: admins, family, friends)
  -> wonderbolts (Nuxt; Deployment in netbird-system)
       app/      pages and components, SSR + Nuxt UI
       server/   Nitro: /api/region-exits/**, /healthz; the may-move check (X-authentik-groups)
         -> http://region-exits-<name>.netbird-system.svc:8080   (the agent, JSON only)
              -> gluetun 127.0.0.1:8000, servers.json, conntrack, tailscaled, wt0, the state ConfigMap
```

The Nuxt pod uses normal cluster DNS, so the `enableServiceLinks` workaround (the exits resolve
through Technitium) goes once the overview leaves the agent.

## A. Decisions (all 2026-11-07)

1. **Source in `apps/wonderbolts/`, its own `package.json` and lockfile, not a root
   workspace.** Root `package-lock.json` is an input to the pulumi-workspace image
   (`images/pulumi-workspace/inputs.sh`, its workflow's `paths`). Nuxt in the root workspace
   would rebuild that image on every Nuxt or Vue bump and add a few hundred packages to every
   Pulumi workspace. Root `tsconfig.json` only includes `components/`, so the app's
   `.nuxt/tsconfig.json` does not collide.
2. **The agent decides whether a move needs confirming.** Only it can count people, so it
   keeps the "anyone on it means confirm first" check and its 409 `{ confirm: true }` reply.
   The app shows the confirm modal when the agent says so and never decides a move is safe.
3. **The app decides who may move.** Forward auth on the route lets in `admins`, `family` and
   `friends` (`definition.yaml` `access_policy.groups`). Friends see everything family see:
   the overview, each exit's page, people on it, region, availability, egress and "last moved
   by". They just can't move. The Nitro route for a move reads `X-authentik-groups` (a
   pipe-separated list of group names; the groups are `components/constants.ts` `Roles`) and
   answers 403 unless it contains `family` or `admins`. Pages hide the controls for friends
   and show one line in their place: "Only family can move region exits. Ask David or family
   to move this one." The header can be trusted because Traefik's forwardAuth replaces every
   `authResponseHeaders` entry on the forwarded request (and removes a client-sent copy the
   outpost didn't set), and because of the CNPs: only Traefik reaches the app, and only the
   app may POST a move to an agent.
4. **Name allow-list.** The server only builds an agent URL for a name in
   `NUXT_REGION_EXITS`. A route param is never interpolated into a host.
5. **JavaScript required.** Pages render on the server, so status reads before hydration, but
   moving needs the hydrated page: a JSON `$fetch`, with the confirm step as a modal. The API
   takes JSON only.
6. **UI kit: Nuxt UI.** Badges, select menus, the confirm modal, dark mode.
7. **Image: the forge registry, no Docker daemon.** The job container is `node:24-alpine`
   (the pin the agent already uses): `npm ci && npm test && npm run build`, then
   `crane append` the `.output/` tree as one layer at `/app` and `crane mutate` the entrypoint
   to `node /app/server/index.mjs`. Pushed as `git.<root domain>/estate-images/wonderbolts`,
   pinned by tag and digest. The forge is `REQUIRE_SIGNIN_VIEW`, so `netbird-system` needs a
   pull-secret ExternalSecret like `kubernetes/apps/pulumi/workspace-image/externalsecret.yaml`.
   GHCR was turned down: GitHub is the mirror.
8. **Renovate bumps the pin.** The self-hosted Forgejo Renovate bot opens digest-bump PRs for
   `estate-images/wonderbolts`. It needs read access to the forge registry (a `hostRules`
   entry and the `estate-images` read token); check that while building phase 2. Until it
   works, the image workflow prints the line to paste, as pulumi-workspace's does. Renovate
   also has to see `apps/wonderbolts/package.json` and its lockfile.
9. **PRs are checked on GitHub.** `.github/workflows/wonderbolts.yaml`, on `pull_request`,
   path-filtered to `apps/wonderbolts/**`: `npm ci`, `nuxi typecheck`, `vitest`,
   `nuxt build`. It never pushes. The forge workflow publishes from `main` only.
10. **v1 is parity plus three things:**
    - the overview refreshes itself every 30 s while the tab is visible;
    - after a move, the exit's page shows "reconnecting" and polls until the tunnel is up and
      the egress country matches the region (`metrics.ts` `egressMatchesRegion`, moved into
      `shared/`), with a warning if that hasn't happened after 60 s;
    - **last moved by**: who moved each exit and when, shown to everyone who can open the
      picker. It shows the person's display name, falling back to their username, and the
      time relative ("2 hours ago") with the Eastern time on hover. When nobody is recorded
      (the exit is on its Git default, its state ConfigMap was deleted, or it was moved before
      this existed) it reads "Moved by unknown". Every move is also logged with the username
      and display name (stdout, so Loki).
11. **Display names need one shared-middleware change.** `X-authentik-name` is added to
    `authResponseHeaders` in `kubernetes/apps/network/traefik/middleware/outpost.yaml`, as the
    Dockge outpost already does (`docker/_common/traefik/compose.yaml`). Every forward-auth app
    then gets one more header, which is harmless.
12. **Same-day cleanup.** The old pages are deleted as soon as the cutover checks pass. Going
    back after that means reverting the cleanup and cutover commits, in that order. See phase
    6 for the friends ordering rule.
13. **`definition.yaml` moves to `wonderbolts/`**, in two commits so the Authentik application
    is never pruned and recreated (phase 7).

## B. The agent's API (sidecar, after this)

Root paths, since nothing routes `/<name>` to it any more. JSON only.

| Method | Path | From | Notes |
| --- | --- | --- | --- |
| GET | `/status` | wonderbolts | today's `Status`, plus `lastMove: { by: string \| null, at: string } \| null` |
| GET | `/regions` | wonderbolts | was `/<name>/regions` |
| POST | `/region` | wonderbolts | `{country, city?, confirm?, movedBy}`; 400 bad region, 409 needs confirm, 502 save/apply failed |
| GET | `/metrics` | Prometheus | unchanged |
| GET | `/healthz` | kubelet | unchanged |

**Last move storage.** On a move, `saveRegion` also sets two annotations on
`region-exit-<name>-state`: `driscoll.dev/region-exit-moved-by` (the display name the app sent)
and `driscoll.dev/region-exit-moved-at` (ISO-8601). Use the same merge patch and the same RBAC
(get, create, patch on that one name), so nothing widens. `/status` reads them back with a GET
on that ConfigMap; if the ConfigMap or `moved-at` is missing, or it can't be read, `lastMove`
is `null`. A move whose mover is unknown removes `moved-by` and still sets `moved-at`, so
`by` is `null` and nobody else's name is left on it. The app shows "Moved by unknown" for
both. The agent takes `movedBy` from the app's body on trust: only the app can POST
`/region` (the CNP). Until cleanup, the sidecar's own page still moves through
`/<name>/region`, and those moves record forward auth's `X-authentik-name`, or else
`X-authentik-username`, so a move made on the old page never leaves an earlier mover's name
in place. Traefik may only POST `/<name>/region`, never the root `/region`, because the
route's `/` reaches whichever sidecar `region-exits-pickers` lands on.

## C. The Nuxt app

```
apps/wonderbolts/
  nuxt.config.ts            ssr: true; nitro.preset "node-server"; @nuxt/ui; runtimeConfig below
  package.json, package-lock.json, vitest.config.ts
  app/
    app.vue
    pages/index.vue         overview: badge, region, people, last moved by, auto-refresh
    pages/[name].vue        status, last moved by, quick countries, country/city, move; friend note
    components/AvailabilityBadge.vue, RegionForm.vue, MoveConfirm.vue, LastMoved.vue
    composables/useViewer.ts   { name, canMove } from the server, for hiding controls
  server/
    api/viewer.get.ts                        who is looking and whether they may move
    api/region-exits/index.get.ts            overview: every exit's /status at once, 3 s each
    api/region-exits/[name]/index.get.ts     one exit's /status
    api/region-exits/[name]/regions.get.ts   its Mullvad countries and cities
    api/region-exits/[name]/region.post.ts   the move: 403 unless family/admins, then the agent
    routes/healthz.get.ts
    utils/agent.ts          allow-list, agent URL, timeouts, `$fetch` wrapper
    utils/viewer.ts         X-authentik-{username,name,groups} -> { username, name, groups, canMove }
  shared/                   (Nuxt 4: imported by app/ and server/ alike)
    types/regionExit.ts     Status, Region, RegionChoice, Availability, OverviewEntry, LastMove
    utils/describe.ts       describeAvailability, describeRegion, peopleCount (from html.ts)
    utils/canonical.ts      canonicalRegion (from picker.ts), egressMatchesRegion (from metrics.ts)
  test/
  dev/mock-agent.ts         a fake agent per exit for `npm run dev`
```

Runtime config, all overridable by env in the HelmRelease:

| Key | Env | Default |
| --- | --- | --- |
| `regionExits` | `NUXT_REGION_EXITS` | `spitfire,soarin,fleetfoot,misty-fly,high-winds` |
| `agentUrlTemplate` | `NUXT_AGENT_URL_TEMPLATE` | `http://region-exits-{name}.netbird-system.svc:8080` |
| `moverGroups` | `NUXT_MOVER_GROUPS` | `family,admins` |
| `quickCountries` | `NUXT_PUBLIC_QUICK_COUNTRIES` | `USA,Canada,UK` |
| — | `PORT` / `HOST` | `8080` / `0.0.0.0` |

Times are shown in `America/New_York`.

## D. Kubernetes

New app `kubernetes/apps/netbird-system/wonderbolts/`:

- `ks.yaml`: `dependsOn` region-exits; same `commonMetadata` label pattern
  (`app.kubernetes.io/name: wonderbolts`).
- `helmrelease.yaml` (app-template 5.3.0): one controller, 2 replicas, image by tag and
  digest with the pull secret, `PORT=8080`, probes on `/healthz`, uid 1000,
  `readOnlyRootFilesystem`, drop ALL, `automountServiceAccountToken: false`. Small requests,
  a `256Mi` memory limit to start.
- `route.wonderbolts-app`: `wonderbolts.${ROOT_DOMAIN}` on Gateway `internal` in `network`,
  `/` to the wonderbolts Service, `authenticated-user` filter. A different name from the
  region-exits route, so the two HelmReleases never fight over one object.
- `externalsecret.yaml`: the forge pull secret.
- `ciliumnetworkpolicy.yaml`: ingress on 8080 from Traefik (`traefik-network`) and `host`
  (probes), nothing else.
- `definition.yaml` (from phase 7): today's, with `friends` added to `access_policy.groups`
  and its Gatus check (302 on `/`) unchanged.

Changes to `region-exits/`:

- CNP: an L7 rule from `app.kubernetes.io/name: wonderbolts` in `netbird-system` on 8080 for
  `GET /status`, `GET /regions` and `POST /region`. At cleanup, remove Traefik's 8080 rule
  and the peers' `GET /status` rule.
- At cleanup, delete `route.wonderbolts`, `service.yaml` (`region-exits-pickers`) and
  `enableServiceLinks: true`.

Shared: `X-authentik-name` in `network/traefik/middleware/outpost.yaml` (A11).

## E. Phases

Each phase is its own PR.

1. **Agent API.** Root `GET /regions` and JSON `POST /region` (with `movedBy`), the
   last-move annotations and `lastMove` on `/status`, beside the old paths. Tests in
   `picker.test.ts`. CNP: a rule for the wonderbolts pods (it selects nothing yet), and
   Traefik's rule narrowed to any GET plus `POST /<name>/region`. Nothing visible changes.
2. **The app and its pipeline.** `apps/wonderbolts/` with the ported logic, tests and mock
   agent; `.github/workflows/wonderbolts.yaml` (PR check);
   `.forgejo/workflows/wonderbolts-image.yml` (push to `main` on `apps/wonderbolts/**`, plus
   `workflow_dispatch`, never `pull_request`, for the same reason as pulumi-workspace's);
   Renovate's `hostRules` and lockfile coverage. Merge, let it publish.
3. **Deploy, unrouted.** `kubernetes/apps/netbird-system/wonderbolts/` without the route, plus
   `X-authentik-name` on the outpost middleware. Check the app with `kubectl port-forward`
   against the real agents, sending the `X-authentik-*` headers by hand: the overview, a page,
   a move on an exit nobody is on, a move that 409s, and a friend's move that 403s.
4. **Cutover.** One commit: add `route.wonderbolts-app`, remove `route.wonderbolts`. While
   both exist the Gateway gives `/` to the older route, so the worst case is a few minutes of
   the old pages. Check: Gatus green (302), then the overview and one move as a family
   account in a browser. Rollback is reverting this commit.
5. **Cleanup, the same day.** Strip the HTML, `overview.ts`, `html.ts` and the
   `/<name>/...` paths from the agent; delete `region-exits-pickers`, Traefik's and the peers'
   CNP rules, and `enableServiceLinks`. Update region-exits.md §D4, ADR 0005's header
   ("amended by ADR 0006"; mark 0006 accepted), and `docs/runbooks/region-exits.md`.
6. **Friends.** Only now: the old pages had no group check, so friends added while they still
   exist could move region exits. Add `friends` to `access_policy.groups` (in region-exits'
   `definition.yaml`, with `kustomize.toolkit.fluxcd.io/prune: disabled` in the same commit,
   which is step one of phase 7). Check as a friend: the page opens, there are no controls,
   and a hand-sent POST gets 403. Add a friends paragraph to the runbook. **If phase 4 is
   ever reverted, remove `friends` first.**
7. **Move `definition.yaml`** to `wonderbolts/` once phase 6 has reconciled, so its Flux
   Kustomization changes without the old one pruning it first.

## F. Tests

- Port, not rewrite: `overview.test.ts` becomes tests of `api/region-exits/index.get.ts` and
  `utils/agent.ts` (unreachable exits, timeouts, malformed `/status`); the
  `describeAvailability`, `canonicalRegion` and `egressMatchesRegion` cases go with `shared/`
  (`metrics.test.ts` keeps covering the metrics output itself).
- `region.post.ts`: unknown name 404, non-JSON 415, a friend 403, no groups header 403, the
  agent's 409 passed through, `movedBy` is the display name or else the username, and the
  move is logged.
- `utils/viewer.ts`: pipe-separated groups, missing headers, names with spaces and non-ASCII
  characters.
- `picker.test.ts`: keeps `status` (now with `lastMove`), the switch and `regionsFrom`; loses
  the HTML cases in phase 5.
- Vitest with `@nuxt/test-utils` for the server routes; one Playwright pass of the move flow
  (family) and the friend view against the mock agent.

## G. Risks and things to check while building

- **Renovate's read access** to the forge registry (A8): if it can't authenticate, it skips
  the image without saying so, and the pin quietly falls behind.
- **Traefik's header handling**: in phase 3, confirm with a hand-sent `X-authentik-groups:
  admins` through the route as a friend that the app sees the outpost's value, not the
  client's.
- **Non-ASCII display names**: Node (and so h3) reads header values as latin1, so a UTF-8
  `X-authentik-name` such as "Zoë" arrives garbled. `utils/viewer.ts` re-decodes it
  (`Buffer.from(value, "latin1").toString("utf8")`, kept only if that round-trips), and a
  test covers it. The sidecar's old `/<name>/region` path does not, which is accepted
  because it goes at cleanup.
- **`crane append` on `.output/`**: the output needs no `node_modules` install at run time,
  so one layer is enough. Verify there are no native addons built against a different libc.
- **Polling load**: 2 replicas, a 30 s overview refresh and post-move polling all hit the
  agents, which give gluetun 5 s per call. Keep the post-move poll at 3-5 s and stop it after
  the 60 s warning.
- **The agents keep `runAsGroup: 0`** for conntrack and their RBAC on
  `region-exit-<name>-state` only. The annotations don't widen either.
- **No root domain or tailnet name** in `apps/wonderbolts/`. The app never needs the host,
  and `scripts/private-domain-guard` checks it.

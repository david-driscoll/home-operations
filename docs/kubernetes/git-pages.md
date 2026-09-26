# git-pages: static sites from Forgejo

[git-pages](https://codeberg.org/git-pages/git-pages) hosts static sites
published from Forgejo Actions. It runs in `coder` next to the forge, at
[`kubernetes/apps/coder/git-pages/`](../../kubernetes/apps/coder/git-pages/),
and stores every site in the `git-pages` bucket on `forgejo-garage`.

Access is internal only (LAN and Tailscale), via the `internal` gateway with
the `local-api` middleware.

## URL scheme

A **team** is a Forgejo organization (or user).

| Forgejo repository | Served at |
| --- | --- |
| `<team>/pages` (the team's index repo) | `https://<team>.pages.driscoll.tech/` |
| `<team>/<repo>` | `https://<team>.pages.driscoll.tech/<repo>/` |

`docs.driscoll.tech` 302-redirects to `docs.pages.driscoll.tech`, keeping the
path. The redirect is the `docs` route in the HelmRelease.

Nothing is served until something is published. A host with no site returns
`site not found`.

## Adding a team

No cluster change is needed. The route and certificate already cover
`*.pages.driscoll.tech`.

1. Create the organization in Forgejo, e.g. `docs`.
2. Create `<team>/pages` with default branch `main`.
3. Add the workflow below and push.

## Publishing workflow

Save this as `.forgejo/workflows/pages.yaml`. For the index repo:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch: {}

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Build step goes here if the site is generated (Hugo, MkDocs, ...),
      # writing into public/.
      - uses: https://codeberg.org/git-pages/action@v2
        with:
          site: http://docs.pages.driscoll.tech/
          server: git-pages.coder.svc.cluster.local:3000
          token: ${{ forgejo.token }}
          source: public/
```

For a project repo, use `site: http://<team>.pages.driscoll.tech/<repo>/`.

Notes on the non-obvious fields:

- **The full `https://codeberg.org/...` action URL is required.** Forgejo's
  `DEFAULT_ACTIONS_URL` is GitHub, so a bare `git-pages/action@v2` would be
  looked up on GitHub.
- **`server:` sends the upload straight to the in-cluster Service** while
  keeping `Host: <team>.pages.driscoll.tech`. That takes DNS, TLS and the
  gateway middleware out of the publish path from the runner's job
  containers.
- **`server:` replaces only the host, not the scheme.** That is why `site:` is
  `http://` here. Readers still use `https://`.
- **`token: ${{ forgejo.token }}` is the whole authorization.**
  - git-pages asks Forgejo whose token it is, via the in-cluster
    `forgejo-http` Service configured as `clone-url` in
    [`resources/config.toml`](../../kubernetes/apps/coder/git-pages/resources/config.toml).
  - It accepts the upload when that identity has push access to the matching
    repository.
  - So a repo can publish only to its own URL. `docs/foo` cannot overwrite
    `docs.pages.driscoll.tech/bar/`.
  - Publishing to a different repo's URL needs a personal access token with
    user:read and repository:read+write, stored as an Actions secret.

## Site features

- **`_redirects`**: Netlify syntax, without placeholders, query matching or
  conditions.
- **`_headers`**: only headers on the server's allowlist (default
  `X-Clacks-Overhead`).
- **`404.html`**: served for missing paths. `local-api` was chosen over
  `local-user` so error-pages does not replace it.

## Operations

- **Health.** There is no global health endpoint. `/.git-pages/health` is per
  site. Probes are TCP on 3000, and metrics are on 3002 (ServiceMonitor).
- **Alerts** are in
  [`prometheusrule.yaml`](../../kubernetes/apps/coder/git-pages/prometheusrule.yaml):
  - `GitPagesAbsent` (critical): the scrape target is gone.
  - `GitPagesServerErrors`: more than 5 5xx responses in 15m, usually
    forgejo-garage.
  - `GitPagesPublishFailing`: site updates failing with `timeout` or `other`.
    Rejected tokens never reach this metric; they show up only as a failed
    Action run.
- **Inspecting sites.** Run `kubectl -n coder exec deploy/git-pages -- git-pages
  -config /config/config.toml -list-manifests` to list everything published.
- **Config.** An unknown key in `config.toml` is fatal at startup. Validate
  against the pinned version's binary before bumping.
  - Example: `bucket-lookup` exists on upstream `main` but not in 0.9.1.
- **DNS.** The wildcard record is created by the Technitium external-dns
  instance. The UniFi instance deliberately skips wildcards, the same as
  `*.code`.
- **Git-based publishing does not work.** git-pages can also publish by
  cloning a repo or by webhook. Neither works here because Forgejo has
  `REQUIRE_SIGNIN_VIEW`, so use the Action.

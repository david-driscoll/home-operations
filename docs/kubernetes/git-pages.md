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

`setup.driscoll.tech` serves `docs/setup` in place. See
[setup.driscoll.tech](#setupdriscolltech-the-family-setup-guide) below.

Nothing is served until something is published. A host with no site returns
`site not found`.

## setup.driscoll.tech (the family setup guide)

`docs/setup` is the family-facing guide to setting up phones and TVs for the
home services. It is published like any project site, to
`https://docs.pages.driscoll.tech/setup/`. The family is given
`https://setup.driscoll.tech`, which is a **rewrite, not a redirect**. The
address bar keeps `setup.driscoll.tech`.

A rewrite is needed for two reasons:

- UniFi DNS can hold `setup.driscoll.tech` but not the `*.pages` wildcard.
  A phone on home Wi-Fi without Tailscale therefore could not follow a
  redirect to `docs.pages.driscoll.tech`.
- git-pages picks the site from the `Host` header alone. Rewriting the Host
  serves the same published site under a second name, with no second publish.

The `setup` route in the HelmRelease has two rules:

| Request on `setup.driscoll.tech` | Sent to git-pages as |
| --- | --- |
| `/setup…` | Same path, `Host: docs.pages.driscoll.tech` |
| Anything else, e.g. `/` or `/tailscale/` | `/setup` prepended, same Host rewrite |

Longest-prefix precedence keeps `/setup/…` out of the second rule. Without
that, `/setup/x/` would become `/setup/setup/x/`. Rule order does not matter.

Requirements on the site:

- **The Astro build must use `base: '/setup'`.** Starlight emits absolute links
  under `base`, and the first rule is what serves them.
- **`docs/setup` must use the SHA-1 object format.** `actions/checkout` fails
  on SHA-256 repositories. `docs/pages` is SHA-256, so do not copy its
  settings. The format can only be chosen when the repo is created.
- Publish with `site: http://docs.pages.driscoll.tech/setup/`.
- **Do not ship a `_redirects` file.** git-pages builds the redirect
  `Location` from the rewritten Host, which would send family to
  `docs.pages.driscoll.tech`.
- The route uses `local-api`, like `pages`, so the site's own `404.html` is
  served instead of error-pages.

[`definition.yaml`](../../kubernetes/apps/coder/git-pages/definition.yaml)
(`setup-guide`) gives the guide a Gatus check and a family tile in authentik.
The check fails until `docs/setup` has been published.

## Adding a team

No cluster change is needed. The route and certificate already cover
`*.pages.driscoll.tech`.

1. Create the organization in Forgejo, e.g. `docs`.
2. Create `<team>/pages` with default branch `main`. The quickest way is from the
   template (next section). Keep the object format **SHA-1** unless you have a
   reason not to.
3. Push. The workflow publishes it.

## Starting from the template

[`home-operations/pages-template`](https://git.driscoll.tech/home-operations/pages-template)
is a template repository with an Astro + Starlight docs site and a publish
workflow. Choose it under **New repository → Template**.

- **Nothing to configure.** The workflow derives the target from the repository
  name: `<org>/pages` publishes to `https://<org>.pages.driscoll.tech/`, and any
  other name to `/<repo>/`. The Astro `base` and `site` follow automatically.
- **Toolchain.** `mise.toml` pins Node and defines `mise run dev` / `build` /
  `preview`. CI runs the same `mise run build`.
- **Lockfile.** Commit a `package-lock.json` after the first `npm install`. CI
  switches to `npm ci` once one exists.

## Publishing workflow

For a site that needs no build step, save this as
`.forgejo/workflows/pages.yaml`. This is the index repo's version:

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

- **SHA-256 repositories need `GIT_DEFAULT_HASH: sha256` on the checkout step.**
  `actions/checkout` initializes a SHA-1 repo and then fails with
  `couldn't find remote ref <64-hex sha>`
  ([actions/checkout#1843](https://github.com/actions/checkout/issues/1843),
  [forgejo#9431](https://codeberg.org/forgejo/forgejo/issues/9431)). Setting the
  env var makes its `git init` use SHA-256:
  ```yaml
  - uses: actions/checkout@v4
    env:
      GIT_DEFAULT_HASH: sha256
  ```
  SHA-1 repositories need nothing.

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
  The one Gatus check is "Family Setup Guide" (`https://setup.driscoll.tech/`),
  which also covers the rewrite.
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

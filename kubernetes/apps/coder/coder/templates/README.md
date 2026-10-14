# Coder templates

The workspace templates Coder offers, as Terraform. Pulumi publishes them — nobody runs
`coder templates push`, and an edit made in Coder's own template editor is put back on the next
run. Change a file here, merge it, and `stacks/system` uploads a new version of every template
the file is part of and makes it the active one.

Flux ignores this directory: it is not listed in `../kustomization.yaml`.

## Layout

```
templates/
  shared/            copied into the root of EVERY template
    providers.tf       the only provider version pins
    variables.tf       template variables every template takes (set by Pulumi)
    workspace.tf       the one `module "workspace"` call
  modules/           copied into every template as ./modules
    workspace/         agent, pod, home volume, Docker sidecar, editors, tools, OpenBao
    repository/        one clone, plus its mise tools and its dev container
  repository/        TEMPLATE: one repository
  repositories/      TEMPLATE: several repositories side by side
```

A Coder template is one directory, uploaded as a tarball, so Terraform cannot reach a file
outside it. The templates here are therefore not uploadable as they sit: each holds only what
makes it different, and `stageCoderTemplate` in
[`components/coderTemplates.ts`](../../../../../components/coderTemplates.ts) copies `shared/`,
`modules/` and the template's own files into one directory, which is what gets uploaded.

A template's own `main.tf` owes the shared files one thing: `local.folder`, the absolute path
the editors open. Everything it adds attaches to `module.workspace.agent_id`.

## What a workspace gets

| | Module | Notes |
| --- | --- | --- |
| VS Code in the browser | `coder/code-server` | Installs the repository's recommended extensions. |
| VS Code Desktop and Insiders | built in (`display_apps`) | Open the home directory; the clones are under `~/src`. |
| JetBrains IDEs | `coder/jetbrains` | Through Toolbox 2.7+ with the Coder plugin. Choose the IDEs when creating the workspace. |
| JetBrains plugins | `harsh9485/jetbrains-plugins` | Only when the `jetbrains_plugins` template variable is set. Installed on the start after the IDE was first opened. |
| Claude Code | `coder/claude-code` | Sign in once; the login lives in the home volume. |
| Mux | `coder/mux` | |
| Git identity | `coder/git-config` | From the Coder account. |
| Commit signing | `coder/git-commit-signing` | With the Coder SSH key. Add it to the forge as a signing key. |
| Dotfiles | `coder/dotfiles` | Asked for when creating the workspace. |
| Clone | `coder/git-clone` | Into `~/src/<name>`. |
| Repository tools | `droopy4096/mise-install` | Installs mise, then `mise install` in the clone. One repository per workspace. |
| Dev containers | `coder/devcontainers-cli` | Needs the Docker option on. |
| OpenBao | `coder/vault-cli` or `coder/vault-jwt` | See below. |

Only the home directory (`/home/coder`) persists. Everything else comes from the image on every
start, and the Docker sidecar's images are lost when the workspace stops.

### Docker and dev containers

The **Docker and dev containers** option runs a Docker daemon as a sidecar. It is a privileged
container — the same trade `forgejo-runner` makes in this namespace — so it is an option, on by
default, rather than a fixture. With it on, a repository that has a `devcontainer.json` shows up
in the workspace's dashboard and can be started from there; the `repository` template can also
start it with the workspace.

### OpenBao

Workspaces are told OpenBao's in-cluster address and get the `vault` CLI. Every start also
logs in as the workspace owner, using the OIDC access token Coder already holds for them,
through the `auth/coder` mount. The token it gets can read and write
`secrets/coder/<owner's email>/*` and nothing else.

`VAULT_JWT_ENABLED` in
[`stacks/system/coder-templates.ts`](../../../../../stacks/system/coder-templates.ts) turns
the login off again: the templates then install the CLI only.

## How Pulumi gets into Coder

Pulumi publishes as a `pulumi` user with the Owner role, using a token it generates itself.
Coder cannot mint a token without a logged-in session and password login is off, so a Job
([`../resources/pulumi-token-job.yaml`](../resources/pulumi-token-job.yaml)) creates the user
and registers the token straight in Coder's database. Nobody makes a token by hand. The token
is also kept in OpenBao at `secrets/clusters/equestria/apps/coder/pulumi`.

## Adding a template

For **another repository, or another set of them**, there is no Terraform to write. Add an entry
to `TEMPLATES` in `stacks/system/coder-templates.ts` that reuses `repository` or `repositories`
with its own defaults.

For a template that is **shaped differently**, add a directory here with a `main.tf` that defines
`local.folder`, then add it to `TEMPLATES`. Do not give it a `providers.tf`, `variables.tf` or
`workspace.tf` — staging refuses a template whose files collide with `shared/`.

## Checking a change

```bash
npx tsx scripts/coder-templates /tmp/staged     # prints one staged directory per template
cd /tmp/staged/repository
terraform init -backend=false && terraform validate
terraform plan                                  # read-only; the Coder provider plans outside Coder
```

`terraform` is not pinned in `.config/mise.toml`; use the version Coder bundles
(`kubectl -n coder exec deploy/coder -- terraform version`).

To try one against the server without touching the managed templates, push the staged directory
under a throwaway name: `coder templates push scratch -d /tmp/staged/repository`.

## Versions

Renovate keeps these current, in one grouped pull request (`coder-templates`):

- every registry module's `version` and the two providers in `shared/providers.tf`, through the
  stock `terraform` manager;
- the Docker sidecar image, through the annotation above `dind_image` in
  `modules/workspace/main.tf`.

The workspace images are rolling tags pulled on every start, so there is nothing to bump. The
`coder/coderd` provider Pulumi uploads with is pinned in the root `Pulumi.yaml` and follows the
bridged-provider flow there.

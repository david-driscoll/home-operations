# Pulumi workspace image

The Pulumi Kubernetes Operator runs every Stack in a fresh workspace pod. On
upstream `ghcr.io/pulumi/pulumi-nodejs`, every one of those runs downloaded and
unpacked the same things onto the node's `/var`: about 2.5 GB, all of it the same
every time. On 2026-10-19 one commit started seven of them at once and six landed
on fluttershy. Its `/var` is a DRAM-less SATA SSD, and the I/O wedged its CRI
(memory note `pny-sata-var-pulumi-workspace-double-node-outage`;
`kubernetes/components/pulumi-workspace` has the placement half of the fix).

This image is the other half: upstream pulumi-nodejs with everything those runs
downloaded already inside it.

| Path in the image | What it replaces, per run |
| --- | --- |
| `/home/node/.pulumi/plugins` | every provider plugin the lockfile pins, downloaded lazily during `up` (0.9 to 1.2 GB) |
| `/home/node/.pulumi/dynamic_tf_plugins` | the Terraform providers behind `sdks/*` (60 to 180 MB) |
| `/home/node/.npm` | the npm cache for this lockfile (about 100 MB) |
| `/usr/local/bin/vals` | the `jdxcode/mise` init container that installed vals into an emptyDir |
| `/opt/npm` (npm 11) | needed for the `overrides` below |

## Measured

The workspace install phase, emulated in Docker the same way both times:
`stacks/system`, the source copied into `/share`, `pulumi install`, and then
every plugin the tree needs (the engine does that step lazily during `up`). The
bytes are the container cgroup's `io.stat` write total.

| | before (upstream image, main's lockfile) | after (this image + overrides, `--network none`) |
| --- | --- | --- |
| bytes written | **2,615 MiB** | **519 MiB** |
| plugin / provider downloads | 12 | 0 |
| nested `sdks/*/node_modules` | 8 (8 x 67 MB) | 0 |
| install phase | 43 s | 9 s |

The vals init container isn't in the "before" figure. The 519 MiB left is
`npm install` extracting `node_modules` into `/share`. The image can't hold that:
`/share` is an emptyDir the operator mounts over the image, and the source only
arrives there at run time. With the warm cache that step is an offline extract,
not a download.

## The `overrides` in package.json

Each generated SDK in `sdks/` depends on `typescript ^4.7` and `@types/node ^20`,
which clash with the root's, so npm nested a private 67 MB copy into every SDK.
Root `package.json` collapses them:

```json
"overrides": { "typescript": "$typescript", "@types/node": "$@types/node" }
```

with `@types/node` as a root devDependency so that `$@types/node` has something
to refer to. The overrides live in the root `package.json`, which
`.github/workflows/pulumi-sdk-regen.yaml` never rewrites (it touches `sdks/` and
the lockfile), so they survive regeneration. Each SDK's postinstall `tsc` now
compiles with TypeScript 6. All eight build, and their exports import.

**npm 11 or later is required.** npm 10, which pulumi-nodejs ships, ignores
root overrides for a workspace member's own dependencies. On this lockfile its
`npm ci` refuses ("Missing: typescript@4.9.5 from lock file"), and its
`npm install` puts the nested copies back. That is why the image carries npm
11.19.1, the version bundled with `.config/mise.toml`'s node pin. On the upstream
image (see break-glass) the overrides cost nothing: npm 10 just nests again.

## How it is built

- `images/pulumi-workspace/bake.sh` does all of it, as root inside the base
  image. It installs npm 11, then vals (URL and checksum from
  `.config/mise.lock`). It runs `npm ci --ignore-scripts` on the lockfile and
  workspace manifests to warm the cache. Then it runs
  `pulumi plugin install` for every plugin `list-plugins.mjs` finds in the
  installed tree, and `pulumi package get-schema terraform-provider@<v> <source> <version>`
  for each parameterized SDK, which fills `dynamic_tf_plugins` exactly as a run does.
- `images/pulumi-workspace/inputs.sh` is the one list of files the image depends
  on. `bake.sh` stages only those, and `tag.sh` hashes only those. The tag is
  `<pulumi-nodejs version>-<12 hex>`, so a commit that touches only `.ts` files
  or `kubernetes/` reuses the image already in the registry.
- `.forgejo/workflows/pulumi-workspace-image.yml` runs on the forge's `main`
  (push to those inputs, a daily schedule, or dispatch), never on a pull request.
  Its job container **is** the base image. It runs `bake.sh`, and
  `append-layer.sh` tars the baked paths into one layer, which `crane append`
  pushes onto the base. No Docker daemon is involved.
- `images/pulumi-workspace/Dockerfile` runs the same `bake.sh` for a local
  `docker build --platform linux/amd64 -f images/pulumi-workspace/Dockerfile .`.
  Both builds come out as the base plus one layer of the same files (verified
  locally: same 519 MiB, same zero downloads).

### Why no runner change

The brief offered two ways to build an image on the forge, and the layer append
avoids needing either:

- **A runner label whose jobs get the dind socket.** The dind sidecar is
  privileged, so its daemon is root on the node to any job that can reach it.
  Forgejo can't restrict a label to one workflow or one trigger: anyone who can
  push a branch could write a job that asks for the label.
- **Rootless BuildKit or buildah in an unprivileged job.** These need user
  namespaces plus an unconfined seccomp profile in the job container. That's
  more kernel surface on every node that runs a job, for a build that has no
  real `RUN` isolation needs.

The job containers stay as they are: unprivileged, with no Docker socket
(`kubernetes/apps/coder/forgejo-runner/resources/config.yml`).

## Registry, credentials and pulls

The image is `git.${ROOT_DOMAIN}/estate-images/pulumi-workspace:<tag>@sha256:<digest>`.
It lives in Forgejo's package registry, which stores its blobs in the
`forgejo-garage` bucket.

- **`estate-images`** is a Forgejo user (`stacks/system/forgejo-github-mirror.ts`)
  that owns the image. It has two tokens. `write:package` goes to the mirror
  repository's Actions secret `ESTATE_IMAGES_TOKEN`. `read:package` goes to
  OpenBao at `clusters/equestria/apps/pulumi/workspace-image-pull`.
- **Pull secret.** The forge is `REQUIRE_SIGNIN_VIEW`, so anonymous pulls are
  refused. `kubernetes/apps/pulumi/workspace-image` turns the read token into
  the `pulumi-workspace-image-pull` dockerconfigjson Secret, and the component
  lists it in `imagePullSecrets`. It is its own Flux Kustomization on purpose.
  In `pulumi-secrets` it would sit in front of the `system` stack, which is the
  stack that writes the token, so a missing token could never be recreated.
- **How a node reaches it.** containerd runs on the host, so it resolves the
  forge's hostname through the host's resolvers (Technitium) to the Traefik LB.
  `talos/patches/global/machine-registries.yaml` has no mirror entry for it and
  needs none. Spegel lists the forge in `mirroredRegistries`, so a node can
  fetch the image from a peer that already has it. That's safe because the
  reference is pinned by digest.
- **`imagePullPolicy: IfNotPresent`** (the default for a non-`latest` tag): a
  node that already has the digest never asks the registry again.

### Rolling a new image out

The workflow only publishes. The workspaces pin tag **and** digest in
`kubernetes/components/pulumi-workspace`, and nothing goes live until that line
changes. The workflow's last step prints the line to paste whenever the pin is
behind.

A stale pin isn't an outage. The old image's plugins and npm cache still cover
everything that didn't change, and a workspace downloads the rest exactly as it
did before this image existed. So bump the pin when convenient, for example
after a provider bump. There's no need to chase every lockfile change: every
commit to `main` re-runs all Stacks, so each bump costs a full fan-out.

Why the digest: a tag in this registry can be overwritten by anyone holding the
push token. This image runs with the estate's OpenBao AppRole and Pulumi
passphrase in its environment, so the workspaces trust the digest only.

## The bootstrap loop

The `system` stack manages Forgejo's accounts and tokens, including this image's
pull token. It runs in a workspace pod that needs this image. The forge itself
needs the shared CNPG `postgres`, its `forgejo-garage` bucket, Traefik and
Technitium.

When the forge is down:

- Nodes that already hold the pinned digest start workspaces normally
  (`IfNotPresent`).
- A node without it pulls it from a spegel peer that has it.
- A fresh or rebuilt node with no peer holding the digest (all nodes new, or the
  digest just bumped) **cannot start any Stack, `system` included**, until the
  forge is back. Repairing the forge through Pulumi then means using the
  break-glass below first.

## Break-glass: back to the upstream image

When Stacks are stuck in `ImagePullBackOff` / `ErrImagePull`, or this image is
broken:

1. In `kubernetes/components/pulumi-workspace/kustomization.yaml`, set the
   workspace image back to upstream, the same version as the `FROM` in
   `images/pulumi-workspace/Dockerfile`:
   `image: ghcr.io/pulumi/pulumi-nodejs:3.270.0`.
2. Upstream has no vals binary, so `VALS_BIN` points at nothing and every
   `ref+openbao://` resolution fails (`spawn ... ENOENT`). Either restore the
   `vals` init container from git history (`git log -S 'jdxcode/mise' --
   kubernetes/apps/pulumi`; it installs into an emptyDir and `VALS_BIN` points
   there), or accept that stacks resolving `ref+openbao://` fail until the image
   is back. The others run normally.
3. Commit and push to GitHub's `main` directly if Flux and the forge are both
   unhealthy: the forge's merge path is part of what's broken. Flux reads GitHub.

Everything else degrades rather than fails on upstream. npm 10 nests the SDK
dependencies again and every run downloads its plugins again, which is exactly
the behaviour before this image.

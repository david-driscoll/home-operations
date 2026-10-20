# talos/ — equestria's machine config

Rendered and applied by [TOPF](https://postfinance.github.io/topf/main/) (`postfinance/topf`,
pinned in `.config/mise.toml`), always through the `mise run talos:*` tasks. talhelper drove this
directory until 2026-10; it was archived upstream on 2026-08-26.

None of this is GitOps. Flux never reads it, and a change is inert until someone applies it, one
node at a time.

## Layout

```text
topf.yaml            cluster, versions (Renovate-tracked), secrets bundle, the seven nodes and
                     their per-node facts (`data:` — MAC, disks, labels, annotations)
schematics/          Image Factory schematics; each node's `schematicId` points at one
all/                 patches for every node
control-plane/       patches for the control planes only
worker/              patches for workers only (none today)
node/<host>/         patches for one node (none today — per-node facts live in topf.yaml)
talsecret.sops.yaml  the Talos secrets bundle (cluster PKI, tokens, secretbox key)
clusterconfig/       rendered output of `talos:genconfig` — gitignored, all of it secret
```

For each node TOPF generates a base config from the secrets bundle, with the Talos machinery it
vendors (`topf --version`). It then applies `all/`, the role folder and `node/<host>/`, in that
order, each folder in filename order:

- `*.yaml` files are strategic-merge patches.
- `*.yaml.tpl` files are Go templates (sprig functions, `missingkey=error`), rendered first with
  `.Node.Host`, `.Node.IP`, `.Node.Data.<key>` and topf.yaml's `.Data`.
- A document with `$patch: delete` removes the generated document of that kind (and name).

**Ordering is load-bearing in places.** `control-plane/10-cluster.yaml` deletes the generated etcd
encryption config, and `control-plane/30-etcd-encryption.yaml.tpl` re-adds the correct one.
Renumbering them the other way round leaves the apiserver unable to read Secrets. Each file says
why it exists; read it before changing it.

## Things the generator does that these nodes never had

These nodes were upgraded in place from older Talos versions. A freshly generated 1.14 config
carries defaults they have never run with, so the patches neutralise them:

| Generated default | Patch |
|---|---|
| workload isolation on (`SecurityProfileConfig`) | `all/01-workload-isolation.yaml` sets it off |
| `/var` mounted `nosuid,nodev` (`VolumeConfig EPHEMERAL`) | `all/02-ephemeral-volume.yaml` keeps today's options |
| `exclude-from-external-load-balancers` label on control planes | `all/03-node-config.yaml` rebuilds `KubeNodeConfig` without it |
| Flannel (`KubeFlannelCNIConfig`) | deleted in `all/10-cluster-network.yaml` (Cilium is the CNI) |
| CoreDNS (`KubeCoreDNSConfig`) | disabled in `control-plane/10-cluster.yaml` |
| kube-proxy, PodSecurity admission | disabled / deleted in `control-plane/10-cluster.yaml` |

A TOPF bump can change these defaults, which is why it is never automerged. After bumping, check
`mise run talos:diff`.

## Secrets and the root domain

- `talsecret.sops.yaml` is read in place through sops. Every task refuses to run unless it exists
  and is encrypted. If it is missing, TOPF offers to **generate a new bundle**, which means a
  different cluster's CAs. Never accept that prompt.
- The etcd secretbox key is exported by the tasks from that bundle (`scripts/lib/talos-topf.sh`),
  because templates cannot read the bundle.
- The root domain (registry mirrors, cert SANs) comes from `ROOT_DOMAIN` in the environment, which
  mise exports from `.config/domains.sops.yaml`. The repo never writes it
  (`docs/plans/private-domain-scrub.md`), and the templates fail rather than render without it.

## Tasks

| Task | What it does |
|---|---|
| `talos:diff [ip]` | read-only: Talos's own diff against the running config, one node or each in turn (exit 2 = changes) |
| `talos:apply-node <ip>` | apply to one node; shows the diff and asks first |
| `talos:apply --nodes-filter <re>` | apply to a deliberate group; the filter is required |
| `talos:add-node <ip>` | apply to a node in maintenance mode |
| `talos:genconfig` | render every node into `clusterconfig/`, plus an admin `talosconfig` |
| `talos:validate-config` | `talosctl validate --strict`, and that every version pin agrees |
| `talos:upgrade` | read-only: which nodes differ from topf.yaml's version/schematic |
| `talos:upgrade-node`, `talos:upgrade-k8s[-to]` | break-glass upgrades outside tuppr |
| `talos:reset[-node]`, `talos:rotate-ca`, `talos:reboot`, `talos:backup-etcd`, `talos:preflight-upgrade` | as their descriptions say |

**tuppr owns Talos and Kubernetes upgrades** (`kubernetes/apps/system-upgrade/upgrades/`). The
Kubernetes and Talos versions are pinned in three places: `topf.yaml`, `versions.env` and the
tuppr CRs. `talos:validate-config`, which every applying task depends on, fails unless all three
agree. Without that check, an apply could carry a Kubernetes upgrade past tuppr's health checks.

## Adding a node

1. Add it to `topf.yaml` with its `ip`, `role`, `schematicId` and `data` (copy a node of the same
   hardware).
2. If its schematic is new, register it once with `topf schematic-ids --submit-to-factory`. The
   factory cannot build an image for an ID it has never seen.
3. Boot it into maintenance mode, then run `mise run talos:add-node <ip>`.

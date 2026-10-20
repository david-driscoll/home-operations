# Cutover: equestria's Talos config from talhelper to TOPF

Done by hand, one node at a time. Written 2026-10-20 against Talos **v1.14.4** on every node and
TOPF **0.6.1** (Talos v1.14.1 machinery). Read `talos/README.md` first.

## What the first apply changes

TOPF generates every config fresh in the Talos 1.14 multi-document format. These nodes still run
the mostly-v1alpha1 config that talhelper's older machinery produced. So the **first** TOPF apply
rewrites the text of every node's config: documents move, v1alpha1 fields become their 1.14
documents, and CA material moves out of `cluster:` into `KubeAPIServerCAConfig` and friends.
`talos:diff` is long because of this.

What the node *does* stays the same, except for the items below. This was checked before the
cutover in two ways. First, both configs were loaded with Talos machinery v1.14.4 and every
effective setting was compared, on all seven nodes. Second, Talos itself reports
**"Applied configuration without a reboot"** on all seven (`topf apply --dry-run`, 2026-10-20).

Deliberate changes, approved:

| Change | Where | Effect |
|---|---|---|
| kubelet `extraMounts` for `/var/mnt/extra/openebs/local` dropped | every node | `openebs-hostpath` can no longer provision. It had no PVs. Remove openebs as a follow-up |
| `.machine.files` → `CRICustomizationConfig` `spegel` | every node | same containerd setting, new file name under `/etc/cri/conf.d/` |
| `.machine.install` → `UnattendedInstallConfig` | every node | same disk, same image; only read at install/upgrade |
| explicit `SecurityProfileConfig {workloadIsolation: false}` | every node | none: they were never isolated |
| explicit `VolumeConfig EPHEMERAL {mount.secure: false}` | every node | none: `/var` keeps `rw,relatime,…` without `nosuid,nodev` |

**Pre-existing drift.** These are in git but were never applied, and they ride along unless step 0
applies them first:

| Drift | Nodes |
|---|---|
| registry mirrors `data.forgejo.org` and `mcr.microsoft.com` | all seven |
| label `driscoll.dev/ephemeral-disk: sata` (keeps Pulumi workspaces off them) | fluttershy, kerfuffle |
| install image schematic `82664fb…` → `b2443f…` (the one it already runs) | shining-armor |

## Prerequisites

- [ ] `age.key` present, `SOPS_AGE_KEY_FILE` pointing at it.
- [ ] `mise install` complete in this checkout, `topf` and `talosctl` included.
  - It runs the repo's postinstall hook (`pulumi install`), which can rewrite or delete tracked
    files under `sdks/`. Afterwards run `git status` and `git checkout -- sdks package-lock.json`.
  - For the tasks below, `MISE_TASK_RUN_AUTO_INSTALL=false mise run …` stops a task from
    re-running that install.
- [ ] `mise run talos:validate-config` passes. Every version pin agrees and all seven configs
  validate `--strict`.
- [ ] tuppr is idle. Neither the `TalosUpgrade` nor the `KubernetesUpgrade` in `system-upgrade`
  is mid-rollout:

  ```sh
  kubectl -n system-upgrade get talosupgrade,kubernetesupgrade
  ```

- [ ] `mise run talos:preflight-upgrade` passes: all nodes Ready, VolSync quiet.
- [ ] No Longhorn volume is `degraded`:

  ```sh
  kubectl -n longhorn-system get volumes.longhorn.io -o custom-columns=NAME:.metadata.name,ROBUSTNESS:.status.robustness | grep -v healthy
  ```

## Step 0 — apply the drift with the old tooling (optional, recommended)

This makes the first TOPF diff format-only, so anything unexpected in it stands out. Run it from a
checkout of `main` **before** this branch merged, i.e. with talhelper still in place:

```sh
mise run talos:apply-node 10.10.206.10   # shining-armor
# … then 10.10.206.14, 10.10.206.16, 10.10.206.17, 10.10.209.10, 10.10.209.12, 10.10.209.11
git checkout -- talos/clusterconfig/.gitignore   # talhelper rewrites it on every genconfig
```

Each apply should show only the two mirrors, plus the label (fluttershy, kerfuffle) or the install
image (shining-armor).

## Step 1 — preview every node

On the TOPF branch (or `main` once merged):

```sh
mise run talos:diff            # read-only; exit 2 = "changes", which mise reports as a failure
```

For every node, check two things:

- The summary line says `Applied configuration without a reboot`.
- The hunks are only the reshaping described above, plus any step-0 drift not yet applied.

Things that must **not** appear on the `+` side:

| Must not appear | Would mean |
|---|---|
| `workloadIsolation: true` | workload isolation switched on |
| `kind: KubeFlannelCNIConfig` | Flannel deployed beside Cilium |
| `exclude-from-external-load-balancers` | control planes dropped from LoadBalancer backends |
| `enabled: true` under `KubeCoreDNSConfig` | Talos deploying its own CoreDNS |
| `enabled: true` under `KubeProxyConfig` | kube-proxy deployed beside Cilium's replacement |
| `secure: true` under `VolumeConfig EPHEMERAL` | `/var` remounted `nosuid,nodev` |
| `key1`, or a `KubeEtcdEncryptionConfig` without `identity: {}` | apiservers unable to read Secrets |
| a hostname other than the node's own | the node renamed |

Anything else unexpected: stop.

## Step 2 — first real apply: shining-armor

Why shining-armor:
- It's the one node certain to be a VM (its schematic carries `qemu-guest-agent`). If the network
  documents were wrong, it would be recoverable from the Proxmox console rather than by walking to
  the machine.
- It's a worker, and holds `bulk`-tier Longhorn replicas only.
- It has its own schematic, so its install image is the most distinctive one to check.

```sh
mise run talos:apply-node 10.10.206.10 --mode no-reboot
```

`--mode no-reboot` makes Talos refuse rather than reboot, should it disagree with the dry run. TOPF
shows the diff again and asks. After applying it waits for the node to stay Ready for 30s.

What to watch, in order:

1. **The node is Ready, with the right name and address.**

   ```sh
   kubectl get node shining-armor -o wide
   talosctl -n 10.10.206.10 get hostname
   talosctl -n 10.10.206.10 get addresses | grep 10.10.206.10
   ```

2. **Labels and annotations unchanged.** Compare with the other workers:

   ```sh
   kubectl get node shining-armor --show-labels
   ```

   There must be no `exclude-from-external-load-balancers` label.

3. **Cilium.** The agent pod on the node is Ready and `cilium status` from it reports OK. Pods on
   the node keep their networking.
4. **Longhorn.** The node's disk stays schedulable, and no volume goes `degraded`
   (`kubectl -n longhorn-system get nodes.longhorn.io shining-armor`, plus the robustness query
   above). A kubelet restart can briefly re-attach volumes.
5. **Registry mirrors.** The applied config lists all nine `RegistryMirrorConfig` documents, and
   a pull works:

   ```sh
   talosctl -n 10.10.206.10 get machineconfig v1alpha1 -o yaml \
     | yq '.spec' | yq 'select(.kind == "RegistryMirrorConfig") | .name'
   talosctl -n 10.10.206.10 image pull docker.io/library/busybox:latest
   ```

   The pull should arrive through zot; zot's log shows the request. Don't judge this from
   `/etc/cri/conf.d/hosts/`: spegel writes into that directory too.
6. **spegel.** `discard_unpacked_layers = false` is still in effect:

   ```sh
   talosctl -n 10.10.206.10 read /etc/cri/conf.d/cri.toml | grep -n discard_unpacked_layers
   ```

   The spegel pod on the node is Ready.
7. **talos-logs.** The node's kubelet/containerd lines and kernel lines keep reaching Loki with
   `node="shining-armor"`.
8. **Workload isolation still off.** No `sandboxd` service:

   ```sh
   talosctl -n 10.10.206.10 services | grep -i sandbox
   ```

   This must print nothing.

Leave it at least an hour, ideally overnight, before continuing.

## Step 3 — the remaining workers, one at a time

```sh
mise run talos:apply-node 10.10.206.14 --mode no-reboot   # hard-hat
mise run talos:apply-node 10.10.206.16 --mode no-reboot   # fluttershy
mise run talos:apply-node 10.10.206.17 --mode no-reboot   # kerfuffle
```

Before each one, repeat step 2's checks for the node just done, and wait for Longhorn to show no
`degraded` volume.

After fluttershy and kerfuffle, if step 0 was skipped:

```sh
kubectl get nodes -l driscoll.dev/ephemeral-disk=sata
```

This now lists both nodes, and the pulumi-workspace anti-affinity starts to bite.

## Step 4 — the control planes, one at a time, VIP holder last

At writing, othalla held the API VIP 10.10.206.201:

```sh
talosctl -n 10.10.209.11 get addresses | grep 10.10.206.201
```

Do the other two first:

```sh
mise run talos:apply-node 10.10.209.10 --mode no-reboot   # milky-way
mise run talos:apply-node 10.10.209.12 --mode no-reboot   # pegasus
mise run talos:apply-node 10.10.209.11 --mode no-reboot   # othalla
```

After each, in addition to step 2's checks:

1. **etcd is healthy, with all three members.**

   ```sh
   talosctl -n <ip> etcd status
   talosctl -n <ip> etcd members
   ```

2. **The node's apiserver reads Secrets.** This is the 2026-09-21 failure mode: a wrong
   encryption config leaves the apiserver NotReady on "no matching key was found for the provided
   Secretbox transformer".

   ```sh
   kubectl --server https://<ip>:6443 get secrets -A --no-headers | wc -l   # same count as before
   talosctl -n <ip> read /system/secrets/kubernetes/kube-apiserver/encryptionconfig.yaml \
     | yq '.resources[].providers[] | keys'                                   # secretbox, then identity
   ```

   The second command shows provider names only, never the key.
3. **The static pods run the expected version.** `kube-apiserver`, `kube-controller-manager` and
   `kube-scheduler` are Running on the node at topf.yaml's `kubernetesVersion` (v1.37.1 at
   writing), and Prometheus still scrapes controller-manager and scheduler (`bind-address 0.0.0.0`)
   and etcd on 2381.
4. **No CoreDNS or kube-proxy appeared.**

   ```sh
   kubectl -n kube-system get ds,deploy | grep -E 'kube-proxy|coredns'
   ```

   Only the cluster's own CoreDNS may show.
5. **The VIP is still answered,** and a kubeconfig that uses the `apiserver.equestria.<root
   domain>` name still passes TLS (the certSAN).
6. **Technitium** (on the control planes) still resolves internal names.

## Done

```sh
mise run talos:diff   # exit 0: no node has anything left to apply
```

Delete any rendered files you copied out of `talos/clusterconfig/`; they hold the cluster secrets.

## Rollback

TOPF and talhelper render from the same `talsecret.sops.yaml`, so there is no PKI to undo. Only
the document layout and the approved changes differ.

To put one node back on the talhelper config:

```sh
git switch --detach "$(git merge-base origin/main talos/topf-migration)"   # the commit before this migration
# or, once merged: the merge commit's first parent
mise install                                   # talhelper is pinned there; restore sdks/ afterwards
mise run talos:genconfig
mise run talos:apply-node <ip> --mode no-reboot
git checkout -- talos/clusterconfig/.gitignore
git switch -
```

To roll back the whole migration in git, revert the branch's commits. The task switch and the
removal of the talhelper files are separate commits, so either can be reverted alone.

The approved changes come back with a rollback too: the openebs mount, `.machine.files`, and
`.machine.install`.

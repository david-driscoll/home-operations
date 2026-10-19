# Talos node logs in Loki

Talos keeps its own logs -- kubelet, containerd, `cri`, `machined`, `apid`, the
kernel ring buffer -- **in memory only**. `talosctl logs` and `talosctl dmesg`
read that buffer, and a reboot empties it. On 2026-10-17 two workers lost their
CRI (kubelet's calls to containerd timed out while Talos still reported `cri`
healthy) and had to be power-cycled; the logs that would have said why went
with the reboot.

So every node now streams both to Loki:

| Stream | Talos config | Receiver | Loki `job` |
| --- | --- | --- | --- |
| Service logs | `machine.logging.destinations` → `tcp://127.0.0.1:6051/` | `otelcol.receiver.tcplog "service"` | `talos/<service>` |
| Kernel log | `KmsgLogConfig` → `tcp://127.0.0.1:6050/` | `otelcol.receiver.tcplog "kernel"` | `talos/kernel` |

- Sending half: [`talos/patches/global/machine-logging.yaml`](../../talos/patches/global/machine-logging.yaml)
- Receiving half: [`kubernetes/apps/observability/talos-logs`](../../kubernetes/apps/observability/talos-logs) --
  a hostNetwork Alloy DaemonSet listening on each node's **loopback**, so every
  node ships to the receiver on itself and that receiver sets `node`. Neither
  Talos stream carries a hostname, and `KmsgLogConfig` cannot take `extraTags`,
  so locality is the only node identity available.
- It is a separate Alloy from `observability/alloy` because
  `otelcol.receiver.tcplog` is experimental and needs
  `--stability.level=experimental`, which should not touch the main instance.

## Labels

`job`, `node`, `talos_service` (`kubelet`, `cri`, `containerd`, `machined`,
`kernel`, ...), `level`, plus the usual `cluster`, `cluster_title`,
`environment`, `region`, `machine_type`. Kernel lines carry `facility` as
structured metadata. Timestamps are Talos's own (`talos-time`), not arrival
time, so a burst replayed after a reconnect lands where it happened.

## Queries

```logql
# Everything one node said, newest first
{job=~"talos/.+", node="fluttershy"}

# Why did the kubelet think the runtime was down?
{talos_service="kubelet", node="shining-armor"} |~ "(?i)runtime|PLEG|DeadlineExceeded"

# containerd / CRI errors across the cluster
{talos_service=~"cri|containerd", level=~"warn|error"}

# Kernel I/O errors (failing disk, or an iSCSI volume detached underneath a mount)
{job="talos/kernel"} |~ "(?i)i/o error|blk_update|EXT4-fs|XFS"

# Which nodes are shipping at all (expect one series per node)
sum by (node) (count_over_time({job=~"talos/.+"}[15m]))
```

From a laptop without Grafana:

```bash
kubectl -n observability port-forward svc/loki :3100   # note the port it picks
```

Then `GET /loki/api/v1/query_range` on that port. Don't fix a port: other
sessions may already hold it.

## Applying the Talos half

The receiver is plain Flux and deploys on merge. The Talos patch does
**not** apply itself. `machine.logging` and `KmsgLogConfig` both take effect
without a reboot.

As of 2026-10-18 it had been applied to **no** node: talhelper renders both
documents correctly, but nobody had run the apply, so Loki had no `talos/*`
streams at all. Check with `talosctl get kmsglogconfigs`; an empty list means
the node is not shipping.

Patch the file itself onto the live config, one node at a time. Don't apply
the whole rendered `clusterconfig/equestria-<node>.yaml`: that carries every
other change pending in the repo. On 2026-10-18 the full-file dry run also added
the `data.forgejo.org` and `mcr.microsoft.com` registry mirrors, and on a
control plane it can carry a Kubernetes version bump that belongs to tuppr.

```bash
talosctl -n <ip> -e <ip> patch machineconfig \
  --patch-file talos/patches/global/machine-logging.yaml --mode=no-reboot --dry-run
talosctl -n <ip> -e <ip> patch machineconfig \
  --patch-file talos/patches/global/machine-logging.yaml --mode=no-reboot
```

The dry run should show only the `logging` block and the new `KmsgLogConfig`
document. Anything else means live has drifted from the repo; stop and find
out why before applying. The patch is multi-document (strategic merge plus a
new document), and `talosctl patch` takes it as is. It lands in STATE, so it
survives a reboot. A later full `apply-config` from the rendered file keeps
it, because the file contains it too.

## Verifying

```bash
kubectl -n observability get ds talos-logs        # one ready pod per node
```

Then run the "which nodes are shipping" query above. A node with no series either
has not had the patch applied or has no receiver pod.

## Limits

- **Before the receiver pod is up** (early boot, or the pod is down), Talos
  cannot connect and those lines are not shipped. They are still in
  `talosctl logs` until the next reboot.
- **If the node's own host networking is gone**, the receiver can't reach Loki
  either. Lines shipped before that point are safe; lines after it are not.
- **When a node is failing**, capture the logs before rebooting it anyway:
  `talosctl logs cri`, `talosctl logs kubelet`, `talosctl dmesg`. Loki is the
  backstop, not the first look.

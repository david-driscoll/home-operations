# LXC UID Mapping and Docker Container Permissions

## Overview

Both `luna-dockge` (LXC 400) and `celestia-dockge` (LXC 300) are **unprivileged** Proxmox LXC
containers running Docker. This has important implications for filesystem permissions on
bind-mounted paths.

## How Unprivileged LXC UID Mapping Works

Proxmox uses the default subuid/subgid range from `/etc/subuid` and `/etc/subgid`:

```
root:100000:65536
```

This means every UID inside the LXC is shifted by 100000 on the host:

| Inside LXC (container) | On PVE host |
|------------------------|-------------|
| 0 (root)               | 100000      |
| 1000                   | 101000      |
| 65534 (nobody)         | 165534      |

**Key rule:** When a Docker container inside the LXC runs as UID X, the actual write to the
host filesystem is performed as UID `100000 + X`.

## Mount Points (luna-dockge and celestia-dockge)

Both LXCs share the same mount layout (`pct.conf` `mp` entries):

| LXC path       | Source on PVE host                        | Notes                        |
|----------------|-------------------------------------------|------------------------------|
| `/data`        | `/data` (local ZFS dataset)               | Writable — backup destination |
| `/spike/backup`| `/mnt/pve/<host>-mnt-stash-backup-nfs`   | Read-only source (NFS)       |
| `/spike/data`  | `/mnt/pve/<host>-mnt-stash-data-nfs`     | Read-only source (NFS)       |

The NFS mounts (`/spike/*`) are owned `568:568 drwxrwxrwx` on the PVE host — world-writable,
no issues there.

The local `/data` ZFS dataset is owned by `root:root (0:0)` on the PVE host and mounted
read-write into the LXC.

## The Permission Problem

The `backups` Docker stack (`docker/_common/backups/compose.yaml`) runs as:

```yaml
user: "65534:65534"
```

Inside the LXC, UID 65534 maps to **host UID 165534**. When rclone tries to write or delete
files under `/data/backup`, the kernel checks host UID 165534 against the directory owner (host
UID 0, root). With `drwxr-xr-x` (755) permissions, "other" only has `r-x` — **no write**.

Even though `stat` inside the LXC shows `/data/backup` as owned by `65534:65534` (because host
UID 0 falls outside the LXC's UID map and displays as the overflow UID), the actual kernel
permission check uses real host UIDs. The display is misleading.

## The Fix

On each PVE host, recursively change ownership of `/data/backup` to host UID 165534, which
corresponds to UID 65534 (nobody) inside the LXC:

```bash
# Run on celestia.opossum-yo.ts.net and luna.opossum-yo.ts.net
chown -R 165534:165534 /data/backup
```

This only needs to be re-applied if:
- The `/data` ZFS dataset is recreated or snapshotted/restored with different ownership
- The LXC is recreated (changing its subuid allocation)
- New top-level subdirectories are created under `/data/backup` by a root process

## Keeping It Right After Future Rebuilds

If you respin either LXC and the backups start failing with `permission denied` on
`/data/backup`, this is almost certainly the cause. Quick diagnosis:

```bash
# On the PVE host — check owner
stat -c '%u:%g %A %n' /data/backup

# Should be 165534:165534. If it's 0:0, run:
chown -R 165534:165534 /data/backup
```

If you change the `user:` in `compose.yaml` away from `65534:65534`, recalculate:
`host UID = 100000 + <container UID>` and chown accordingly.

## Secondary: rclone Config Path

UID 65534 (nobody) has no home directory — its `$HOME` is `/nonexistent`. rclone tries to save
its config to `$HOME/.rclone.conf` and fails with:

```
ERROR : Failed to save config after 10 tries: failed to create config directory: mkdir /nonexistent/: permission denied
```

This is non-fatal (rclone falls back to defaults) but noisy. The fix is already in
`compose.yaml`:

```yaml
environment:
  - RCLONE_CONFIG=/tmp/rclone.conf
```

This requires a full stack redeploy from Dockge (not just `docker restart`) to take effect,
since `docker restart` reuses the existing container config.

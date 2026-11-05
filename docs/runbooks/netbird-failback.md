# NetBird: failover, acknowledging it, and failing back

The NetBird server runs on two Azure VMs: `netbird-azure-eus2` (East US 2, the primary) and `netbird-azure-cus`
(Central US, the standby). OCI's `netbird-edge` can join them as a second standby once `ociVm` is back on. The
design is in [`docs/plans/netbird-mirror.md`](../plans/netbird-mirror.md) §E and its "Azure primary" notes
(#3001).

## How it works

- **DNS is the lease.** Every host runs a fence (`components/netbird/fence.ts`, the `netbird-fence.timer` unit,
  every 15 s). It asks the zone's own nameservers where `netbird.<root domain>` points, and runs `netbird-server`
  and the dashboard only while the answer is that host's own IP. Traefik and the relay always run.
- **Promotion.** A fence that sees the lease arrive restores the newest Garage snapshot first, if its store is
  empty, then starts management and the 15-minute backups. The snapshot's `acme.json` replaces the host's, so the
  new holder serves the old holder's certificate (see "acme.json" below).
- **Demotion.** A fence that sees the lease leave stops management and the backups, and moves its store and
  `acme.json` to `/opt/netbird/backup/demoted/<time>/` (the newest three are kept). A demoted host therefore
  always restores the newest snapshot the next time it is promoted, never its own stale copy. Then it restarts
  Traefik, which closes the clients' connections so they redial and follow the lease. Without that, clients
  kept retrying on their open connection to the old host: about 18 minutes in the #2892 drill. The restart
  also drops that host's relay clients for a moment; they reconnect to another relay. Every other stop of a
  running management (`stop (shared)`, `stop (unknown)`) restarts Traefik too.
- **Not knowing.** If no nameserver answers, a running management holds for 120 s, then stops. A stopped one
  never starts on an unknown lease.
- **The watchdog** (`kubernetes/apps/netbird-system/failover-watchdog`, a CronJob every minute in Equestria)
  probes management where the lease points. After 5 failed runs in a row it repoints the lease at the first
  standby that answers TLS on 443, but only if Cloudflare answered too. It never flips twice within 60 minutes,
  and never from a management it has not once seen answer (its state ConfigMap's `everHealthy`).
  Every flip pages as `NetbirdFailover`; a flip it would make but may not pages as `NetbirdFailoverBlocked`.
- **Pulumi and the lease.** `netbird-edge:primary` says which host config assigns the lease to.
  `DnsLeaseAssignment` writes the record only when that value (or that host's address) changes, so a run after a
  watchdog flip leaves the flip alone. It logs a warning until someone acknowledges it.

Expect up to 15 minutes of changes to be lost on a failover (the snapshot interval). Peers reconnect without
re-enrolling, because the name, the store key and the relay secret are the same everywhere.

## After a failover: acknowledge it

`NetbirdFailover` fired, so the lease now points at the standby.

1. **Check the new holder is serving.** Its fence log should end in `start (mine)` and show the restore:

   ```bash
   ssh root@netbird-azure-cus.<tailnet> journalctl -u netbird-fence --since -30min | grep -v 'standby (other)'
   ```

   Open `https://netbird.<root domain>` and log in.
2. **Check the old primary is fenced** if it's reachable. Its log should show `demote (other)`, and
   `docker ps` there should list no `netbird-server`.
3. **Acknowledge in config**, so Pulumi's view matches the record. In `stacks/netbird-edge/Pulumi.netbird-edge.yaml`
   set:

   ```yaml
   netbird-edge:primary: azure-cus
   ```

   Merge it. The `netbird-edge` Stack's run patches the record to the address it already has, and the
   "watchdog failed over" warning stops.

Stay on the standby as long as you need to. It is a full server: it backs up to Garage every 15 minutes, and its
relay was running all along.

## Fail back

Do it when the original primary is healthy again, at a quiet time: clients lose management for about a minute.

1. **Back up the active host now**, so the snapshot the primary restores is seconds old, not up to 15 minutes:

   ```bash
   ssh root@netbird-azure-cus.<tailnet> systemctl start netbird-backup.service
   ssh root@netbird-azure-cus.<tailnet> journalctl -u netbird-backup -n 5   # ends in "netbird-backup: ok"
   ```

2. **Check the primary will restore, not resume.** Its store must be empty, which its fence made sure of when it
   was demoted:

   ```bash
   ssh root@netbird-azure-eus2.<tailnet> 'ls /opt/netbird/backup/demoted/; docker volume inspect -f "{{ .Mountpoint }}" netbird_netbird_data | xargs ls'
   ```

   `demoted/` should hold a recent directory and the volume no `store.db`. A rebuilt primary has an empty
   volume and needs nothing here. If `store.db` is there, the primary never got the demotion (for example its
   fence timer was stopped, as in a drill), so move it aside yourself before step 3: `mv <mountpoint>/*.db*
   /opt/netbird/backup/demoted/manual/`.
3. **Flip the lease with the config switch.** Set `netbird-edge:primary: azure-eus2` in
   `stacks/netbird-edge/Pulumi.netbird-edge.yaml` and merge it. The Stack run patches the record.

   The switch writes only when the value changes. If the failover was never acknowledged, `primary` still says
   `azure-eus2` and this merge changes nothing. Acknowledge first (set `azure-cus` and merge), then do this step.
4. **Watch the fences swap.** Within about a minute of the run:
   - the standby's fence logs `demote (other)` and archives its store;
   - the primary's fence logs the restore (`netbird-restore: restored <snapshot>`) and then `start (mine)`.

   ```bash
   ssh root@netbird-azure-eus2.<tailnet> journalctl -u netbird-fence -f
   ```

5. **Check** that `https://netbird.<root domain>` logs in and a client reconnects. The snapshot the primary
   restored is the one from step 1.

Don't flip the record by hand in Cloudflare. If you do, Pulumi won't put it back, but `primary` no longer says where
the lease is, and the next config change acts on a stale assumption.

## acme.json on promotion

Decided for #3001, resolving the open question from #3033: **a promotion takes the snapshot's `acme.json`**
(`NETBIRD_RESTORE_ACME=replace` in `netbird-restore.sh`, set by the fence). The lease holder has been renewing
that certificate. Taking it means the new holder serves a valid certificate at once, keeps the same ACME account,
and asks Let's Encrypt for nothing (5 duplicate certificates a week per name). A demotion archives the host's own
copy, so the two hosts never diverge on it. The relay's certificate is separate (`relay-acme.json`, its own
resolver) and never leaves its host.

## When things go wrong

- **`NetbirdFailoverBlocked`.** Management has been down for 5 checks and the watchdog won't flip. The alert's
  reason says why:
  - "no standby answers on 443": the standby is down too, or Equestria's internet is.
  - "cooldown": it flipped less than an hour ago.
  - "never answered": the server hasn't come up once since the watchdog's state began (a first deploy, or
    someone deleted `netbird-failover-watchdog-state`).

  To promote by hand, use the config switch as in "Fail back", step 3, with the host you want.
- **Both fences stopped (`stop (unknown)`).** Neither host can reach DNS. Management comes back by itself once
  one of them can.
- **`restore failed; management stays stopped`.** The new holder can't read Garage over the tailnet. Check its
  Tailscale (`tailscale status`) and the `netbird-edge-backups` grant. The fence retries every 15 s.
- **Clients still on the old host after a demotion.** Its fence log should show `restarted traefik to drop the
  demoted management's clients` right after `demote (other)`. If it doesn't, restart Traefik there yourself
  (`docker restart netbird-traefik`), then check the fence script on that host is the current one.

- **`NetbirdFailoverWatchdogNotRunning`.** Read the last failed Job's log in `netbird-system`. While it's broken,
  nothing fails over automatically.

## Rebuilding a host

As done in the #2892 drill, with the host demoted (the lease elsewhere):

1. **Delete the host's old tailnet device** first, so the rebuilt VM can take its name. Toolport's Tailscale tool
   needs the admin risk level for this, so use the Tailscale OAuth client (admin console or API) instead.
2. **Replace only the VM** from a local checkout of main: `pulumi up --replace
   '<...>EdgeVm$azure-native:compute:VirtualMachine::netbird-<host>-vm'` in `stacks/netbird-edge`. The public IP
   is protected and survives.
3. **Expect the deploy to wait.** A rebuilt VM takes about 2 minutes to join the tailnet. The first deploy step
   keeps dialling for 5 minutes (`VM_READY_WAIT_SECONDS`, `components/netbird/server.ts`) before it fails.
4. **Check it came up passive:** its fence logs `standby (other)`, `docker ps` lists no `netbird-server`, and its
   backup timer is off.

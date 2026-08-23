---
name: triage-alerts
description: "Triage active alerts from Alertmanager (equestria cluster) and failing endpoints from Gatus (uptime.driscoll.tech). Fetches live data, identifies root causes, and proposes remediation steps."
---

# Triage Alerts

Fetch live data from AlertManager and the Gatus uptime instance, then identify root causes and propose remediation for any failures.

## Data Sources

| Source | Access Method | URL |
|---|---|---|
| Gatus | Direct HTTPS | `https://uptime.driscoll.tech/api/v1/endpoints/statuses` |
| AlertManager | Direct HTTPS | `https://alertmanager.driscoll.tech/api/v2/alerts` |
| AlertManager silences | Direct HTTPS | `https://alertmanager.driscoll.tech/api/v2/silences` |

> AlertManager runs in the equestria cluster (`observability` namespace), the estate's only
> Kubernetes cluster. Service name: `alertmanager-alertmanager`, port **9093**. If the
> ingress is unavailable, port-forward instead:
> ```bash
> kubectl port-forward -n observability svc/alertmanager-alertmanager 9093:9093 &
> # then use http://localhost:9093/api/v2/...
> ```

## Process

### Step 1 — Fetch Gatus endpoint statuses

```bash
curl -s https://uptime.driscoll.tech/api/v1/endpoints/statuses | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
failing = [e for e in data if not e['results'][-1]['success']]
print(f'Total: {len(data)}, Failing: {len(failing)}')
for e in failing:
    r = e['results'][-1]
    print(f\"  FAIL  {e['group']}/{e['name']} — {r.get('errors', ['no detail'])}\")"
```

Parse the response to produce a concise list: `GROUP/NAME — error detail`.

### Step 2 — Fetch AlertManager active alerts

```bash
curl -s https://alertmanager.driscoll.tech/api/v2/alerts | \
  python3 -c "
import json, sys
alerts = json.load(sys.stdin)
active = [a for a in alerts if a['status']['state'] == 'active']
print(f'{len(active)} active alerts')
SEV_ORDER = {'critical': 0, 'error': 1, 'warning': 2, 'none': 3}
for a in sorted(active, key=lambda x: (SEV_ORDER.get(x['labels'].get('severity','none'), 9), x['labels'].get('namespace',''))):
    labels = a['labels']
    ann = a['annotations']
    print(f\"  [{labels.get('severity','?')}] {labels.get('namespace','-')} | {labels.get('alertname')} — {ann.get('summary', ann.get('description',''))}\")
"
```

**Check silences** (to understand what is intentionally muted):
```bash
curl -s https://alertmanager.driscoll.tech/api/v2/silences | \
  python3 -c "
import json, sys
silences = [s for s in json.load(sys.stdin) if s['status']['state'] == 'active']
print(f'{len(silences)} active silences')
for s in silences:
    matchers = ', '.join(f\"{m['name']}={m['value']}\" for m in s['matchers'])
    print(f\"  {s['id'][:8]} expires={s['endsAt'][:16]}  {matchers}  — {s['comment']}\")
"
```

### Step 3 — Identify patterns

Group alerts and failures into root-cause buckets:

| Pattern | Likely Root Cause |
|---|---|
| Many apps returning 503/500 | Traefik or Authentik ForwardAuth outpost down |
| DNS resolution failures across apps | adguard-dns pod down / webhook port mismatch |
| `KubeDeploymentRolloutStuck` + replicas mismatch | New ReplicaSet CrashLooping while old stays alive |
| `KubePodCrashLooping` on database pods | CNPG postgres WAL corruption or missing PVC |
| `CreateContainerConfigError` on any pod | Required Secret/ConfigMap deleted or not synced |
| ExternalSecret `SecretSyncError` | OpenBao or 1Password Connect unavailable, or the item was renamed |
| `HelmRelease` stuck `RollbackFailed` | Use status patch to break the loop (see below) |

Some Gatus endpoints cover the Dockge hosts (celestia, luna, skystar, alpha-site) rather
than Kubernetes. Those will never have a matching AlertManager alert — check the host over
Tailscale SSH and the relevant `docker/<host>/` compose stack instead of a namespace.

### Step 4 — Check cluster state for implicated namespaces

This repo does not carry a kubeconfig and nothing here pins `KUBECONFIG` — commands follow
the ambient kubeconfig and context. Confirm you are pointed at equestria first:

```bash
kubectl config current-context   # expect admin@equestria

# HelmRelease health in namespace
kubectl get helmrelease -n <namespace> -o wide

# Kustomization health
kubectl get kustomization -n <namespace>

# Pod state
kubectl get pods -n <namespace>

# Events (last 20, sorted)
kubectl get events -n <namespace> --sort-by='.lastTimestamp' | tail -20
```

### Step 5 — Common remediation patterns

**Break a stuck HelmRelease (`RollbackFailed` / `MissingRollbackTarget`):**
```bash
kubectl patch helmrelease <name> -n <namespace> \
  --type=json \
  -p '[{"op":"remove","path":"/status/conditions"},{"op":"remove","path":"/status/failures"}]' \
  --subresource=status
```

**Force ExternalSecret re-sync (e.g., after a cleanup deleted the secret):**
```bash
kubectl annotate externalsecret <name> -n <namespace> \
  force-sync="$(date +%s)" --overwrite
```

**Force a Flux kustomization reconcile:**
```bash
kubectl annotate kustomization <name> -n <namespace> \
  reconcile.fluxcd.io/requestedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --overwrite
```

**Restart a crashing deployment after root cause is fixed:**
```bash
kubectl rollout restart deployment/<name> -n <namespace>
```

**Delete a CrashLooping pod so it reschedules cleanly:**
```bash
kubectl delete pod -n <namespace> <pod-name>
```

### Step 6 — Verify recovery

After applying fixes, poll Gatus until failures clear:
```bash
watch -n 15 'curl -s https://uptime.driscoll.tech/api/v1/endpoints/statuses | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
failing = [e for e in data if not e[\"results\"][-1][\"success\"]]
print(f\"Failing: {len(failing)}\")
for e in failing: print(f\"  {e[\"group\"]}/{e[\"name\"]}\")
"'
```

## Output Format

Produce a triage report in this structure. Sort alerts flat by severity (critical → error → warning), then namespace:

```
## Triage Report — <timestamp>

### Gatus: X failing / Y total  (https://uptime.driscoll.tech)
- [group] NAME — HTTP <status> / error detail
  (sorted by severity: failing → degraded → healthy)

### AlertManager: X active / Y silenced
- [critical] namespace | AlertName — summary
- [error]    namespace | AlertName — summary
- [warning]  namespace | AlertName — summary

### Root Cause Analysis
1. <Primary root cause> → <affected components>
2. <Secondary root cause> → <affected components>

### Remediation Plan
- [ ] Step 1 — specific command or action
- [ ] Step 2 — ...

### Verification
- Poll https://uptime.driscoll.tech until failing count reaches 0
```

## Key Gotchas

- **Alertmanager route matchers are ANDed within a route**: `severity=error` AND `severity=critical` in the same route matcher never match simultaneously — use separate routes or `=~` regex.
- **adguard-dns webhook port**: chart hardcodes `--webhook-provider-url=http://localhost:8888`; sidecar default is 8080. Fix: `SERVER_PORT: "8888"` env var on the sidecar AND set liveness/readiness probes to port 8888.
- **Authentik outpost depends on DNS**: If adguard-dns is down, `canterlot.driscoll.tech` won't resolve → outpost loops → all ForwardAuth-protected apps return 500.
- **Cleanup tasks delete secrets too**: `mise run k8s:cleanup-pods` and friends remove resources including ExternalSecrets and their synced Secrets. Force re-sync after cleanup.
- **CNPG WAL corruption**: When a postgres pod shows `pg_rewind` failure with `invalid record length`, CNPG auto-provisions a replacement pod. Delete the stuck pod; CNPG cleans the PVC automatically.

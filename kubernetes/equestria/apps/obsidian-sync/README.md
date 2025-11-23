# Obsidian Sync - Self-Hosted

This directory contains the Kubernetes manifests for deploying a self-hosted Obsidian LiveSync server using CouchDB on the equestria cluster.

## Features

- **CouchDB-based sync** using obsidian-livesync
- **Volsync backups** with daily snapshots
- **Tailscale integration** for secure remote access
- **CORS middleware** for proper CouchDB functionality
- **Gateway API** with HTTPRoute using internal gateway
- **Authentik integration** for SSO authentication
- **Uptime monitoring** with Gatus
- **Post-install hook** for initial database setup

## Components

### Core Application
- **HelmRelease**: Uses bjw-s app-template (v3.5.1)
- **Container**: ghcr.io/vrtmrz/obsidian-livesync
- **Tailscale Sidecar**: For secure VPN access

### Storage & Backup
- **PVC**: 5Gi persistent volume for CouchDB data
- **Volsync**: Daily backups at 2 AM with 7-day/4-week/6-month retention

### Networking
- **HTTPRoute**: Gateway API route on internal gateway
- **CORS Middleware**: Traefik middleware for CouchDB compatibility
- **Service**: ClusterIP on port 5984

### Security
- **ExternalSecrets**: Secrets managed via OnePassword Connect
  - CouchDB credentials
  - Tailscale auth key
  - Restic backup credentials

### Initialization
- **Post-install Job**: Creates initial CouchDB databases
  - `_users`
  - `_replicator`
  - `_global_changes`

## Prerequisites

Before deploying, ensure:

1. **OnePassword Items** exist with the following keys:
   - `obsidian-sync`: Contains `couchdbUser` and `couchdbPassword`
   - `tailscale-auth-keys`: Contains `tailscaleAuthKey` 
   - `volsync-restic-config`: Contains Restic repository credentials

2. **Storage Class** `ceph-block` is available

3. **VolumeSnapshotClass** `csi-ceph-blockpool` is available

4. **Gateway** `internal` exists in `network` namespace

5. **ClusterSecretStore** `onepassword-connect` is configured

## Configuration

### Domain Names
Replace the following placeholder domains with your actual domains:
- `obsidian.internal.example.com` in:
  - `httproute.yaml`
  - `applicationdefinition.yaml`

### CORS Security ✅
The deployment is pre-configured with secure CORS settings for Obsidian apps:

**ConfigMap** (`configmap.yaml`):
```ini
origins = https://app.obsidian.md, app://obsidian.md, capacitor://localhost, http://localhost
```

**Traefik Middleware** (`httproute.yaml`):
- `https://app.obsidian.md` (web app)
- `app://obsidian.md` (desktop app)
- `capacitor://localhost` (mobile app)
- `http://localhost` (local development)

These origins cover all official Obsidian clients. If you need to add custom origins (e.g., for a custom domain or additional apps), update both the ConfigMap and Middleware.

### Access Control
Customize the Authentik access policy in `applicationdefinition.yaml`:
```yaml
access_policy:
  groups:
    - users
    - admins
```

### Backup Schedule
Modify the Volsync schedule in `volsync.yaml`:
```yaml
trigger:
  schedule: "0 2 * * *"  # Daily at 2 AM
```

### Container Versions
The deployment uses pinned container versions for stability:
- **obsidian-livesync**: v0.23.18
- **tailscale**: v1.76.6

Update these versions in `helmrelease.yaml` as needed.

## Deployment

This application is deployed via Flux CD:

```bash
# Apply the kustomization
kubectl apply -k .

# Or commit to your GitOps repository and let Flux sync
```

## Post-Deployment

1. Verify the pod is running:
   ```bash
   kubectl -n obsidian-sync get pods
   ```

2. Check the post-install job completed:
   ```bash
   kubectl -n obsidian-sync get jobs
   ```

3. Verify CouchDB is accessible:
   ```bash
   kubectl -n obsidian-sync port-forward svc/obsidian-sync 5984:5984
   curl http://localhost:5984/_up
   ```

4. Configure Obsidian LiveSync plugin:
   - Install the "Self-hosted LiveSync" plugin in Obsidian
   - Set sync server: `https://obsidian.internal.example.com`
   - Enter CouchDB credentials from OnePassword
   - Create or join a sync database

## Troubleshooting

### CouchDB not starting
Check logs:
```bash
kubectl -n obsidian-sync logs -l app.kubernetes.io/name=obsidian-sync -c app
```

### CORS issues
Verify the CORS configuration is mounted:
```bash
kubectl -n obsidian-sync exec -it deployment/obsidian-sync -- cat /opt/couchdb/etc/local.d/cors.ini
```

### Tailscale connection issues
Check Tailscale sidecar:
```bash
kubectl -n obsidian-sync logs -l app.kubernetes.io/name=obsidian-sync -c tailscale
```

### Backup failures
Check Volsync status:
```bash
kubectl -n obsidian-sync get replicationsource obsidian-sync-data -o yaml
```

## Integration with Pulumi

The `applicationdefinition.yaml` defines monitoring and authentication integration that will be automatically picked up by the Pulumi `applications` stack. This creates:

- Authentik proxy provider for SSO
- Gatus monitoring endpoints
- Uptime Kuma checks

## References

- [Obsidian LiveSync](https://github.com/vrtmrz/obsidian-livesync)
- [CouchDB CORS Configuration](https://docs.couchdb.org/en/stable/config/http.html#cors)
- [bjw-s app-template](https://github.com/bjw-s/helm-charts/tree/main/charts/other/app-template)

# qBittorrent

qBittorrent is a cross-platform free and open-source BitTorrent client.

## Configuration

This installation uses:
- **Chart**: bjw-s/app-template v4.5.0
- **Image**: ghcr.io/onedr0p/qbittorrent:5.0.2
- **Namespace**: equestria
- **Ingress**: qbittorrent.equestria.driscoll.dev
- **LoadBalancer IP**: 192.168.42.220 (for BitTorrent traffic)

### Storage

- **Config**: 1Gi PVC (local-path storage class) - qbittorrent-config
- **Media**: Existing PVC - truenas-media (mounted at /media)

### Network

- **Web UI Port**: 8080
- **BitTorrent Port**: 50413 (TCP & UDP)
- **LoadBalancer**: Uses Cilium LB-IPAM with dedicated IP

### Security

- Runs as user/group 568
- Non-root container
- Read-only root filesystem
- Dropped all capabilities

## Deployment

Apply the manifests using Flux or kubectl:

```bash
# Using kubectl with kustomize
kubectl apply -k kubernetes/apps/equestria/downloads/qbittorrent

# Or let Flux reconcile
flux reconcile kustomization apps --with-source
```

## Access

Once deployed, access the web UI at: https://qbittorrent.equestria.driscoll.dev

Default credentials:
- Username: `admin`
- Password: `adminadmin`

**Important**: Change the default password immediately after first login.

## Configuration Notes

You may want to adjust:
1. **LoadBalancer IP**: Change `192.168.42.220` to an available IP in your network
2. **Ingress host**: Update the hostname to match your domain
3. **Storage class**: Change `local-path` to your preferred storage class for config PVC
4. **Timezone**: Update `TZ` environment variable
5. **Resource limits**: Adjust based on your usage patterns
6. **Download path**: Configure qBittorrent to save downloads under /media/downloads

## References

- [qBittorrent GitHub](https://github.com/qbittorrent/qBittorrent/)
- [bjw-s app-template](https://github.com/bjw-s/helm-charts/tree/main/charts/other/app-template)
- [onedr0p container image](https://github.com/onedr0p/containers/tree/main/apps/qbittorrent)

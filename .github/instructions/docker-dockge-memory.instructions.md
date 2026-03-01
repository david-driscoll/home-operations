---
description: "Patterns and gotchas for Docker Compose services and DockgeLxc variable substitution in the homelab setup"
applyTo: "docker/**"
---

# Docker / Dockge Memory

Homelab Docker Compose patterns, DockgeLxc variable scoping, and Traefik routing conventions.

## DockgeLxc Variable Scoping: `${CLUSTER_DOMAIN}` vs `${searchDomain}`

Use `${CLUSTER_DOMAIN}` for service URLs when the hostname must be unique per-cluster (all three hosts share the same domain but different subdomains). Use `${searchDomain}` only for truly host-global domains that are the same across all clusters.

| Variable            | Scope         | Example value            |
| ------------------- | ------------- | ------------------------ |
| `${searchDomain}`   | Host / global | `driscoll.tech`          |
| `${CLUSTER_DOMAIN}` | Per cluster   | `celestia.driscoll.tech` |

Traefik router rule and `x-dockge.urls` should use `${APP}.${CLUSTER_DOMAIN}` so the URL is distinct per cluster:

```yaml
traefik.http.routers.myapp.rule: Host(`${APP}.${CLUSTER_DOMAIN}`)
x-dockge:
  urls:
    - https://${APP}.${CLUSTER_DOMAIN}
```

## Traefik DoH Routing

Route DNS over HTTPS (`/dns-query`) to the application's HTTP admin port (e.g., 5380), not port 443. Traefik handles TLS termination and proxies plain HTTP to the app.

```yaml
traefik.http.routers.myapp-doh.rule: Host(`${APP}.${CLUSTER_DOMAIN}`) && Path(`/dns-query`)
traefik.http.routers.myapp-doh.entrypoints: websecure
traefik.http.routers.myapp-doh.tls.certresolver: le
traefik.http.routers.myapp-doh.service: myapp-doh
traefik.http.services.myapp-doh.loadbalancer.server.port: 5380
```

## Host Networking (Luna) Pattern

Services on `luna` use `network_mode: host` — no Traefik labels. Access is direct by IP. DoH and admin endpoints go in `x-dockge.urls` as direct IP references:

```yaml
x-dockge:
  urls:
    - http://${ipAddress}:5380
    - https://${ipAddress}:53443
    - https://${ipAddress}:53443/dns-query
```

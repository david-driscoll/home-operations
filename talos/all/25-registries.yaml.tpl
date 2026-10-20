# Registry mirrors, one RegistryMirrorConfig document per upstream registry
# (Talos 1.14; was `.machine.registries.mirrors`). The zot endpoints are under
# the root domain, which the repo never writes: it comes from the environment
# (mise exports ROOT_DOMAIN from .config/domains.sops.yaml) and this template
# refuses to render without it.
#
# `overridePath: true` is set on EVERY endpoint here and is why each upstream
# endpoint carries an explicit `/v2`. With it, containerd uses the endpoint URL
# exactly as written and appends only the repository path; without it, it
# appends `/v2` itself.
#
# Under v1alpha1 this was a MIRROR-wide flag -- `endpoints` was a list of
# strings, and Talos rejected a list of objects ("cannot construct !!map into
# string") -- so every endpoint of a mirror had to share it. In
# RegistryMirrorConfig it is per endpoint. The bare upstream fallbacks could
# now drop both `overridePath` and their `/v2`; they are kept as they were so
# the move changes nothing containerd sees.
#
# ENDPOINT 1 IS AN INGRESS HOSTNAME, NOT THE CLUSTER SERVICE, and that is
# not a style choice. containerd runs on the HOST, whose resolvers are the ones
# in ./22-resolver.yaml (Technitium 10.10.10.9, the gateway, then Quad9) — no
# cluster DNS. So `registry.kube-system.svc.cluster.local` never resolved and
# this endpoint was dead. It went unnoticed because spegel had replaced the
# whole file (see the spegel values) so nothing ever tried it. Measured once it
# was live: a 2.8 MB `alpine:3.16.9` pull took 2m32s walking dead endpoints
# before reaching upstream, and zot logged nothing.
#
# `registry.equestria.<root domain>` resolves through Technitium (10.10.10.9,
# first in the host's list) to the traefik LB on the LAN. Both survive a
# low-power window — Technitium runs on the control planes and traefik is
# Tier 1.
#
# Endpoint 2, `registry.<root domain>`, is CELESTIA's zot, not a second name
# for this one. Verified: it serves the same `/v2/<registry>/<repo>` layout
# and returns 200 for the same manifest. Kept deliberately as a cross-cluster
# fallback — a second cache on a battery-backed host.
#
# zot proxies each upstream under its own prefix (`/v2/<registry>/<repo>`),
# which only resolves with `overridePath: true`. That same flag then means
# a bare `https://index.docker.io` fallback is requested WITHOUT `/v2` —
# which is not a registry API. Verified 2026-08-21:
#
#   https://index.docker.io/v2/library/busybox/manifests/latest  -> 401 (auth challenge, correct)
#   https://index.docker.io/library/busybox/manifests/latest     -> 301 (redirect to a web page)
#
# So a mirror with `overridePath` and a bare upstream endpoint has a
# fallback that cannot work, and a mirror without it has a zot endpoint
# that cannot work (`…/v2/<registry>/v2/<repo>`). This file had four of the
# first and three of the second. All are now consistent: cache first,
# then the same cache via its ingress, then upstream — each with `/v2`.
{{- $rootDomain := env "ROOT_DOMAIN" }}
{{- if not $rootDomain }}{{ fail "ROOT_DOMAIN is unset -- mise exports it from .config/domains.sops.yaml, which needs the age key" }}{{ end }}
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: docker.io
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/docker.io
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/docker.io
    overridePath: true
  - url: https://index.docker.io/v2
    overridePath: true
  - url: https://registry-1.docker.io/v2
    overridePath: true
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: gcr.io
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/gcr.io
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/gcr.io
    overridePath: true
  - url: https://gcr.io/v2
    overridePath: true
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: quay.io
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/quay.io
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/quay.io
    overridePath: true
  - url: https://quay.io/v2
    overridePath: true
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: ghcr.io
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/ghcr.io
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/ghcr.io
    overridePath: true
  - url: https://ghcr.io/v2
    overridePath: true
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: registry.k8s.io
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/registry.k8s.io
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/registry.k8s.io
    overridePath: true
  # 307s to a regional mirror, which containerd follows.
  - url: https://registry.k8s.io/v2
    overridePath: true
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: public.ecr.aws
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/public.ecr.aws
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/public.ecr.aws
    overridePath: true
  - url: https://public.ecr.aws/v2
    overridePath: true
---
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: cgr.dev
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/cgr.dev
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/cgr.dev
    overridePath: true
  - url: https://cgr.dev/v2
    overridePath: true
---
# zot synced this one already; the nodes simply never asked it.
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: mcr.microsoft.com
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/mcr.microsoft.com
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/mcr.microsoft.com
    overridePath: true
  - url: https://mcr.microsoft.com/v2
    overridePath: true
---
# The Forgejo project's own registry: the forge, its runner and the dind
# image the runner pods use (kubernetes/apps/coder). data.forgejo.org
# serves /v2/ anonymously, so zot syncs it with no credentials.
apiVersion: v1alpha1
kind: RegistryMirrorConfig
name: data.forgejo.org
endpoints:
  - url: https://registry.equestria.{{ $rootDomain }}/v2/data.forgejo.org
    overridePath: true
  - url: https://registry.{{ $rootDomain }}/v2/data.forgejo.org
    overridePath: true
  - url: https://data.forgejo.org/v2
    overridePath: true

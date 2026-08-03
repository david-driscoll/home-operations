---
id: 855951c6-f93f-4948-a6bf-9ffc5066dacb
class: LOCAL
loadGuidance: [ON-DEMAND]
title: "Docker-in-container on equestria: Sysbox unavailable on Talos, Kata is the path"
author: "link"
createdAt: 2026-08-03T17:49:52.605Z
metadata: {}
---

Verified 2026-08-03 for vault#116 (Coder workspaces), but applies to ANY workload wanting a
container runtime inside a pod on equestria.

equestria nodes: fluttershy, hard-hat, kerfuffle, shining-armor — all Talos Linux v1.13.7,
containerd 2.2.6, kernel 6.18.39-talos. `kubectl get runtimeclass` => only `amd`, `nvidia`.

Key finding: **Sysbox is NOT an official Talos system extension.** The siderolabs/extensions
`container-runtime` catalog is: crun, ecr-credential-provider, gvisor, gvisor-debug,
harbor-credential-provider, kata-containers, kata-containers-snp, soci-snapshotter, spin,
stargz-snapshotter, wasmedge, youki. Talos is immutable, so Sysbox would need a custom extension
built and maintained.

This kills the two Sysbox-based options in Coder's docker-in-workspaces docs (Sysbox runtime,
Envbox — Envbox needs Sysbox-compatible nodes AND a privileged outer container), and the
systemd-in-Docker variant.

Therefore: running Docker inside a pod here means PodSecurity **`privileged`**, not `baseline`.
The common claim that "Docker in workspaces flips restricted -> baseline" is wrong on this cluster.
Coder's own docs on the privileged-sidecar approach: "This is insecure. Workspaces will be able to
gain root access to the host machine."

Compensating control that IS available: `siderolabs/kata-containers` is an official Talos extension.
Kata gives each pod a microVM with its own kernel, so a privileged DinD sidecar escapes into the VM
rather than the host. Cost:
- Schematic change in equestria-cluster/talos/talconfig.yaml under
  `schematic.customization.systemExtensions.officialExtensions`
  (currently iscsi-tools, qemu-guest-agent, amdgpu) -> new Talos image -> rolling node upgrade.
  Expect the known tuppr/Longhorn instance-manager PDB drain block on that upgrade.
- UNVERIFIED PREREQUISITE: nested virtualisation. The nodes are Proxmox VMs (bc:24:11 MAC OUI +
  qemu-guest-agent extension). Kata needs KVM inside them; if nested virt is off on the Proxmox
  hosts, Kata will not start.

Escape hatch worth knowing: for dev-container use cases specifically, Coder's Envbuilder builds the
devcontainer.json into the workspace image itself, needs no Docker daemon, and keeps PSA
`restricted`. It does not provide a `docker` CLI inside the workspace.

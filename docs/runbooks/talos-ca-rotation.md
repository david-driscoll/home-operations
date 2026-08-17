# Rotating the Talos API CA

Invalidating a leaked `talosconfig`. Written 2026-08-17, against Talos **v1.13.8**
(`talos/talenv.yaml`) and a **talhelper**-managed cluster.

> **This is the only way to revoke a Talos client certificate.** Talos has no CRL. Issuing a
> replacement admin cert does not invalidate the old one — both stay valid until expiry. Rotating
> the CA is what makes previously issued client certificates stop working, and the upstream docs
> say so explicitly: *"Previously issued client certificates become invalid once the old CA is
> removed."*

## When you need this

- A `talosconfig` leaked. This is what happened on 2026-08-17: `talos/talosconfig`, carrying an
  `os:admin` client certificate and its unencrypted ED25519 private key, was committed to a
  **public** repo (#892 untracked it). The certificate was valid until 2027-03-09 and grants full
  machine-API control — config read/write, reboot, shutdown, reset, machine secrets.
- You suspect the CA private key itself is compromised. (In the 2026-08-17 case it was not —
  `talsecret.sops.yaml` is properly sops-encrypted.)

Otherwise you do not need this. Talos root CAs have a 10-year lifetime and everything else is
issued beneath them.

## The trap this estate has that the upstream docs do not cover

**`talosctl rotate-ca` does not update your secrets file.** It generates a *fresh* secrets bundle
internally and has no way to accept an existing one — that is
[siderolabs/talos#12816](https://github.com/siderolabs/talos/issues/12816), proposed as
`--with-secrets` and **not implemented**.

This cluster is talhelper-managed: `talos/talsecret.sops.yaml` holds `certs.os.crt` / `certs.os.key`,
and `talhelper genconfig` renders machine configs from it. So after a rotation the file still holds
the **old** CA, and the next `genconfig` + `apply-config` pushes the old CA back — undoing the
rotation, or leaving nodes in a split trust state.

**Therefore: updating `talsecret.sops.yaml` is a required step, not cleanup.** Do it before any
`genconfig` runs.

## Before you start

- [ ] **You can afford to be wrong.** Have console/IPMI access to at least one control plane, or be
      physically able to reach the machines. Getting this wrong locks you out of the machine API.
- [ ] **Record every `talosconfig` holder.** Each needs the new file afterwards: your workstation,
      any CI, the Pulumi operator if it ever gains Talos access, and any other person. Anyone you
      miss loses access at the final step.
- [ ] **Capture the command output.** It contains the new CA certificate *and key*. Run it where
      you can scroll back, and treat the transcript as secret material.
- [ ] **etcd is healthy and every node is Ready.** Rotation patches machine config on all of them.
- [ ] **Take a fresh `talsecret.sops.yaml` backup** — copy it somewhere outside the repo. If the
      rotation half-lands you will want the old CA to talk to nodes that have not moved yet.

## Procedure

Run `mise run talos:rotate-ca <control-plane-ip>` for the guarded version — it does the dry run
first and refuses to proceed without an explicit typed confirmation. The underlying steps:

**1. Dry run. Always.**

```sh
talosctl -n <CONTROLPLANE> rotate-ca --dry-run=true --talos=true --kubernetes=false
```

Nothing changes. Read the plan it prints. `--kubernetes=false` is deliberate: a leaked
*talosconfig* is a Talos-API credential, and the Kubernetes CA is a separate rotation with its own
blast radius. Only add `--kubernetes=true` if a *kubeconfig* leaked too.

**2. Execute.**

```sh
talosctl -n <CONTROLPLANE> rotate-ca --dry-run=false --talos=true --kubernetes=false
```

Internally this is a two-phase trust rollover via `.machine.acceptedCAs`: the new CA is added to
the accepted set on every node first, then becomes the issuer, then the old CA is removed. Both are
briefly valid, which is what keeps the cluster reachable mid-rotation.

**3. Merge the new client config.**

`rotate-ca` writes a new `talosconfig` into the current directory.

```sh
talosctl config merge ./talosconfig
```

Then **delete the copy in the working directory** — `talos/talosconfig` is gitignored now, but a
stray copy elsewhere is how this started.

**4. Update `talsecret.sops.yaml` — the step upstream does not tell you about.**

Take the new CA cert and key from the step-2 output and write them into `certs.os.crt` and
`certs.os.key`, keeping the file sops-encrypted. Use `sops` to edit in place; never decrypt to a
plaintext intermediate on disk.

**5. Verify before regenerating anything.**

```sh
talosctl -n <CONTROLPLANE> version          # new client cert works
talosctl -n <CONTROLPLANE> get machineconfig -o yaml | grep -A3 acceptedCAs
```

Then confirm the loop is closed — `talhelper genconfig` should produce configs whose CA matches
what the nodes now run. If it does not, step 4 did not take, and applying would revert the
rotation.

**6. Confirm the leaked credential is dead.**

Keep the old `talosconfig` somewhere safe until this point, then:

```sh
talosctl --talosconfig ./old-talosconfig -n <CONTROLPLANE> version   # MUST fail
```

A rotation you have not proven rejects the old certificate has not remediated anything. This is the
gate — not step 2 completing.

## Afterwards

- Distribute the new `talosconfig` to everyone recorded in the pre-flight.
- The leaked blob stays retrievable from public git history by SHA. That is now harmless — the
  certificate it contains no longer authenticates — but do not treat history rewriting as the fix
  and skip rotation.
- Note in [22 — decommission SGC](../cluster-consolidation/22-decommission-sgc.md) if SGC's nodes
  are still in the picture: they run their own CA and are being wiped, so they do not need this.

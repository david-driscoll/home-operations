# The system disk, as an UnattendedInstallConfig (Talos 1.14; the deprecated
# `.machine.install` this used to be is mutually exclusive with it).
#
# TOPF injects this document itself, AHEAD of every patch: the installer image
# (factory.talos.dev/metal-installer/<schematic>:<talosVersion>, from the node's
# `schematicId` and topf.yaml's `talosVersion`), `wipe: false`, and a default
# selector of `disk.dev_path == "/dev/sda"`. This patch only replaces the
# selector with the node's `installDisk` from topf.yaml. Do not restate the
# image here: TOPF reads it back out of the rendered config to decide what
# `topf upgrade` would install.
#
# Install config is only read when Talos installs or upgrades. Changing it on a
# running node does nothing until then -- and tuppr's TalosUpgrade resolves the
# installer from the node's RUNNING schematic, not from this.
apiVersion: v1alpha1
kind: UnattendedInstallConfig
provisioning:
  diskSelector:
    match: {{ .Node.Data.installDisk | squote }}

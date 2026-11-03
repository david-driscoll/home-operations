import { all, type Input, type Output } from "@pulumi/pulumi";

/** Public ports the NetBird server needs (docs/plans/netbird-mirror.md §D). No 22: admin is over Tailscale. */
export const PUBLIC_TCP_PORTS = [80, 443] as const;
export const PUBLIC_UDP_PORTS = [443, 3478] as const;

/**
 * Resident memory held so OCI's idle reclamation never fires. An Always Free
 * instance is reclaimed when CPU, network AND memory all sit under 20% (7-day
 * p95); 3 GiB of 12 is 25%. The bytes are written, not just reserved, so they
 * count as used memory rather than lazily-mapped zero pages.
 */
export const BALLAST_GIB = 3;

/**
 * Where the VM runs. Only OCI needs the two workarounds: its Ubuntu image
 * rejects inbound traffic in iptables whatever the NSG allows, and its Always
 * Free tier reclaims idle instances. Azure's image has an empty INPUT chain
 * (the NSG is the only filter) and a paid VM is never reclaimed.
 */
export type EdgePlatform = "oci" | "azure";

export interface CloudInitArgs {
  platform: EdgePlatform;
  hostname: string;
  tailscaleAuthKey: Input<string>;
  tailscaleTag: string;
  /**
   * `HH:MM` UTC for unattended-upgrades' reboot. Default 09:00 (4-5am US
   * Eastern). Give each NetBird host its own, so the primary and its standby
   * are never down for a kernel update at the same time.
   */
  rebootTime?: string;
}

export const DEFAULT_REBOOT_TIME = "09:00";

/** `renderCloudInit`'s input: everything resolved. */
export type RenderCloudInitArgs = Omit<CloudInitArgs, "tailscaleAuthKey"> & { tailscaleAuthKey: string };

/**
 * Day-0 cloud-init for a netbird-edge VM. Neither OCI nor Azure applies a
 * user_data/customData change after launch (both are ignored on the instance),
 * so anything that must stay current is deployed over SSH by
 * components/netbird/NetbirdServer.ts, not here.
 */
export function netbirdEdgeCloudInit(args: CloudInitArgs): Output<string> {
  return all([args.tailscaleAuthKey]).apply(([tailscaleAuthKey]) => renderCloudInit({ ...args, tailscaleAuthKey }));
}

/** Pure, so `node --test` covers both variants. */
export function renderCloudInit(args: RenderCloudInitArgs): string {
  const rebootTime = args.rebootTime ?? DEFAULT_REBOOT_TIME;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rebootTime)) throw new Error(`rebootTime '${rebootTime}' is not HH:MM`);
  const oci = args.platform === "oci";
  const tcp = PUBLIC_TCP_PORTS.join(",");
  const udp = PUBLIC_UDP_PORTS.join(",");

  const ballastUnit = `  - path: /etc/systemd/system/memory-ballast.service
    content: |
      [Unit]
      Description=Hold ${BALLAST_GIB} GiB resident so OCI idle reclamation never fires
      [Service]
      ExecStart=/usr/bin/python3 -c "import time; b = bytearray(b'1') * (${BALLAST_GIB} * 1024**3); time.sleep(10**9)"
      Restart=always
      [Install]
      WantedBy=multi-user.target
`;
  const ociRuncmd = `  # OCI's Ubuntu image ends INPUT with a REJECT that applies even when the NSG
  # allows the traffic. Insert ACCEPT rules above it -- never flush: that also drops
  # OCI's InstanceServices rules guarding the metadata service. Saved before
  # Docker exists so its chains are not persisted.
  - |
    set -eu
    pos=$(iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    iptables -I INPUT "$pos" -p tcp -m multiport --dports ${tcp} -m state --state NEW -j ACCEPT
    iptables -I INPUT "$pos" -p udp -m multiport --dports ${udp} -j ACCEPT
    netfilter-persistent save
  - systemctl daemon-reload
  - systemctl enable --now memory-ballast.service
`;

  return `#cloud-config
hostname: ${args.hostname}
package_update: true
package_upgrade: true
packages:
  - unattended-upgrades
  - ca-certificates
  - curl
  # dig, which the standby's DNS-lease fence (#3001) asks Cloudflare with.
  - bind9-dnsutils
write_files:
  - path: /etc/apt/apt.conf.d/52unattended-reboot
    content: |
      Unattended-Upgrade::Automatic-Reboot "true";
      // UTC.
      Unattended-Upgrade::Automatic-Reboot-Time "${rebootTime}";
${oci ? ballastUnit : ""}  - path: /run/tailscale-authkey
    permissions: "0600"
    content: ${args.tailscaleAuthKey}
runcmd:
${oci ? ociRuncmd : ""}  - curl -fsSL https://get.docker.com | sh
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --auth-key=file:/run/tailscale-authkey --hostname=${args.hostname} --advertise-tags=${args.tailscaleTag} --ssh --accept-routes=false --accept-dns=false
  - rm -f /run/tailscale-authkey
`;
}

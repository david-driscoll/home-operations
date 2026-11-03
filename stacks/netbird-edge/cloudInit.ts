import { type Input, interpolate, type Output } from "@pulumi/pulumi";

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

export interface CloudInitArgs {
  hostname: string;
  tailscaleAuthKey: Input<string>;
  tailscaleTag: string;
}

/**
 * Day-0 cloud-init for the netbird-edge VM. OCI cannot change user_data after
 * launch (the instance ignores later edits), so anything that must stay
 * current is deployed over SSH by later tickets, not here.
 */
export function netbirdEdgeCloudInit(args: CloudInitArgs): Output<string> {
  const tcp = PUBLIC_TCP_PORTS.join(",");
  const udp = PUBLIC_UDP_PORTS.join(",");
  return interpolate`#cloud-config
hostname: ${args.hostname}
package_update: true
package_upgrade: true
packages:
  - unattended-upgrades
  - ca-certificates
  - curl
write_files:
  - path: /etc/apt/apt.conf.d/52unattended-reboot
    content: |
      Unattended-Upgrade::Automatic-Reboot "true";
      // 09:00 UTC is 4-5am US Eastern.
      Unattended-Upgrade::Automatic-Reboot-Time "09:00";
  - path: /etc/systemd/system/memory-ballast.service
    content: |
      [Unit]
      Description=Hold ${BALLAST_GIB} GiB resident so OCI idle reclamation never fires
      [Service]
      ExecStart=/usr/bin/python3 -c "import time; b = bytearray(b'1') * (${BALLAST_GIB} * 1024**3); time.sleep(10**9)"
      Restart=always
      [Install]
      WantedBy=multi-user.target
  - path: /run/tailscale-authkey
    permissions: "0600"
    content: ${args.tailscaleAuthKey}
runcmd:
  # OCI's Ubuntu image ends INPUT with a REJECT that applies even when the NSG
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
  - curl -fsSL https://get.docker.com | sh
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --auth-key=file:/run/tailscale-authkey --hostname=${args.hostname} --advertise-tags=${args.tailscaleTag} --ssh --accept-routes=false --accept-dns=false
  - rm -f /run/tailscale-authkey
`;
}

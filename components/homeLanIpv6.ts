/**
 * The Home LAN's private IPv6 range (ULA, RFC 4193), and each Dockge host's
 * fixed address in it.
 *
 * Home's public IPv6 is Google Fiber's delegated /64 (stacks/unifi-network
 * home-ipv6.ts), which the ISP can renumber at any time. Anything other devices
 * are told to use, Technitium as the IPv6 resolver first of all, needs an
 * address that never moves, so it gets one in this range as well:
 *
 *   - the gateway holds HOME_ULA_GATEWAY, as an "Additional IP" on Home, and
 *     routes the range on the LAN (home-ipv6.ts `ipv6_aliases`);
 *   - each Dockge LXC on Home holds homeUlaAddress(<its IPv4>) beside its SLAAC
 *     public address (DockgeLxc, `home-ula.service`), so 10.10.18.4 is
 *     fd04:7815:6227:1:10:10:18:4: the IPv4 address, written as the last four
 *     groups, readable at a glance and fixed for as long as the IPv4 one is.
 *
 * The 40-bit global ID was drawn at random once (2026-11-06), as RFC 4193 asks.
 * It is not a secret. Pure, so `node --test` covers it.
 */

/** Home's ULA /64: global ID fd04:7815:6227, subnet 1. */
export const HOME_ULA_PREFIX = "fd04:7815:6227:1::/64";
/** The gateway's address in it. */
export const HOME_ULA_GATEWAY = "fd04:7815:6227:1::1";
/** The IPv4 subnet whose hosts get a ULA address (constants.ts Tailscale.subnets.home). */
export const HOME_IPV4_SUBNET = { octets: [10, 10] } as const;

const PREFIX_GROUPS = "fd04:7815:6227:1";

function ipv4Octets(ipv4: string): number[] | undefined {
  const parts = ipv4.trim().split(".");
  if (parts.length !== 4 || !parts.every(part => /^\d{1,3}$/.test(part))) return undefined;
  const octets = parts.map(Number);
  return octets.every(octet => octet <= 255) ? octets : undefined;
}

/**
 * The fixed ULA address of the host with this Home IPv4 address, or undefined
 * when the address is not IPv4 or not on Home (10.10.0.0/16): a host at another
 * site has no address in Home's range.
 */
export function homeUlaAddress(ipv4: string | undefined): string | undefined {
  const octets = ipv4 ? ipv4Octets(ipv4) : undefined;
  if (!octets || octets[0] !== HOME_IPV4_SUBNET.octets[0] || octets[1] !== HOME_IPV4_SUBNET.octets[1]) return undefined;
  return `${PREFIX_GROUPS}:${octets.join(":")}`;
}

/**
 * `/etc/sysctl.d/90-ipv6-slaac.conf` for a Dockge LXC: IPv6 on, and router
 * advertisements accepted on eth0 even though the host forwards (Docker, and
 * Tailscale's `net.ipv6.conf.all.forwarding = 1`, components/tailscale.ts). With
 * forwarding on, the kernel ignores RAs unless accept_ra is 2, and SLAAC never
 * gives the host its public address.
 */
export function renderIpv6Sysctl(): string {
  return `# Rendered by components/homeLanIpv6.ts (DockgeLxc). Edits are overwritten.
net.ipv6.conf.all.disable_ipv6 = 0
net.ipv6.conf.default.disable_ipv6 = 0
net.ipv6.conf.eth0.disable_ipv6 = 0
net.ipv6.conf.eth0.accept_ra = 2
net.ipv6.conf.eth0.autoconf = 1
`;
}

/**
 * `/etc/systemd/system/home-ula.service`: adds the host's fixed ULA address to
 * eth0 at boot. Proxmox allows one IPv6 setting per NIC, and net0 stays on SLAAC
 * for the public address, so the ULA is added here instead. `replace` is
 * idempotent. A host off Home gets a unit that does nothing, so the same files
 * ship everywhere and a move only changes this one.
 */
export function renderHomeUlaUnit(address: string | undefined): string {
  if (address !== undefined && !address.startsWith(`${PREFIX_GROUPS}:`)) throw new Error(`home-ula: ${address} is not in ${HOME_ULA_PREFIX}`);
  const exec = address ? `/sbin/ip -6 addr replace ${address}/64 dev eth0` : "/bin/true";
  return `# Rendered by components/homeLanIpv6.ts (DockgeLxc). Edits are overwritten.
# ${address ? `This host's fixed address in Home's ULA range (${HOME_ULA_PREFIX}).` : "Not on Home: no ULA address."}
[Unit]
Description=Home ULA address on eth0
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${exec}

[Install]
WantedBy=multi-user.target
`;
}

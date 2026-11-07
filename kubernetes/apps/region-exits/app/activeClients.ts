// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * How many people are on a region exit right now (docs/plans/region-exits.md
 * §D4, §G6): distinct NetBird (10.100.0.0/16) or Tailscale (100.64.0.0/10)
 * sources with a recent conntrack entry leaving through the tunnel.
 *
 * The picker shares the pod's network namespace, so /proc/net/nf_conntrack is
 * that namespace's table (CONFIG_NF_CONNTRACK_PROCFS=y on Talos). The kernel
 * makes it 0440 root:root and checks nothing else, so the picker reads it as
 * group 0 with no capability; NET_ADMIN (the netlink route) would also let it
 * rewrite the kill switch.
 *
 * "Leaving through the tunnel": the entry is masqueraded (its reply goes to an
 * address other than the client's), and routing.sh masquerades overlay
 * sources only out tun0, whose mangle FORWARD drop discards anything else
 * before conntrack confirms it. Overlay connections to the pod itself are not
 * masqueraded, so they do not count.
 *
 * "Recent": conntrack keeps no last-seen time, but each packet resets an
 * entry's timeout to its state's full value. An ESTABLISHED TCP entry
 * (432000 s by default) counts only while less than the window has passed
 * since; every other state and protocol times out within a few minutes, so
 * it counts while it exists.
 */

export const CONNTRACK_PATH = "/proc/net/nf_conntrack";
export const ESTABLISHED_TIMEOUT_PATH = "/proc/sys/net/netfilter/nf_conntrack_tcp_timeout_established";
/** The kernel's nf_conntrack_tcp_timeout_established default. */
const DEFAULT_ESTABLISHED_TIMEOUT = 432000;
/** "In the last few minutes." */
export const DEFAULT_WINDOW_SECONDS = 180;

/** NetBird's 10.100.0.0/16 and Tailscale's 100.64.0.0/10. */
function onOverlay(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4) return false;
  const [a, b] = octets;
  return (a === 10 && b === 100) || (a === 100 && b >= 64 && b <= 127);
}

/** The distinct overlay sources in a /proc/net/nf_conntrack dump that are using the tunnel. */
export function activeSources(conntrack: string, establishedTimeout: number, windowSeconds: number): Set<string> {
  const sources = new Set<string>();
  for (const line of conntrack.split("\n")) {
    const fields = line.trim().split(/\s+/);
    // ipv4 2 <proto> <protonum> <timeout> [<state>] src= dst= ... src= dst= ...
    if (fields[0] !== "ipv4") continue;
    const src = fields.filter(f => f.startsWith("src=")).map(f => f.slice(4));
    const dst = fields.filter(f => f.startsWith("dst=")).map(f => f.slice(4));
    const client = src[0];
    if (!client || !onOverlay(client)) continue;
    // Not masqueraded: to the pod itself, not out the tunnel.
    if (dst[1] === undefined || dst[1] === client) continue;
    if (fields[2] === "tcp" && fields[5] === "ESTABLISHED") {
      const remaining = Number(fields[4]);
      if (!(establishedTimeout - remaining <= windowSeconds)) continue;
    }
    sources.add(client);
  }
  return sources;
}

/**
 * The number of people on the region exit, or null when conntrack cannot be
 * read (the picker then asks for confirmation as if someone were on it).
 */
export async function activeClients(readFile: (path: string) => Promise<string>, options: { windowSeconds?: number } = {}): Promise<number | null> {
  let conntrack: string;
  try {
    conntrack = await readFile(CONNTRACK_PATH);
  } catch {
    return null;
  }
  const establishedTimeout = Number((await readFile(ESTABLISHED_TIMEOUT_PATH).catch(() => "")).trim()) || DEFAULT_ESTABLISHED_TIMEOUT;
  return activeSources(conntrack, establishedTimeout, options.windowSeconds ?? DEFAULT_WINDOW_SECONDS).size;
}

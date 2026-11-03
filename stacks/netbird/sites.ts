/**
 * Which gateway hosts route which site LAN for NetBird clients (#2887,
 * docs/plans/netbird-mirror.md §G). Pure, so `node --test` covers the rules.
 *
 * Gateways are per Dockge host (`gateway-<cluster key>`), and a host's site is
 * decided here, not by its setup key: moving a host is a one-line edit.
 */

export interface Site {
  /** LAN prefixes this site's gateways route. */
  cidrs: string[];
  /** Dockge cluster keys whose netbird-gateway container routes them. */
  gateways: string[];
}

/**
 * Where each gateway physically is today. luna and skystar sit on the home LAN
 * (`lunaIsRemote = false` in stacks/gulf-of-mexico, `skystarOnHomeLan = true`
 * in stacks/ocracoke); when one moves, move it here too. gulf-of-mexico's LAN
 * is not recorded in this repo, so it gets a site once luna goes back there.
 */
export const SITES: Record<string, Site> = {
  home: { cidrs: ["10.10.0.0/16"], gateways: ["alpha-site", "celestia", "luna", "skystar"] },
  ocracoke: { cidrs: ["192.168.1.0/24"], gateways: [] },
};

function toRange(cidr: string): [number, number] {
  const [address, bits] = cidr.split("/");
  const value = address.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(bits));
  const start = value - (value % size);
  return [start, start + size - 1];
}

/** Every reason `sites` cannot be applied. Empty means it is consistent. */
export function siteProblems(sites: Record<string, Site>, gatewayHosts: readonly string[]): string[] {
  const problems: string[] = [];
  const owner = new Map<string, string>();
  for (const [name, site] of Object.entries(sites)) {
    for (const host of site.gateways) {
      if (!gatewayHosts.includes(host)) problems.push(`${host} has no gateway setup key (add it to GATEWAY_HOSTS)`);
      const other = owner.get(host);
      if (other) problems.push(`${host} routes both ${other} and ${name}`);
      else owner.set(host, name);
    }
  }
  const prefixes = Object.entries(sites).flatMap(([name, site]) => site.cidrs.map(cidr => ({ name, cidr, range: toRange(cidr) })));
  for (let i = 0; i < prefixes.length; i++) {
    for (let j = i + 1; j < prefixes.length; j++) {
      const [a, b] = [prefixes[i], prefixes[j]];
      if (a.range[0] <= b.range[1] && b.range[0] <= a.range[1]) problems.push(`${a.name} ${a.cidr} overlaps ${b.name} ${b.cidr}`);
    }
  }
  return problems;
}

/** Sites with at least one gateway: the only ones that get a Network and router. */
export function routedSites(sites: Record<string, Site>): [string, Site][] {
  return Object.entries(sites).filter(([, site]) => site.gateways.length > 0);
}

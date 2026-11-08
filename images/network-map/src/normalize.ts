/**
 * Address normalisation, so every source spells a MAC, an IP and a CIDR the
 * same way before the machine join compares them (docs/network-map/schema.md,
 * "Joining sources into one machine": MACs lowercased with colons).
 *
 * Pure and import-free apart from node:net, so node --test loads it directly.
 */
import { isIP } from "node:net";

/** The tailnet's IPv4 range (100.64.0.0/10). NetBird uses the same CGNAT block, so this alone does not say "Tailscale". */
export const CGNAT_CIDR = "100.64.0.0/10";
/** Tailscale's IPv6 ULA prefix. */
const TAILSCALE_V6_PREFIX = "fd7a:115c:a1e0:";

/**
 * `AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff`, `AABBCCDDEEFF`, `aa:bb:cc:dd:ee:ff`
 * -> `aa:bb:cc:dd:ee:ff`. Undefined for anything that is not 48 bits of hex,
 * and for the all-zero and broadcast addresses, which identify nothing.
 */
export function normalizeMac(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const hex = value
    .trim()
    .toLowerCase()
    .replace(/[:.\-\s]/g, "");
  if (!/^[0-9a-f]{12}$/.test(hex)) return undefined;
  if (hex === "000000000000" || hex === "ffffffffffff") return undefined;
  return hex.match(/../g)!.join(":");
}

/**
 * An IP as the sources spell it -> a canonical address. Strips a `/prefix`,
 * an IPv6 zone (`%eth0`) and brackets; lowercases and compresses IPv6.
 * Undefined when what is left is not an IP.
 */
export function normalizeIp(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  let ip = value.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  ip = ip.split("/")[0].split("%")[0];
  const family = isIP(ip);
  if (family === 4)
    return ip
      .split(".")
      .map(octet => String(Number(octet)))
      .join(".");
  if (family === 6) return compressIpv6(ip.toLowerCase());
  return undefined;
}

function compressIpv6(ip: string): string {
  // Expand to eight groups, then collapse the longest run of zero groups.
  const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, undefined];
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
  // An embedded IPv4 tail (::ffff:1.2.3.4) is left as written.
  if ([...headGroups, ...tailGroups].some(g => g.includes("."))) return ip;
  const missing = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups].map(g => g.replace(/^0+(?=.)/, ""));
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < groups.length; ) {
    if (groups[i] !== "0") {
      i++;
      continue;
    }
    let j = i;
    while (j < groups.length && groups[j] === "0") j++;
    if (j - i > bestLength && j - i > 1) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  if (bestStart < 0) return groups.join(":");
  return `${groups.slice(0, bestStart).join(":")}::${groups.slice(bestStart + bestLength).join(":")}`;
}

export function isIpv4(ip: string): boolean {
  return isIP(ip) === 4;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map(shift => Math.floor(value / 2 ** shift) % 256).join(".");
}

export interface Cidr {
  /** The network address, `10.10.10.0`. */
  address: string;
  prefix: number;
  /** `10.10.10.0/24`. */
  cidr: string;
}

/**
 * `10.10.10.1/24` (UniFi's `ip_subnet` is the gateway address) -> the
 * network, `10.10.10.0/24`. A bare IP is a host route (/32 or /128). IPv6 is
 * normalised but not masked. Undefined when it does not parse.
 */
export function parseCidr(value: string | undefined | null): Cidr | undefined {
  if (!value) return undefined;
  const [rawIp, rawPrefix] = value.trim().split("/");
  const ip = normalizeIp(rawIp);
  if (!ip) return undefined;
  const v4 = isIpv4(ip);
  const max = v4 ? 32 : 128;
  const prefix = rawPrefix === undefined ? max : Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return undefined;
  if (!v4) return { address: ip, prefix, cidr: `${ip}/${prefix}` };
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipv4ToInt(ip) / size) * size;
  const address = intToIpv4(network);
  return { address, prefix, cidr: `${address}/${prefix}` };
}

/** Whether `ip` is inside `cidr`. IPv4 only; IPv6 matches only an exact host route. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const range = parseCidr(cidr);
  const address = normalizeIp(ip);
  if (!range || !address) return false;
  if (!isIpv4(address) || !isIpv4(range.address)) return range.prefix === 128 && range.address === address;
  const size = 2 ** (32 - range.prefix);
  return Math.floor(ipv4ToInt(address) / size) * size === ipv4ToInt(range.address);
}

/** Whether two CIDRs share any address (one contains the other). IPv4 only. */
export function cidrsOverlap(a: string, b: string): boolean {
  const x = parseCidr(a);
  const y = parseCidr(b);
  if (!x || !y) return false;
  if (!isIpv4(x.address) || !isIpv4(y.address)) return x.cidr === y.cidr;
  return x.prefix <= y.prefix ? ipInCidr(y.address, x.cidr) : ipInCidr(x.address, y.cidr);
}

/** 100.64.0.0/10 or Tailscale's fd7a:115c:a1e0::/48. */
export function isTailnetAddress(ip: string): boolean {
  return ipInCidr(ip, CGNAT_CIDR) || ip.startsWith(TAILSCALE_V6_PREFIX);
}

/** RFC 1918. */
export function isPrivateIpv4(ip: string): boolean {
  return ipInCidr(ip, "10.0.0.0/8") || ipInCidr(ip, "172.16.0.0/12") || ipInCidr(ip, "192.168.0.0/16");
}

/**
 * A LAN address worth joining machines by: private, and not 172.16.0.0/12,
 * where Docker's default bridge pools put the same 172.17.0.1 on every host
 * (a NetBird peer reports its docker0 alongside its real NIC). The estate's
 * LANs are 10/8 and 192.168/16.
 */
export function isJoinableLanIp(ip: string): boolean {
  return isIpv4(ip) && (ipInCidr(ip, "10.0.0.0/8") || ipInCidr(ip, "192.168.0.0/16"));
}

/** `Luna.Example.Test.` -> `luna`; undefined for an empty name. */
export function normalizeHostname(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const label = value.trim().toLowerCase().replace(/\.$/, "").split(".")[0];
  return label || undefined;
}

/** A UNIX time in seconds or milliseconds, or an RFC 3339 string -> ISO 8601. Undefined for zero, empty and unparsable. */
export function toIso(value: string | number | undefined | null): string | undefined {
  if (value === undefined || value === null || value === "" || value === 0) return undefined;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(value);
  // Go's zero time, which some APIs send for "never".
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return new Date(parsed).toISOString();
}

/** Sorted, de-duplicated, without undefined. */
export function uniq<T extends string>(values: Iterable<T | undefined | null>): T[] {
  return [...new Set([...values].filter((v): v is T => !!v))].sort();
}

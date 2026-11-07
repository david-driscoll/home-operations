// biome-ignore-all lint/style/useTemplate: as activeClients.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/netbird-system/region-exits/activeClients.test.ts
 *
 * Counting the people on a region exit from the pod's conntrack table, with
 * /proc/net/nf_conntrack and the established-timeout sysctl faked at readFile.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeClients, CONNTRACK_PATH, ESTABLISHED_TIMEOUT_PATH } from "./activeClients.ts";

/** The tunnel's address: forwarded overlay traffic is masqueraded to it. */
const TUN = "10.64.12.34";

/** /proc/net/nf_conntrack lines, in the kernel's format. */
const tcp = (src: string, timeout: number, state = "ESTABLISHED", replyDst = TUN) =>
  "ipv4     2 tcp      6 " + timeout + " " + state + " src=" + src + " dst=93.184.216.34 sport=51234 dport=443 src=93.184.216.34 dst=" + replyDst + " sport=443 dport=51234 [ASSURED] mark=0 zone=0 use=2";
const udp = (src: string, timeout: number, replyDst = TUN) =>
  "ipv4     2 udp      17 " + timeout + " src=" + src + " dst=9.9.9.9 sport=40000 dport=443 src=9.9.9.9 dst=" + replyDst + " sport=443 dport=40000 [ASSURED] mark=0 zone=0 use=2";
const icmpUnreplied = (src: string) => "ipv4     2 icmp     1 29 src=" + src + " dst=1.1.1.1 type=8 code=0 id=7 [UNREPLIED] src=1.1.1.1 dst=" + TUN + " type=0 code=0 id=7 mark=0 zone=0 use=2";

function reader(conntrack: string[] | null, establishedTimeout: string | null = "432000\n") {
  const files: Record<string, string> = {};
  if (conntrack) files[CONNTRACK_PATH] = conntrack.map(line => line + "\n").join("");
  if (establishedTimeout !== null) files[ESTABLISHED_TIMEOUT_PATH] = establishedTimeout;
  return async (path: string) => {
    if (!(path in files)) throw new Error("EACCES " + path);
    return files[path];
  };
}

describe("activeClients", () => {
  it("counts one Tailscale and one NetBird client browsing through the tunnel as 2 people", async () => {
    const count = await activeClients(reader([tcp("100.101.1.2", 431990), tcp("100.101.1.2", 431000), udp("100.101.1.2", 110), tcp("10.100.3.4", 431999), udp("10.100.3.4", 25)]));
    assert.equal(count, 2);
  });

  it("is 0 with an empty table", async () => {
    assert.equal(await activeClients(reader([])), 0);
  });

  it("ignores sources off the overlays: the pod itself, tailscaled's and NetBird's own sockets", async () => {
    assert.equal(await activeClients(reader([tcp("10.206.4.5", 431999), tcp("192.168.1.20", 431999), udp("10.101.0.1", 100)])), 0);
  });

  it("ignores overlay connections to the pod itself, which are not masqueraded out the tunnel", async () => {
    // A Tailscale client reaching tailscaled's peer API on the pod's 100.x address.
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 431999, "ESTABLISHED", "100.101.1.2")])), 0);
  });

  it("drops a client whose established connections have been idle longer than the window", async () => {
    // 431000 left of 432000: last packet 1000 s ago.
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 431000), tcp("10.100.3.4", 300000)])), 0);
  });

  it("measures idleness against the namespace's own established timeout", async () => {
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 7100)], "7200\n")), 1);
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 7100)], "432000\n")), 0);
  });

  it("counts short-lived entries (UDP, closing TCP, unanswered pings) while they last: they expire within minutes", async () => {
    assert.equal(await activeClients(reader([udp("100.101.1.2", 5), tcp("10.100.3.4", 100, "TIME_WAIT"), icmpUnreplied("100.64.0.9")])), 3);
  });

  it("takes a window other than the default", async () => {
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 431500)]), { windowSeconds: 600 }), 1);
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 431500)]), { windowSeconds: 60 }), 0);
  });

  it("skips IPv6, which never leaves through the IPv4-only tunnel", async () => {
    const v6 = "ipv6     10 tcp      6 431999 ESTABLISHED src=fd7a:115c:a1e0::1 dst=2606:4700::1 sport=1 dport=443 src=2606:4700::1 dst=fd7a:115c:a1e0::1 sport=443 dport=1 [ASSURED] mark=0 zone=0 use=2";
    assert.equal(await activeClients(reader([v6])), 0);
  });

  it("is null, not 0, when conntrack cannot be read", async () => {
    assert.equal(await activeClients(reader(null)), null);
  });

  it("falls back to the kernel's default established timeout when the sysctl cannot be read", async () => {
    assert.equal(await activeClients(reader([tcp("100.101.1.2", 431990)], null)), 1);
  });
});

/**
 * node --test stacks/netbird/dns.test.ts
 *
 * Which Technitium addresses NetBird clients get as nameservers: the
 * sidecars' overlay addresses once they have enrolled, the LAN addresses until
 * then, never more than management accepts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DNS_SERVER_ORDER, dnsPeerCluster, enrolledDnsPeers, type LivePeer, MAX_NAMESERVERS, selectNameservers, technitiumLanIps } from "./dns.ts";

const LAN = { equestria: "10.10.255.53", celestia: "10.10.1.3", "alpha-site": "10.10.10.9", luna: "10.10.1.4", skystar: "10.10.1.5" };
const peer = (hostname: string, ip: string, extra: Partial<LivePeer> = {}): LivePeer => ({ hostname, ip, connected: true, groups: [{ name: "All" }, { name: "dns-servers" }], ...extra });

describe("dnsPeerCluster", () => {
  it("reads the cluster from the sidecar's dns-<cluster> hostname", () => {
    assert.equal(dnsPeerCluster("dns-equestria"), "equestria");
    assert.equal(dnsPeerCluster("DNS-Alpha-Site"), "alpha-site");
  });

  it("ignores anything that is not a known Technitium node", () => {
    assert.equal(dnsPeerCluster("gateway-celestia"), undefined);
    assert.equal(dnsPeerCluster("dns-sgc"), undefined);
  });
});

describe("enrolledDnsPeers", () => {
  it("maps each enrolled sidecar to its overlay address", () => {
    assert.deepEqual(enrolledDnsPeers([peer("dns-equestria", "10.100.0.5"), peer("dns-luna", "10.100.0.9")]), { equestria: "10.100.0.5", luna: "10.100.0.9" });
  });

  it("counts only peers in dns-servers", () => {
    assert.deepEqual(enrolledDnsPeers([peer("dns-celestia", "10.100.0.7", { groups: [{ name: "All" }] })]), {});
  });

  it("prefers the connected peer, then the most recently seen, when a node enrolled twice", () => {
    const stale = peer("dns-celestia", "10.100.0.7", { connected: false, last_seen: "2026-11-04T10:00:00Z" });
    const live = peer("dns-celestia", "10.100.0.8", { connected: true, last_seen: "2026-11-01T10:00:00Z" });
    assert.deepEqual(enrolledDnsPeers([stale, live]), { celestia: "10.100.0.8" });
    const older = peer("dns-celestia", "10.100.0.9", { connected: false, last_seen: "2026-11-01T10:00:00Z" });
    assert.deepEqual(enrolledDnsPeers([older, stale]), { celestia: "10.100.0.7" });
  });
});

describe("selectNameservers", () => {
  it("falls back to the LAN addresses, in preference order, before any sidecar has enrolled", () => {
    assert.deepEqual(selectNameservers({ overlay: {}, lan: LAN }), [
      { cluster: "equestria", ip: "10.10.255.53", via: "lan" },
      { cluster: "celestia", ip: "10.10.1.3", via: "lan" },
      { cluster: "alpha-site", ip: "10.10.10.9", via: "lan" },
    ]);
  });

  it("puts enrolled overlay addresses first and fills the rest from the LAN", () => {
    assert.deepEqual(selectNameservers({ overlay: { luna: "10.100.0.9" }, lan: LAN }), [
      { cluster: "luna", ip: "10.100.0.9", via: "overlay" },
      { cluster: "equestria", ip: "10.10.255.53", via: "lan" },
      { cluster: "celestia", ip: "10.10.1.3", via: "lan" },
    ]);
  });

  it("is overlay only once three sidecars have enrolled, in preference order", () => {
    const overlay = { skystar: "10.100.0.11", equestria: "10.100.0.5", luna: "10.100.0.9", "alpha-site": "10.100.0.6" };
    assert.deepEqual(
      selectNameservers({ overlay, lan: LAN }).map(ns => ns.cluster),
      ["equestria", "alpha-site", "luna"],
    );
  });

  it("never exceeds what management accepts", () => {
    assert.equal(MAX_NAMESERVERS, 3);
    const overlay = Object.fromEntries(DNS_SERVER_ORDER.map((cluster, i) => [cluster, `10.100.0.${i + 1}`]));
    assert.equal(selectNameservers({ overlay, lan: LAN }).length, MAX_NAMESERVERS);
  });

  it("skips a node with no address at all and never repeats one", () => {
    assert.deepEqual(selectNameservers({ overlay: {}, lan: { celestia: "10.10.1.3", luna: "10.10.1.3" } }), [{ cluster: "celestia", ip: "10.10.1.3", via: "lan" }]);
  });
});

describe("technitiumLanIps", () => {
  const isLan = (ip: string) => ip.startsWith("10.10.");
  const dockgeHosts = { celestia: "dockge-celestia", luna: "dockge-luna", skystar: "dockge-skystar" };

  it("takes the Dockge hosts' LAN addresses from the exports, beside the fixed ones", () => {
    const exportHosts = [
      { name: "dockge-celestia", internalIp: "10.10.1.3" },
      { name: "dockge-luna", internalIp: "10.10.1.4" },
      { name: "dockge-skystar", internalIp: "10.10.1.5" },
      { name: "celestia", internalIp: "10.10.1.1" },
    ];
    assert.deepEqual(technitiumLanIps({ dockgeHosts, exportHosts, fixed: { equestria: "10.10.255.53", "alpha-site": "10.10.10.9" }, isLan }), {
      ips: { equestria: "10.10.255.53", "alpha-site": "10.10.10.9", celestia: "10.10.1.3", luna: "10.10.1.4", skystar: "10.10.1.5" },
      missing: [],
    });
  });

  it("reports a node whose export is absent or not on the LAN", () => {
    const exportHosts = [
      { name: "dockge-celestia", internalIp: "10.10.1.3" },
      { name: "dockge-luna", internalIp: "100.111.10.104" },
    ];
    assert.deepEqual(technitiumLanIps({ dockgeHosts, exportHosts, fixed: {}, isLan }).missing, ["luna", "skystar"]);
  });
});

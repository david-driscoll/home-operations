/**
 * node --test images/network-map/src/sources/netbird.test.ts
 *
 * NetBird policies -> REACHES, and peers/routes/networks -> machines and
 * routes, from management API fixtures.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureClient } from "../http.ts";
import { NETBIRD_NETWORK_ID } from "../model.ts";
import { collectNetbird, type NetbirdPolicy, policiesToReach, rulePorts } from "./netbird.ts";

const admins = { id: "g-admins", name: "admins", issued: "jwt" };
const gateways = { id: "g-gw", name: "gateways", issued: "api" };
const family = { id: "g-family", name: "family", issued: "jwt" };

const POLICIES: NetbirdPolicy[] = [
  {
    id: "p1",
    name: "admins-to-gateways",
    enabled: true,
    rules: [{ id: "r1", name: "ssh", enabled: true, action: "accept", bidirectional: false, protocol: "tcp", ports: ["22"], sources: [admins], destinations: [gateways] }],
  },
  {
    id: "p2",
    name: "family-lan",
    enabled: true,
    rules: [{ id: "r2", name: "family-lan", enabled: true, action: "accept", protocol: "all", sources: [family], destinations: [], destinationResource: { id: "res-lan", type: "subnet" } }],
  },
  { id: "p3", name: "off", enabled: false, rules: [{ id: "r3", enabled: true, action: "accept", protocol: "all", sources: [family], destinations: [admins] }] },
  {
    id: "p4",
    name: "mesh",
    enabled: true,
    rules: [
      { id: "r4", enabled: true, action: "accept", bidirectional: true, protocol: "udp", port_ranges: [{ start: 5000, end: 5010 }], sources: [gateways], destinations: [admins] },
      { id: "r5", enabled: false, action: "accept", protocol: "all", sources: [gateways], destinations: [family] },
    ],
  },
];

describe("rulePorts", () => {
  it("spells ports as proto:port, and all as *", () => {
    assert.deepEqual(rulePorts({ id: "x", protocol: "tcp", ports: ["443", "80"] }), ["tcp:443", "tcp:80"]);
    assert.deepEqual(rulePorts({ id: "x", protocol: "udp", port_ranges: [{ start: 1, end: 1 }] }), ["udp:1"]);
    assert.deepEqual(rulePorts({ id: "x", protocol: "tcp" }), ["tcp:*"]);
    assert.deepEqual(rulePorts({ id: "x", protocol: "all", ports: ["22"] }), ["*"]);
  });
});

describe("policiesToReach", () => {
  const resources = new Map([["res-lan", { id: "res-lan", name: "home-lan", type: "subnet", address: "10.10.10.0/24" }]]);
  const out = policiesToReach(POLICIES, resources);
  const edges = out.reaches.map(r => `${r.from} -> ${"group" in r.to ? r.to.group : "cidr" in r.to ? r.to.cidr : r.to.app} via ${r.via} [${r.ports.join(" ")}]`);

  it("draws enabled rules of enabled policies only, both ways when bidirectional", () => {
    assert.deepEqual(edges, [
      "netbird:admins -> netbird:gateways via netbird:r1 [tcp:22]",
      "netbird:family -> 10.10.10.0/24 via netbird:r2 [*]",
      "netbird:gateways -> netbird:admins via netbird:r4 [udp:5000-5010]",
      "netbird:admins -> netbird:gateways via netbird:r4 [udp:5000-5010]",
    ]);
  });

  it("makes one Policy per drawn rule", () => {
    assert.deepEqual(
      out.policies.map(p => [p.key, p.props.name]),
      [
        ["netbird:r1", "admins-to-gateways/ssh"],
        ["netbird:r2", "family-lan"],
        ["netbird:r4", "mesh"],
      ],
    );
  });

  it("reports a domain resource as unresolved", () => {
    const domain = new Map([["res-lan", { id: "res-lan", name: "wiki", type: "domain", address: "wiki.example.test" }]]);
    assert.deepEqual(policiesToReach([POLICIES[1]], domain).unresolved, ["resource:wiki"]);
  });
});

describe("collectNetbird", () => {
  const fixtures = {
    "/api/peers": [
      {
        id: "peer-gw",
        name: "gw-luna",
        ip: "100.90.0.5",
        dns_label: "gw-luna.netbird.example",
        hostname: "netbird-gateway",
        connected: true,
        last_seen: "2026-11-07T11:58:00Z",
        groups: [{ id: "g-gw", name: "gateways" }],
        network_addresses: [
          { net_ip: "10.10.10.21/24", mac: "02:42:0A:0A:0A:15" },
          { net_ip: "172.17.0.1/16", mac: "02:42:ac:11:00:01" },
        ],
      },
    ],
    "/api/groups": [admins, gateways, family],
    "/api/policies": POLICIES,
    "/api/routes": [{ id: "rt1", network: "10.10.20.0/24", network_id: "iot", peer: "peer-gw", enabled: true }],
    "/api/networks": [{ id: "n1", name: "home" }],
    "/api/networks/n1/resources": [{ id: "res-lan", name: "home-lan", type: "subnet", address: "10.10.10.0/24", enabled: true }],
    "/api/networks/n1/routers": [{ id: "ro1", peer_groups: ["g-gw"], enabled: true }],
  };

  it("reads every endpoint and builds the peer's interfaces, groups and routes", async () => {
    const result = await collectNetbird(fixtureClient(fixtures));
    const [peer] = result.machines;
    assert.equal(peer.key, "netbird:peer-gw");
    const [overlay, lan] = peer.interfaces;
    assert.deepEqual(overlay.network, { networkId: NETBIRD_NETWORK_ID });
    assert.deepEqual(overlay.groups, ["netbird:gateways"]);
    assert.deepEqual(overlay.advertises?.map(a => a.routeId).sort(), ["netbird:10.10.10.0/24", "netbird:10.10.20.0/24"]);
    // docker0 is dropped; the real NIC keeps its MAC for the join.
    assert.equal(peer.interfaces.length, 2);
    assert.deepEqual({ mac: lan.mac, ips: lan.ips }, { mac: "02:42:0a:0a:0a:15", ips: ["10.10.10.21"] });
    assert.deepEqual(result.groups.find(g => g.key === "netbird:admins")?.props.kind, "user");
    assert.deepEqual(result.groups.find(g => g.key === "netbird:gateways")?.props.kind, "device");
    assert.equal(result.reaches.length, 4);
  });

  it("treats a network's non-array resources or routers as empty", async () => {
    // equestria-routers has neither; the live API answered with a non-array,
    // which used to fail the whole source ("net.resources is not iterable").
    const empty = {
      ...fixtures,
      "/api/networks": [
        { id: "n1", name: "home" },
        { id: "n2", name: "equestria-routers" },
      ],
      "/api/networks/n2/resources": null,
      "/api/networks/n2/routers": null,
    };
    const result = await collectNetbird(fixtureClient(empty));
    assert.equal(result.machines.length, 1);
    assert.deepEqual(result.machines[0].interfaces[0].advertises?.map(a => a.routeId).sort(), ["netbird:10.10.10.0/24", "netbird:10.10.20.0/24"]);
  });

  it("fails the source when an endpoint fails", async () => {
    const { "/api/policies": _, ...missing } = fixtures;
    await assert.rejects(collectNetbird(fixtureClient(missing)), /HTTP 404/);
  });
});

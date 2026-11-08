/**
 * node --test images/network-map/src/sources/tailscale.test.ts
 *
 * The policy file (HuJSON) -> Policy nodes and REACHES, and the device list
 * -> machines, tags and routes. No network: fixtureClient answers.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureClient } from "../http.ts";
import { parseHujson, stripHujson } from "../hujson.ts";
import { TAILNET_NETWORK_ID } from "../model.ts";
import { collectTailscale, mintTailscaleToken, parseTailscaleDevices, policyEntryId, policyToReach, resolveSelector, splitAclDestination, type TailscalePolicy } from "./tailscale.ts";

const POLICY = `// The estate's policy, abridged.
{
  "groups": {
    "group:admins": ["admin@example.test"], // trailing comment
  },
  "hosts": {
    "home-lan": "10.10.10.0/24",
  },
  /* tag owners
     span lines */
  "tagOwners": { "tag:dockge": ["autogroup:admin"], "tag:apps": [] },
  "grants": [
    { "src": ["group:admins"], "dst": ["tag:dockge", "home-lan"], "ip": ["tcp:443", "tcp:22"] },
    { "src": ["tag:apps"], "dst": ["svc:garage-s3"], "ip": ["443"] },
    { "src": ["autogroup:member"], "dst": ["autogroup:self"], "app": { "example.test/cap": [{}] } },
  ],
  "acls": [
    { "action": "accept", "src": ["tag:apps"], "dst": ["tag:dockge:2375,8006", "10.10.20.5:53"] },
  ],
  "comment": "a // in a string stays",
}`;

describe("HuJSON", () => {
  it("drops comments and trailing commas but not slashes inside strings", () => {
    const parsed = parseHujson<{ comment: string; groups: Record<string, string[]> }>(POLICY);
    assert.equal(parsed.comment, "a // in a string stays");
    assert.deepEqual(parsed.groups["group:admins"], ["admin@example.test"]);
  });
  it("keeps escaped quotes inside strings", () => {
    assert.deepEqual(JSON.parse(stripHujson('{"a": "say \\"hi\\" // not a comment",}')), { a: 'say "hi" // not a comment' });
  });
  it("throws on an unterminated block comment", () => {
    assert.throws(() => stripHujson("{ /* never ends }"));
  });
});

describe("selectors", () => {
  it("maps tags, groups, autogroups and users to groups, hosts and IPs to CIDRs, and skips svc:", () => {
    const hosts = { "home-lan": "10.10.10.0/24" };
    assert.deepEqual(resolveSelector("tag:dockge", hosts), { group: "tailscale:tag:dockge" });
    assert.deepEqual(resolveSelector("admin@example.test", hosts), { group: "tailscale:admin@example.test" });
    assert.deepEqual(resolveSelector("home-lan", hosts), { cidr: "10.10.10.0/24" });
    assert.deepEqual(resolveSelector("10.10.20.5", hosts), { cidr: "10.10.20.5/32" });
    assert.equal(resolveSelector("svc:garage-s3", hosts), undefined);
  });
  it("splits an ACL destination's ports", () => {
    assert.deepEqual(splitAclDestination("tag:dockge:2375,8006"), { selector: "tag:dockge", ports: ["2375", "8006"] });
    assert.deepEqual(splitAclDestination("*:*"), { selector: "*", ports: ["*"] });
    assert.deepEqual(splitAclDestination("[fd7a:115c:a1e0::1]:22"), { selector: "fd7a:115c:a1e0::1", ports: ["22"] });
  });
});

describe("policyToReach", () => {
  const policy = parseHujson<TailscalePolicy>(POLICY);
  const reach = policyToReach(policy);

  it("makes one Policy per network grant and ACL rule; an app-only grant grants no reach", () => {
    assert.equal(reach.policies.length, 3);
    assert.deepEqual(reach.policies[0].props.ports, ["tcp:22", "tcp:443"]);
  });

  it("draws REACHES {via, ports} from each source to each destination", () => {
    const grant = policyEntryId("grant", policy.grants![0]);
    const acl = policyEntryId("acl", policy.acls![0]);
    const edges = reach.reaches.map(r => `${r.from} -> ${"group" in r.to ? r.to.group : "cidr" in r.to ? r.to.cidr : r.to.app} [${r.ports.join(" ")}] via ${r.via === grant ? "grant0" : r.via === acl ? "acl0" : r.via}`);
    assert.deepEqual(edges, [
      "tailscale:group:admins -> tailscale:tag:dockge [tcp:22 tcp:443] via grant0",
      "tailscale:group:admins -> 10.10.10.0/24 [tcp:22 tcp:443] via grant0",
      "tailscale:tag:apps -> tailscale:tag:dockge [2375 8006] via acl0",
      "tailscale:tag:apps -> 10.10.20.5/32 [53] via acl0",
    ]);
  });

  it("reports what it could not draw", () => {
    assert.deepEqual(reach.unresolved, ["svc:garage-s3"]);
  });

  it("knows every group and tag the file names, with members", () => {
    const admins = reach.groups.find(g => g.key === "tailscale:group:admins");
    assert.deepEqual(admins?.props, { system: "tailscale", name: "group:admins", kind: "user", members: ["admin@example.test"] });
    assert.equal(reach.groups.find(g => g.key === "tailscale:tag:apps")?.props.kind, "tag");
  });

  it("keys a grant by its content, so reordering grants keeps the ids", () => {
    const [a, b] = policy.grants!;
    assert.equal(policyToReach({ grants: [b, a] }).policies.find(p => p.key === policyEntryId("grant", a))?.key, policyEntryId("grant", a));
  });
});

const DEVICES = {
  devices: [
    {
      nodeId: "nLUNA",
      name: "dockge-luna.tailnet.example",
      hostname: "dockge-luna",
      addresses: ["100.101.1.20", "fd7a:115c:a1e0::20"],
      tags: ["tag:dockge"],
      created: "2026-01-01T00:00:00Z",
      lastSeen: "2026-11-07T11:59:00Z",
      advertisedRoutes: ["10.10.10.0/24", "0.0.0.0/0", "::/0"],
      enabledRoutes: ["10.10.10.0/24"],
      os: "linux",
    },
  ],
};

describe("parseTailscaleDevices", () => {
  const result = parseTailscaleDevices(DEVICES.devices);
  it("makes a tailnet interface with tags as MEMBER_OF and routes as ADVERTISES {approved}", () => {
    const [m] = result.machines;
    assert.equal(m.key, "tailscale:nLUNA");
    assert.deepEqual(m.tailnetFqdns, ["dockge-luna.tailnet.example"]);
    const [iface] = m.interfaces;
    assert.deepEqual(iface.network, { networkId: TAILNET_NETWORK_ID });
    assert.deepEqual(iface.ips, ["100.101.1.20", "fd7a:115c:a1e0::20"]);
    assert.deepEqual(iface.groups, ["tailscale:tag:dockge"]);
    assert.deepEqual(iface.advertises, [
      { routeId: "tailscale:0.0.0.0/0", approved: false },
      { routeId: "tailscale:10.10.10.0/24", approved: true },
      { routeId: "tailscale:::/0", approved: false },
    ]);
    assert.equal(m.firstSeen, "2026-01-01T00:00:00.000Z");
  });
  it("marks exit routes", () => {
    assert.deepEqual(
      result.routes.filter(r => r.props.exit).map(r => r.key),
      ["tailscale:0.0.0.0/0", "tailscale:::/0"],
    );
  });
});

describe("collectTailscale", () => {
  it("reads devices and the HuJSON policy through the injected client", async () => {
    const client = fixtureClient({ "/api/v2/tailnet/-/devices?fields=all": DEVICES, "/api/v2/tailnet/-/acl": POLICY });
    const result = await collectTailscale(client, { tailnet: "-" });
    assert.equal(result.machines.length, 1);
    assert.equal(result.reaches.length, 4);
    assert.deepEqual(client.calls.sort(), ["/api/v2/tailnet/-/acl", "/api/v2/tailnet/-/devices?fields=all"]);
  });

  it("mints a token with the client credentials", async () => {
    let sent: URLSearchParams | undefined;
    const fake = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await mintTailscaleToken("id", "secret", "devices:core:read", fake), "tok");
    assert.equal(sent?.get("grant_type"), "client_credentials");
    assert.equal(sent?.get("scope"), "devices:core:read");
    const refused = (async () => new Response("no", { status: 401 })) as typeof fetch;
    await assert.rejects(mintTailscaleToken("id", "bad", undefined, refused), /HTTP 401/);
  });
});

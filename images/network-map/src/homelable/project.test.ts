/**
 * node --test images/network-map/src/homelable/project.test.ts
 *
 * The four projections against ./fixture.test.ts's graph: what each design
 * draws, where, and how; drift marking with and without a declared layer;
 * and the /canvas/save payload they become.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Canvas, type CanvasNode, DRIFT_COLORS, MUTED_COLOR, savePayload } from "./canvas.ts";
import { AP_MAC, fixtureGraph, fixtureGraphWithDeclared, GATEWAY_MAC, SWITCH_MAC } from "./fixture.test.ts";
import { homelableId } from "./ids.ts";
import { TREE_LEVEL } from "./layout.ts";
import { projectApps } from "./project-apps.ts";
import { projectNetbird, projectTailscale } from "./project-overlay.ts";
import { projectUnifi } from "./project-unifi.ts";

const node = (c: Canvas, key: string): CanvasNode => {
  const n = c.nodes.find(x => x.key === key);
  assert.ok(n, `no node ${key} in ${c.design}: ${c.nodes.map(x => x.key).join(", ")}`);
  return n;
};
const byLabel = (c: Canvas, label: string): CanvasNode => {
  const n = c.nodes.find(x => x.label === label && x.type !== "groupRect");
  assert.ok(n, `no node labelled ${label} in ${c.design}`);
  return n;
};
const zone = (c: Canvas, label: string): CanvasNode => {
  const n = c.nodes.find(x => x.label === label && x.type === "groupRect");
  assert.ok(
    n,
    `no zone ${label} in ${c.design}: ${c.nodes
      .filter(x => x.type === "groupRect")
      .map(x => x.label)
      .join(", ")}`,
  );
  return n;
};
const membersOf = (c: Canvas, z: CanvasNode) =>
  c.nodes
    .filter(n => n.parentKey === z.key)
    .map(n => n.label)
    .sort();
const edge = (c: Canvas, from: CanvasNode, to: CanvasNode) => c.edges.find(e => e.sourceKey === from.key && e.targetKey === to.key);

describe("UniFi design", () => {
  const c = projectUnifi(fixtureGraph());

  it("draws the gateway, switch and AP as a tree along their uplinks", () => {
    const gw = node(c, `device:${GATEWAY_MAC}`);
    const sw = node(c, `device:${SWITCH_MAC}`);
    const ap = node(c, `device:${AP_MAC}`);
    assert.deepEqual([gw.type, sw.type, ap.type], ["router", "switch", "ap"]);
    assert.deepEqual([gw.position.y, sw.position.y, ap.position.y], [0, TREE_LEVEL, 2 * TREE_LEVEL]);
    assert.equal(edge(c, gw, sw)?.label, "port 2 · 10 Gbps");
    assert.equal(edge(c, sw, ap)?.type, "ethernet");
    assert.equal(gw.ping, "10.10.10.1", "infrastructure is pinged");
  });

  it("puts the clients in one zone per VLAN, joined to their switch port or AP", () => {
    const lan = zone(c, "Default · 10.10.10.0/24");
    const iot = zone(c, "IoT · VLAN 20 · 10.10.20.0/24");
    assert.deepEqual(membersOf(c, lan), ["gateway-luna", "luna", "luna-dockge"]);
    assert.deepEqual(membersOf(c, iot), ["apple-tv"]);
    assert.ok(lan.position.y > 2 * TREE_LEVEL, "zones sit below the tree");
    const sw = node(c, `device:${SWITCH_MAC}`);
    const dockge = byLabel(c, "luna-dockge");
    assert.equal(edge(c, sw, dockge)?.label, "port 7");
    const tv = byLabel(c, "apple-tv");
    assert.deepEqual({ type: edge(c, node(c, `device:${AP_MAC}`), tv)?.type, label: edge(c, node(c, `device:${AP_MAC}`), tv)?.label }, { type: "wifi", label: "home-iot · 5GHz" });
  });

  it("pings the Proxmox and Dockge hosts, and nothing else among the clients", () => {
    assert.equal(byLabel(c, "luna").type, "proxmox");
    assert.equal(byLabel(c, "luna").ping, "10.10.10.5");
    assert.equal(byLabel(c, "luna-dockge").type, "docker_host");
    assert.equal(byLabel(c, "luna-dockge").ping, "10.10.10.20");
    assert.equal(byLabel(c, "apple-tv").ping, undefined);
    assert.equal(byLabel(c, "gateway-luna").ping, undefined);
    assert.equal(byLabel(c, "apple-tv").status, "online");
  });
});

describe("Tailscale design", () => {
  const c = projectTailscale(fixtureGraph());

  it("groups devices by tag, with routers and exits in their own zone", () => {
    assert.deepEqual(membersOf(c, zone(c, "Subnet routers and exit nodes")), ["region-exit", "ts-router"]);
    assert.deepEqual(membersOf(c, zone(c, "tag:dockge")), ["luna-dockge"]);
    assert.deepEqual(membersOf(c, zone(c, "Untagged (user devices)")), ["alice-phone"]);
    assert.equal(c.nodes.filter(n => n.label === "luna-dockge").length, 1, "one node per tailnet interface");
    assert.equal(byLabel(c, "luna-dockge").ip, "100.100.0.20", "IPv4 first");
    assert.equal(byLabel(c, "alice-phone").type, "mobile");
  });

  it("draws routes as dashed edges to the networks they reach, and greys an unapproved exit", () => {
    const router = byLabel(c, "ts-router");
    const lan = byLabel(c, "Default · 10.10.10.0/24");
    const toLan = edge(c, router, lan);
    assert.deepEqual({ type: toLan?.type, line: toLan?.line, label: toLan?.label, color: toLan?.color }, { type: "virtual", line: "dashed", label: "10.10.10.0/24", color: undefined });
    const exit = edge(c, byLabel(c, "region-exit"), node(c, "internet"));
    assert.equal(exit?.label, "0.0.0.0/0 (not approved)");
    assert.equal(exit?.color, MUTED_COLOR);
    assert.equal(byLabel(c, "region-exit").status, "offline");
  });

  it("pings the Dockge host at its LAN address: a pod cannot reach the tailnet", () => {
    assert.equal(byLabel(c, "luna-dockge").ping, "10.10.10.20");
    assert.equal(byLabel(c, "ts-router").ping, undefined);
  });
});

describe("NetBird design", () => {
  const c = projectNetbird(fixtureGraph());

  it("groups peers by group, gateways and in-cluster routers first, ignoring All", () => {
    assert.deepEqual(membersOf(c, zone(c, "Gateways")), ["gateway-luna"]);
    assert.deepEqual(membersOf(c, zone(c, "In-cluster routers")), ["netbird-router-0"]);
    assert.deepEqual(membersOf(c, zone(c, "group family-devices")), ["alice-laptop"]);
    assert.ok(!c.nodes.some(n => n.label === "group All"));
  });

  it("draws networks as zones of their resources, joined to the peers that route them", () => {
    const res = byLabel(c, "home-lan · 10.10.10.0/24");
    assert.equal(res.parentKey, zone(c, "Network: home").key);
    const e = edge(c, byLabel(c, "gateway-luna"), res);
    assert.deepEqual({ type: e?.type, line: e?.line }, { type: "virtual", line: "dashed" });
  });

  it("pings gateways at their LAN address, and takes everyone else's status from NetBird", () => {
    const gw = byLabel(c, "gateway-luna");
    assert.equal(gw.ip, "100.90.0.21");
    assert.equal(gw.ping, "10.10.10.21");
    assert.equal(byLabel(c, "alice-laptop").ping, undefined);
    assert.equal(byLabel(c, "alice-laptop").status, "offline");
  });
});

describe("Apps design", () => {
  const c = projectApps(fixtureGraph());

  it("groups apps by the machine that runs them, or else their cluster", () => {
    assert.deepEqual(membersOf(c, zone(c, "luna-dockge")), ["jellyfin"]);
    assert.deepEqual(membersOf(c, zone(c, "equestria (cluster)")), ["authentik"]);
    assert.ok(!c.nodes.some(n => n.type !== "groupRect" && n.label === "luna-dockge"), "machines are zones here, not nodes");
  });

  it("joins entry points to the apps they serve", () => {
    const e = edge(c, byLabel(c, "traefik-luna"), byLabel(c, "jellyfin"));
    assert.equal(e?.label, "jellyfin-tailscale.example.test, jellyfin.example.test");
    assert.ok(edge(c, byLabel(c, "internal"), byLabel(c, "authentik")));
  });

  it("follows a user group's reach through a tag to the apps its machines run", () => {
    const fam = byLabel(c, "group:family (tailscale)");
    const e = edge(c, fam, byLabel(c, "jellyfin"));
    assert.deepEqual({ line: e?.line, label: e?.label, arrow: e?.arrow }, { line: "dotted", label: "tcp:443, tcp:8096", arrow: true });
    assert.equal(edge(c, fam, byLabel(c, "authentik")), undefined);
  });
});

describe("drift", () => {
  it("marks nothing while there is no declared layer", () => {
    const g = fixtureGraph();
    for (const project of [projectUnifi, projectTailscale, projectNetbird, projectApps]) {
      assert.deepEqual(
        project(g).nodes.filter(n => n.drift),
        [],
      );
    }
  });

  it("marks observed-but-undeclared amber and declared-but-unobserved red, for declared labels only", () => {
    const g = fixtureGraphWithDeclared();
    const apps = projectApps(g);
    assert.equal(byLabel(apps, "jellyfin").drift, undefined, "declared and observed");
    assert.equal(byLabel(apps, "authentik").drift, "undeclared");
    const ghost = byLabel(apps, "ghost");
    assert.equal(ghost.drift, "unobserved");
    assert.equal(ghost.parentKey, zone(apps, "Declared, not observed").key);
    assert.equal(byLabel(apps, "traefik-luna").drift, undefined, "no EntryPoint is declared, so none is judged");

    assert.deepEqual(byLabel(apps, "jellyfin").properties?.["declared by"], [], "paired by key, with no edge to report");

    const unifi = projectUnifi(g);
    const dockge = byLabel(unifi, "luna-dockge");
    assert.equal(dockge.drift, undefined);
    assert.deepEqual(dockge.properties?.["declared by"], ["mac"]);
    assert.equal(byLabel(unifi, "apple-tv").drift, "undeclared");
    assert.equal(byLabel(unifi, "ucg-max").drift, undefined, "UniFi gear is judged as a Device, which the repo never declares");
    assert.deepEqual(membersOf(unifi, zone(unifi, "Declared, not observed")), ["old-lxc"], "placed by its declared LAN address");

    const ts = projectTailscale(g);
    assert.deepEqual(membersOf(ts, zone(ts, "Declared, not observed")), ["skystar"], "placed by its declared 100.x address");
    assert.equal(zone(ts, "tag:media").drift, "unobserved");
    assert.ok(!ts.nodes.some(n => n.label === "group:family"), "a user group places no device");

    const nb = projectNetbird(g);
    assert.deepEqual(membersOf(nb, zone(nb, "Declared, not observed")), ["gateway-skystar"]);
    assert.ok(!nb.nodes.some(n => n.key === "zone:declared:netbird:gateways"), "the declared gateways group pairs with the observed one by key");

    const body = savePayload(apps, "d1");
    const auth = body.nodes.find(n => n.label === "authentik");
    assert.equal(auth?.custom_colors?.border, DRIFT_COLORS.undeclared);
    assert.deepEqual(auth?.properties[0], { key: "drift", value: "observed, not declared", icon: null, visible: true });
    assert.equal(body.nodes.find(n => n.label === "ghost")?.custom_colors?.border, DRIFT_COLORS.unobserved);
  });
});

describe("the save payload", () => {
  const g = fixtureGraph();
  const canvas = projectUnifi(g);

  it("is deterministic: same graph, same ids, same layout", () => {
    assert.deepEqual(savePayload(projectUnifi(fixtureGraph()), "d1"), savePayload(canvas, "d1"));
    assert.equal(node(canvas, `device:${GATEWAY_MAC}`).id, homelableId("UniFi", `device:${GATEWAY_MAC}`));
  });

  it("has Homelable's NodeSave and EdgeSave shape, parents before children", () => {
    const body = savePayload(canvas, "design-1", { deviceIds: new Map([[homelableId("UniFi", `device:${GATEWAY_MAC}`), "dev-gw"]]), viewport: { x: 5, y: 6, zoom: 0.8 }, customStyle: { theme: "dark" } });
    assert.equal(body.design_id, "design-1");
    assert.deepEqual(body.viewport, { x: 5, y: 6, zoom: 0.8 }, "the viewport someone left is kept");
    assert.deepEqual(body.custom_style, { theme: "dark" });
    assert.deepEqual(Object.keys(body.nodes[0]).sort(), [
      "check_method",
      "check_target",
      "container_mode",
      "custom_colors",
      "description",
      "device_id",
      "height",
      "hostname",
      "id",
      "ip",
      "label",
      "mac",
      "os",
      "parent_id",
      "pos_x",
      "pos_y",
      "properties",
      "status",
      "type",
      "width",
    ]);
    assert.deepEqual(Object.keys(body.edges[0]).sort(), ["custom_color", "id", "label", "line_style", "marker_end", "source", "target", "type"]);
    const ids = new Set(body.nodes.map(n => n.id));
    assert.equal(ids.size, body.nodes.length, "ids are unique");
    const seen = new Set<string>();
    for (const n of body.nodes) {
      assert.match(n.id, /^[A-Za-z0-9_-]+$/);
      if (n.parent_id) assert.ok(seen.has(n.parent_id), `${n.label}'s parent comes first`);
      seen.add(n.id);
    }
    for (const e of body.edges) assert.ok(ids.has(e.source) && ids.has(e.target));

    const gw = body.nodes.find(n => n.label === "ucg-max");
    assert.deepEqual(
      { device_id: gw?.device_id, check_method: gw?.check_method, check_target: gw?.check_target, ip: gw?.ip, mac: gw?.mac },
      { device_id: "dev-gw", check_method: "ping", check_target: "10.10.10.1", ip: "10.10.10.1", mac: GATEWAY_MAC },
    );
    const tv = body.nodes.find(n => n.label === "apple-tv");
    assert.deepEqual({ device_id: tv?.device_id, check_method: tv?.check_method, status: tv?.status }, { device_id: null, check_method: null, status: "online" });
    const lan = body.nodes.find(n => n.type === "groupRect" && n.label.startsWith("Default"));
    assert.ok(lan?.width && lan.height && lan.device_id === null && lan.properties.length === 0);
    assert.equal(lan?.custom_colors?.width, lan?.width);
    assert.equal(tv?.properties.at(-1)?.key, "managed-by");
  });
});

/**
 * A small network map in the shape the collector writes (docs/network-map/schema.md),
 * for the Homelable tests: one of everything each design draws. Named
 * `*.test.ts` so it stays out of the image (bake.sh) and the image tag
 * (inputs.sh); it holds no tests itself, so importing it adds none.
 *
 *   UniFi       gateway -> switch -> AP; a Dockge LXC and a Proxmox host wired
 *               on the switch (Default LAN), an Apple TV on the AP (IoT, VLAN 20)
 *   Tailscale   the Dockge host (tag:dockge), a subnet router for the LAN, an
 *               exit node whose route is not approved, an untagged phone
 *   NetBird     a gateway container (gateways), an in-cluster router
 *               (k8s-routers), a peer in `family-devices`; the LAN as a network resource
 *   Apps        jellyfin on the Dockge host behind its Traefik, authentik on
 *               the cluster behind the internal Gateway; group:family reaches
 *               tag:dockge, so jellyfin
 *
 * `withDeclared` adds a declared layer: the Dockge host declared (DECLARES),
 * plus an app nothing serves.
 */
import { buildMapGraph, type Layer, type MapGraph, type MapNode, type MapRel, type Value } from "./graph.ts";

export const GATEWAY_MAC = "f4:e2:c6:00:00:00";
export const SWITCH_MAC = "f4:e2:c6:00:00:01";
export const AP_MAC = "f4:e2:c6:00:00:02";

interface Builder {
  node(id: string, labels: string[], props: Record<string, Value>, layer?: Layer): void;
  rel(type: string, from: string, to: string, props?: Record<string, Value>): void;
  graph(): MapGraph;
}

export function graphBuilder(): Builder {
  const nodes: MapNode[] = [];
  const rels: MapRel[] = [];
  return {
    node: (id, labels, props, layer = "observed") => {
      nodes.push({ id, labels, layer, props: { ...props, layer } });
    },
    rel: (type, from, to, props = {}) => {
      rels.push({ type, from, to, props });
    },
    graph: () => buildMapGraph(nodes, rels),
  };
}

function base(b: Builder): void {
  // Networks
  b.node("net:lan", ["Network"], { networkId: "unifi:lan", name: "Default", kind: "vlan", cidr: "10.10.10.0/24", purpose: "corporate" });
  b.node("net:iot", ["Network"], { networkId: "unifi:iot", name: "IoT", kind: "vlan", vlan: 20, cidr: "10.10.20.0/24", purpose: "corporate" });
  b.node("net:tailnet", ["Network"], { networkId: "tailscale:tailnet", name: "tailnet", kind: "tailnet", cidr: "100.64.0.0/10" });
  b.node("net:netbird", ["Network"], { networkId: "netbird:netbird", name: "netbird", kind: "netbird" });

  // UniFi devices
  const device = (id: string, mac: string, name: string, type: string, ip: string) => {
    b.node(id, ["Machine", "Device"], { machineId: `m-${name}`, name, kind: "physical", status: "online", mac, model: name.toUpperCase(), type, sources: ["unifi"], observations: [`unifi:device:${mac}`] });
    b.node(`${id}:if`, ["Interface"], { ifaceId: `unifi:lan:${mac}`, network: "unifi:lan", mac, ips: [ip], online: true });
    b.rel("HAS_INTERFACE", id, `${id}:if`);
    b.rel("ON", `${id}:if`, "net:lan");
  };
  device("gw", GATEWAY_MAC, "ucg-max", "gateway", "10.10.10.1");
  device("sw", SWITCH_MAC, "usw-24", "switch", "10.10.10.2");
  device("ap", AP_MAC, "u7-pro", "ap", "10.10.10.3");
  b.rel("UPLINK", "sw", "gw", { speed: 10000, port: 2 });
  b.rel("UPLINK", "ap", "sw", { speed: 2500, port: 1 });
  b.node("port:7", ["Port"], { portId: `${SWITCH_MAC}:7`, deviceMac: SWITCH_MAC, idx: 7, speed: 1000 });
  b.node("port:8", ["Port"], { portId: `${SWITCH_MAC}:8`, deviceMac: SWITCH_MAC, idx: 8, speed: 1000 });

  // The Dockge LXC: UniFi client, Proxmox LXC, Docker host, tailnet device, runs jellyfin.
  b.node("luna-dockge", ["Machine"], {
    machineId: "m-luna-dockge",
    name: "luna-dockge",
    kind: "lxc",
    os: "debian",
    status: "running",
    joined: true,
    sources: ["unifi", "proxmox", "docker", "tailscale"],
    observations: ["unifi:client:bc:24:11:00:00:20", "proxmox:luna/120", "docker:host:luna", "tailscale:n1"],
  });
  b.node("luna-dockge:lan", ["Interface"], { ifaceId: "unifi:lan:bc:24:11:00:00:20", mac: "bc:24:11:00:00:20", ips: ["10.10.10.20"], hostname: "luna-dockge", online: true });
  b.rel("HAS_INTERFACE", "luna-dockge", "luna-dockge:lan");
  b.rel("ON", "luna-dockge:lan", "net:lan");
  b.rel("UPLINK", "luna-dockge:lan", "port:7", { port: 7 });
  b.node("luna-dockge:ts", ["Interface"], { ifaceId: "tailscale:tailnet:100.100.0.20", ips: ["100.100.0.20", "fd7a:115c:a1e0::20"], hostname: "luna-dockge", online: true });
  b.rel("HAS_INTERFACE", "luna-dockge", "luna-dockge:ts");
  b.rel("ON", "luna-dockge:ts", "net:tailnet");

  // The Proxmox host itself.
  b.node("luna", ["Machine"], {
    machineId: "m-luna",
    name: "luna",
    kind: "physical",
    status: "online",
    joined: true,
    sources: ["unifi", "proxmox"],
    observations: ["unifi:client:aa:aa:aa:00:00:05", "proxmox:node:luna"],
  });
  b.node("luna:lan", ["Interface"], { ifaceId: "unifi:lan:aa:aa:aa:00:00:05", mac: "aa:aa:aa:00:00:05", ips: ["10.10.10.5"], hostname: "luna", online: true });
  b.rel("HAS_INTERFACE", "luna", "luna:lan");
  b.rel("ON", "luna:lan", "net:lan");
  b.rel("UPLINK", "luna:lan", "port:8", { port: 8 });
  b.rel("HOSTED_ON", "luna-dockge", "luna");

  // A Wi-Fi client on the IoT VLAN.
  b.node("appletv", ["Machine"], { machineId: "m-appletv", name: "apple-tv", kind: "client", status: "online", joined: false, sources: ["unifi"], observations: ["unifi:client:aa:bb:cc:00:00:50"] });
  b.node("appletv:if", ["Interface"], { ifaceId: "unifi:iot:aa:bb:cc:00:00:50", mac: "aa:bb:cc:00:00:50", ips: ["10.10.20.50"], hostname: "apple-tv", online: true });
  b.rel("HAS_INTERFACE", "appletv", "appletv:if");
  b.rel("ON", "appletv:if", "net:iot");
  b.rel("ASSOCIATED", "appletv:if", "ap", { essid: "home-iot", band: "5GHz" });

  // Tailscale: tags, a subnet router, an exit node, a phone.
  b.node("tag:dockge", ["Group"], { groupId: "tailscale:tag:dockge", system: "tailscale", name: "tag:dockge", kind: "tag" });
  b.node("tag:router", ["Group"], { groupId: "tailscale:tag:router", system: "tailscale", name: "tag:router", kind: "tag" });
  b.node("group:family", ["Group"], { groupId: "tailscale:group:family", system: "tailscale", name: "group:family", kind: "user", members: ["alice@example.test"] });
  b.rel("MEMBER_OF", "luna-dockge:ts", "tag:dockge");
  b.node("route:ts:lan", ["Route"], { routeId: "tailscale:10.10.10.0/24", system: "tailscale", cidr: "10.10.10.0/24", exit: false });
  b.node("route:ts:exit", ["Route"], { routeId: "tailscale:0.0.0.0/0", system: "tailscale", cidr: "0.0.0.0/0", exit: true });
  b.rel("ROUTES_TO", "route:ts:lan", "net:lan");
  b.node("tsrouter", ["Machine"], { machineId: "m-tsrouter", name: "ts-router", kind: "client", os: "linux", joined: false, sources: ["tailscale"], observations: ["tailscale:n2"] });
  b.node("tsrouter:ts", ["Interface"], { ifaceId: "tailscale:tailnet:100.100.0.2", ips: ["100.100.0.2"], hostname: "ts-router", online: true });
  b.rel("HAS_INTERFACE", "tsrouter", "tsrouter:ts");
  b.rel("ON", "tsrouter:ts", "net:tailnet");
  b.rel("MEMBER_OF", "tsrouter:ts", "tag:router");
  b.rel("ADVERTISES", "tsrouter:ts", "route:ts:lan", { approved: true });
  b.node("exit", ["Machine"], { machineId: "m-exit", name: "region-exit", kind: "client", os: "linux", joined: false, sources: ["tailscale"], observations: ["tailscale:n3"] });
  b.node("exit:ts", ["Interface"], { ifaceId: "tailscale:tailnet:100.100.0.3", ips: ["100.100.0.3"], hostname: "region-exit", online: false });
  b.rel("HAS_INTERFACE", "exit", "exit:ts");
  b.rel("ON", "exit:ts", "net:tailnet");
  b.rel("ADVERTISES", "exit:ts", "route:ts:exit", { approved: false });
  b.node("phone", ["Machine"], { machineId: "m-phone", name: "alice-phone", kind: "client", os: "iOS", joined: false, sources: ["tailscale"], observations: ["tailscale:n4"] });
  b.node("phone:ts", ["Interface"], { ifaceId: "tailscale:tailnet:100.100.0.4", ips: ["100.100.0.4"], hostname: "alice-phone", online: true });
  b.rel("HAS_INTERFACE", "phone", "phone:ts");
  b.rel("ON", "phone:ts", "net:tailnet");
  b.node("policy:ts", ["Policy"], { policyId: "tailscale:grant:abc", system: "tailscale", name: "grant group:family -> tag:dockge" });
  b.rel("REACHES", "group:family", "tag:dockge", { via: "tailscale:grant:abc", ports: ["tcp:443", "tcp:8096"] });

  // NetBird: a gateway container on the Dockge host, an in-cluster router, a family laptop.
  for (const [id, name] of [
    ["nb:gateways", "gateways"],
    ["nb:k8s", "k8s-routers"],
    ["nb:family", "family-devices"],
    ["nb:all", "All"],
  ]) {
    b.node(id, ["Group"], { groupId: `netbird:${name}`, system: "netbird", name, kind: "device" });
  }
  b.node("route:nb:lan", ["Route"], { routeId: "netbird:10.10.10.0/24", system: "netbird", cidr: "10.10.10.0/24", exit: false, name: "home-lan", network: "home" });
  b.rel("ROUTES_TO", "route:nb:lan", "net:lan");
  b.node("nbgw", ["Machine"], {
    machineId: "m-nbgw",
    name: "gateway-luna",
    kind: "container",
    status: "running",
    joined: true,
    sources: ["unifi", "docker", "netbird"],
    observations: ["unifi:client:02:42:0a:0a:0a:15", "docker:luna/gateway-luna", "netbird:p1"],
  });
  b.node("nbgw:lan", ["Interface"], { ifaceId: "unifi:lan:02:42:0a:0a:0a:15", mac: "02:42:0a:0a:0a:15", ips: ["10.10.10.21"], hostname: "gateway-luna", online: true });
  b.rel("HAS_INTERFACE", "nbgw", "nbgw:lan");
  b.rel("ON", "nbgw:lan", "net:lan");
  b.rel("UPLINK", "nbgw:lan", "port:7", { port: 7 });
  b.rel("HOSTED_ON", "nbgw", "luna-dockge");
  b.node("nbgw:nb", ["Interface"], { ifaceId: "netbird:netbird:100.90.0.21", ips: ["100.90.0.21"], hostname: "gateway-luna", online: true });
  b.rel("HAS_INTERFACE", "nbgw", "nbgw:nb");
  b.rel("ON", "nbgw:nb", "net:netbird");
  b.rel("MEMBER_OF", "nbgw:nb", "nb:gateways");
  b.rel("MEMBER_OF", "nbgw:nb", "nb:all");
  b.rel("ADVERTISES", "nbgw:nb", "route:nb:lan", { approved: true });
  b.node("k8srouter", ["Machine"], { machineId: "m-k8srouter", name: "netbird-router-0", kind: "client", status: "online", joined: false, sources: ["netbird"], observations: ["netbird:p2"] });
  b.node("k8srouter:nb", ["Interface"], { ifaceId: "netbird:netbird:100.90.0.30", ips: ["100.90.0.30"], hostname: "netbird-router-0", online: true });
  b.rel("HAS_INTERFACE", "k8srouter", "k8srouter:nb");
  b.rel("ON", "k8srouter:nb", "net:netbird");
  b.rel("MEMBER_OF", "k8srouter:nb", "nb:k8s");
  b.rel("MEMBER_OF", "k8srouter:nb", "nb:all");
  b.node("laptop", ["Machine"], { machineId: "m-laptop", name: "alice-laptop", kind: "client", os: "macOS", status: "offline", joined: false, sources: ["netbird"], observations: ["netbird:p3"] });
  b.node("laptop:nb", ["Interface"], { ifaceId: "netbird:netbird:100.90.0.40", ips: ["100.90.0.40"], hostname: "alice-laptop", online: false });
  b.rel("HAS_INTERFACE", "laptop", "laptop:nb");
  b.rel("ON", "laptop:nb", "net:netbird");
  b.rel("MEMBER_OF", "laptop:nb", "nb:family");
  b.rel("MEMBER_OF", "laptop:nb", "nb:all");

  // Apps and entry points.
  b.node("app:jellyfin", ["App"], { appId: "jellyfin", name: "jellyfin", cluster: "luna" });
  b.node("app:authentik", ["App"], { appId: "authentik", name: "authentik", cluster: "equestria", hostnames: ["auth.example.test"], routes: ["security/authentik"] });
  b.node("ep:traefik", ["EntryPoint"], { entryId: "traefik:luna", kind: "traefik", name: "traefik-luna", address: "dockge-luna.example.test" });
  b.node("ep:internal", ["EntryPoint"], { entryId: "gateway:network/internal", kind: "gateway", name: "internal", cluster: "equestria", address: "10.10.10.200" });
  b.rel("RUNS", "luna-dockge", "app:jellyfin");
  b.rel("SERVED_BY", "app:jellyfin", "ep:traefik", { name: "jellyfin.example.test" });
  b.rel("SERVED_BY", "app:jellyfin", "ep:traefik", { name: "jellyfin-tailscale.example.test" });
  b.rel("SERVED_BY", "app:authentik", "ep:internal", { name: "auth.example.test" });
}

export function fixtureGraph(): MapGraph {
  const b = graphBuilder();
  base(b);
  return b.graph();
}

/** The same graph with a declared layer: the Dockge host declared and observed, an app declared and not. */
export function fixtureGraphWithDeclared(): MapGraph {
  const b = graphBuilder();
  base(b);
  // As declared/machines.ts and declared/netbird.ts write them: `repo:<hostname>` keys,
  // addresses as props (no Interfaces), DECLARES from src/declares.ts with its `by`.
  const declared = (id: string, props: Record<string, Value>) => b.node(id, ["Machine"], props, "declared");
  declared("d:luna-dockge", { machineId: "repo:luna-dockge", name: "luna-dockge", hostname: "luna-dockge", kind: "lxc", ips: ["10.10.10.20"], macs: ["bc:24:11:00:00:20"] });
  b.rel("DECLARES", "d:luna-dockge", "luna-dockge", { by: "mac" });
  declared("d:old-lxc", { machineId: "repo:old-lxc", name: "old-lxc", hostname: "old-lxc", kind: "lxc", ips: ["10.10.10.99"] });
  declared("d:skystar", { machineId: "repo:skystar", name: "skystar", hostname: "skystar", kind: "physical", ips: ["192.168.50.2", "100.100.0.99"] });
  declared("d:gw-skystar", { machineId: "repo:gateway-skystar", name: "gateway-skystar", hostname: "gateway-skystar", kind: "container", declaredAs: "netbird-gateway" });
  b.node("d:nb:gateways", ["Group"], { groupId: "netbird:gateways", system: "netbird", name: "gateways", kind: "device" }, "declared");
  b.rel("MEMBER_OF", "d:gw-skystar", "d:nb:gateways");
  b.node("d:tag:media", ["Group"], { groupId: "tailscale:tag:media", system: "tailscale", name: "tag:media", kind: "tag" }, "declared");
  b.node("d:group:family", ["Group"], { groupId: "tailscale:group:family", system: "tailscale", name: "group:family", kind: "user" }, "declared");
  // jellyfin has no DECLARES edge (the collector re-created it since the link ran): the shared appId still pairs them.
  b.node("d:app:jellyfin", ["App"], { appId: "jellyfin", name: "jellyfin" }, "declared");
  b.node("d:app:ghost", ["App"], { appId: "ghost", name: "ghost" }, "declared");
  return b.graph();
}

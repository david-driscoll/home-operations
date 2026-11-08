/**
 * node --test images/network-map/src/build.test.ts
 *
 * Every source collector against API fixtures (no network), then the whole
 * build: the schema's LXC + NetBird gateway + UniFi example as nodes and
 * edges, a partial Proxmox read, and the UniFi-down fallback.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGraph } from "./build.ts";
import { fixtureClient } from "./http.ts";
import type { GraphPlan, SourceResult } from "./model.ts";
import { collectDocker, traefikHosts } from "./sources/docker.ts";
import { collectKubernetes } from "./sources/kubernetes.ts";
import { collectNetbird } from "./sources/netbird.ts";
import { collectProxmox, parseNetConfig } from "./sources/proxmox.ts";
import { collectTailscale } from "./sources/tailscale.ts";
import { collectUnifi } from "./sources/unifi.ts";

const LXC_MAC = "BC:24:11:00:00:20";
const GW_MAC = "02:42:0a:0a:0a:15";
const SWITCH = "f4:e2:c6:00:00:01";
const GATEWAY = "f4:e2:c6:00:00:00";
const AP = "f4:e2:c6:00:00:02";

const unifi = fixtureClient({
  "/proxy/network/api/s/default/rest/networkconf": {
    meta: { rc: "ok" },
    data: [
      { _id: "lan", name: "Default", purpose: "corporate", ip_subnet: "10.10.10.1/24" },
      { _id: "iot", name: "IoT", purpose: "corporate", ip_subnet: "10.10.20.1/24", vlan_enabled: true, vlan: 20 },
      { _id: "wan", name: "WAN", purpose: "wan" },
    ],
  },
  "/proxy/network/api/s/default/stat/device": {
    meta: { rc: "ok" },
    data: [
      { mac: GATEWAY, name: "ucg-max", model: "UCGMAX", type: "udm", ip: "10.10.10.1", state: 1 },
      {
        mac: SWITCH,
        name: "usw-24",
        model: "USW24",
        type: "usw",
        ip: "10.10.10.2",
        state: 1,
        uplink: { uplink_mac: GATEWAY, uplink_remote_port: 2, speed: 10000 },
        port_table: [{ port_idx: 7, speed: 1000, poe_enable: false }],
      },
      { mac: AP, name: "u7-pro", model: "U7PRO", type: "uap", ip: "10.10.10.3", state: 1, uplink: { uplink_mac: SWITCH, uplink_remote_port: 1, speed: 2500 } },
    ],
  },
  "/proxy/network/api/s/default/stat/sta": {
    meta: { rc: "ok" },
    data: [
      { mac: LXC_MAC.toLowerCase(), ip: "10.10.10.20", hostname: "dockge-luna", network_id: "lan", is_wired: true, sw_mac: SWITCH, sw_port: 7, first_seen: 1_767_225_600, last_seen: 1_794_052_740 },
      { mac: GW_MAC, ip: "10.10.10.21", hostname: "netbird-gateway", network_id: "lan", is_wired: true, sw_mac: SWITCH, sw_port: 7 },
      { mac: "aa:bb:cc:00:00:50", ip: "10.10.20.50", hostname: "apple-tv", network_id: "iot", is_wired: false, ap_mac: AP, essid: "home-iot", radio: "na" },
    ],
  },
});

const proxmoxLuna = fixtureClient({
  "/api2/json/nodes": { data: [{ node: "luna", status: "online" }] },
  "/api2/json/nodes/luna/network": { data: [{ iface: "vmbr0", type: "bridge", address: "10.10.10.10", active: 1 }] },
  "/api2/json/nodes/luna/qemu": { data: [{ vmid: 200, name: "template", template: 1 }] },
  "/api2/json/nodes/luna/lxc": { data: [{ vmid: 120, name: "dockge-luna", status: "running" }] },
  "/api2/json/nodes/luna/lxc/120/config": { data: { hostname: "dockge-luna", ostype: "debian", net0: `name=eth0,bridge=vmbr0,hwaddr=${LXC_MAC},ip=dhcp,type=veth` } },
  "/api2/json/nodes/luna/lxc/120/interfaces": {
    data: [
      { name: "lo", hwaddr: "00:00:00:00:00:00", inet: "127.0.0.1/8" },
      { name: "eth0", hwaddr: LXC_MAC, inet: "10.10.10.20/24" },
      { name: "tailscale0", inet: "100.101.1.20/32" },
      { name: "docker0", hwaddr: "02:42:ac:11:00:01", inet: "172.17.0.1/16" },
    ],
  },
});
const proxmoxDown = fixtureClient({ "/api2/json/nodes": new Error("connect ETIMEDOUT") });

const dockerLuna = fixtureClient({
  "/info": { Name: "dockge-luna", OperatingSystem: "Debian GNU/Linux 13" },
  "/networks": [
    { Name: "dockge_default", Driver: "bridge" },
    { Name: "lan", Driver: "macvlan" },
  ],
  "/containers/json?all=true": [
    { Id: "c1", Names: ["/netbird-gateway"], State: "running", Labels: { "com.docker.compose.project": "netbird-gateway" }, NetworkSettings: { Networks: { lan: { IPAddress: "10.10.10.21", MacAddress: GW_MAC } } } },
    {
      Id: "c2",
      Names: ["/backrest"],
      State: "running",
      Labels: {
        "com.docker.compose.project": "backrest",
        "traefik.enable": "true",
        "traefik.http.routers.backrest.rule": "Host(`backrest-luna.example.test`)",
        "traefik.http.routers.backrest-tailscale.rule": "Host(`backrest-luna.tailnet.example`)",
      },
      NetworkSettings: { Networks: { dockge_default: { IPAddress: "172.18.0.5", MacAddress: "02:42:ac:12:00:05" } } },
    },
  ],
});

const netbird = fixtureClient({
  "/api/peers": [{ id: "peer-gw", name: "gw-luna", ip: "100.90.0.5", dns_label: "gw-luna", connected: true, groups: [{ id: "g-gw", name: "gateways" }], network_addresses: [{ net_ip: "10.10.10.21/24", mac: GW_MAC }] }],
  "/api/groups": [
    { id: "g-gw", name: "gateways", issued: "api" },
    { id: "g-admins", name: "admins", issued: "jwt" },
  ],
  "/api/policies": [
    {
      id: "p1",
      name: "admins-lan",
      enabled: true,
      rules: [{ id: "r1", enabled: true, action: "accept", protocol: "all", sources: [{ id: "g-admins", name: "admins" }], destinations: [], destinationResource: { id: "res" } }],
    },
  ],
  "/api/routes": [],
  "/api/networks": [{ id: "n1", name: "home" }],
  "/api/networks/n1/resources": [{ id: "res", name: "home-lan", type: "subnet", address: "10.10.10.0/24" }],
  "/api/networks/n1/routers": [{ id: "ro", peer: "peer-gw", enabled: true }],
});

const tailscale = fixtureClient({
  "/api/v2/tailnet/-/devices?fields=all": {
    devices: [
      { nodeId: "nLUNA", name: "dockge-luna.tailnet.example.", hostname: "dockge-luna", addresses: ["100.101.1.20"], tags: ["tag:dockge"], lastSeen: "2026-11-07T11:59:00Z" },
      { nodeId: "nPHONE", name: "phone.tailnet.example", hostname: "phone", addresses: ["100.101.1.99"] },
    ],
  },
  "/api/v2/tailnet/-/acl": '{ "grants": [ { "src": ["autogroup:member"], "dst": ["tag:dockge"], "ip": ["tcp:443"] }, ], }',
});

const kubernetes = fixtureClient({
  "/api/v1/nodes": { items: [{ metadata: { name: "eq-1" }, status: { addresses: [{ type: "InternalIP", address: "10.10.10.31" }], conditions: [{ type: "Ready", status: "True" }] } }] },
  "/api/v1/services": { items: [{ metadata: { name: "proxmox-luna", namespace: "tailscale-system", annotations: { "tailscale.com/tailnet-fqdn": "luna.tailnet.example" } } }] },
  "/apis/gateway.networking.k8s.io/v1/httproutes": {
    items: [
      {
        metadata: { name: "neo4j-internal", namespace: "database", labels: { "app.kubernetes.io/name": "neo4j" } },
        spec: { hostnames: ["neo4j.eq.example.test"], parentRefs: [{ name: "internal", namespace: "network" }] },
      },
    ],
  },
  "/apis/gateway.networking.k8s.io/v1/gateways": { items: [{ metadata: { name: "internal", namespace: "network" }, status: { addresses: [{ value: "10.10.10.250" }] } }] },
});

async function collectAll(options: { proxmoxPartial?: boolean } = {}): Promise<SourceResult[]> {
  return Promise.all([
    collectUnifi(unifi),
    collectProxmox([{ target: { name: "luna", site: "home" }, client: proxmoxLuna }, ...(options.proxmoxPartial ? [{ target: { name: "skystar", site: "skystar" }, client: proxmoxDown }] : [])]),
    collectDocker([{ target: { name: "luna", host: "dockge-luna.example.test", site: "home" }, client: dockerLuna }]),
    collectNetbird(netbird),
    collectTailscale(tailscale, { tailnet: "-" }),
    collectKubernetes(kubernetes, { cluster: "equestria", site: "home" }),
  ]);
}

const node = (plan: GraphPlan, label: string, key: string) => plan.nodes.find(n => n.label === label && n.key === key);
const rel = (plan: GraphPlan, type: string, from: string, to: string) => plan.rels.find(r => r.type === type && r.from.key === from && r.to.key === to);

describe("source parsing details", () => {
  it("reads a Proxmox netN line for MAC and static IP", () => {
    assert.deepEqual(parseNetConfig("virtio=BC:24:11:AA:BB:CC,bridge=vmbr0,tag=20"), { mac: "bc:24:11:aa:bb:cc", ip: undefined, name: undefined, bridge: "vmbr0", tag: 20 });
    assert.equal(parseNetConfig("name=eth0,hwaddr=BC:24:11:AA:BB:CC,ip=10.10.10.5/24").ip, "10.10.10.5");
  });
  it("reads Traefik Host() rules", () => {
    assert.deepEqual(traefikHosts("Host(`a.example.test`) || Host(`b.example.test`, `c.example.test`) && PathPrefix(`/x`)"), ["a.example.test", "b.example.test", "c.example.test"]);
  });
});

describe("buildGraph: the schema's example, all six sources", async () => {
  const { plan, machines } = buildGraph(await collectAll(), { homeSite: "home" });
  const lxcId = `mac:${LXC_MAC.toLowerCase()}`;
  const gwId = `mac:${GW_MAC}`;

  it("joins the LXC across UniFi, Proxmox, Docker and Tailscale, and the gateway container across UniFi, Docker and NetBird", () => {
    assert.deepEqual(node(plan, "Machine", lxcId)?.props.sources, ["docker", "proxmox", "tailscale", "unifi"]);
    assert.equal(node(plan, "Machine", lxcId)?.props.kind, "lxc");
    assert.equal(node(plan, "Machine", lxcId)?.props.name, "dockge-luna");
    assert.deepEqual(node(plan, "Machine", gwId)?.props.sources, ["docker", "netbird", "unifi"]);
    assert.equal(node(plan, "Machine", gwId)?.props.kind, "container");
  });

  it("hosts the container on the LXC and the LXC on the Proxmox node", () => {
    const hostNode = machines.find(m => m.observations.some(o => o.key === "proxmox:node:luna"))!;
    assert.ok(rel(plan, "HOSTED_ON", gwId, lxcId));
    assert.ok(rel(plan, "HOSTED_ON", lxcId, hostNode.machineId));
  });

  it("gives the LXC one LAN interface (UniFi and Proxmox agree) and one tailnet interface (Proxmox's tailscale0 and Tailscale agree)", () => {
    const ifaces = plan.rels.filter(r => r.type === "HAS_INTERFACE" && r.from.key === lxcId).map(r => r.to.key);
    assert.deepEqual(ifaces.sort(), [`tailscale:tailnet:100.101.1.20`, `unifi:lan:${LXC_MAC.toLowerCase()}`]);
    const lan = node(plan, "Interface", `unifi:lan:${LXC_MAC.toLowerCase()}`)!;
    assert.deepEqual(lan.props.sources, ["proxmox", "unifi"]);
    assert.equal(lan.source, "unifi");
    assert.equal(lan.firstSeen, "2026-01-01T00:00:00.000Z");
    assert.ok(rel(plan, "ON", lan.key, "unifi:lan"));
    assert.ok(rel(plan, "MEMBER_OF", "tailscale:tailnet:100.101.1.20", "tailscale:tag:dockge"));
  });

  it("wires UniFi topology: device uplinks, a wired client's port, a Wi-Fi client's AP", () => {
    assert.deepEqual(rel(plan, "UPLINK", SWITCH, GATEWAY)?.props, { speed: 10000, port: 2 });
    assert.deepEqual(rel(plan, "UPLINK", `unifi:lan:${LXC_MAC.toLowerCase()}`, `${SWITCH}:7`)?.props, { port: 7 });
    assert.deepEqual(rel(plan, "ASSOCIATED", "unifi:iot:aa:bb:cc:00:00:50", AP)?.props, { essid: "home-iot", band: "5GHz" });
    const sw = node(plan, "Machine", `mac:${SWITCH}`)!;
    assert.deepEqual(sw.extraLabels, ["Device"]);
    assert.equal(sw.props.type, "switch");
    assert.equal(node(plan, "Network", "unifi:iot")?.props.vlan, 20);
  });

  it("draws NetBird reach to the LAN network by CIDR, and the router's route to it", () => {
    assert.deepEqual(rel(plan, "REACHES", "netbird:admins", "unifi:lan")?.props, { via: "netbird:r1", ports: ["*"] });
    assert.ok(rel(plan, "ADVERTISES", `netbird:netbird:100.90.0.5`, "netbird:10.10.10.0/24"));
    assert.ok(rel(plan, "ROUTES_TO", "netbird:10.10.10.0/24", "unifi:lan"));
  });

  it("draws Tailscale grants as REACHES between groups", () => {
    const reach = plan.rels.find(r => r.type === "REACHES" && r.from.key === "tailscale:autogroup:member");
    assert.equal(reach?.to.key, "tailscale:tag:dockge");
    assert.deepEqual(reach?.props.ports, ["tcp:443"]);
  });

  it("observes apps from HTTPRoutes and Traefik labels, with their entry points", () => {
    assert.ok(rel(plan, "SERVED_BY", "neo4j", "gateway:network/internal"));
    assert.equal(node(plan, "EntryPoint", "gateway:network/internal")?.props.address, "10.10.10.250");
    assert.ok(rel(plan, "SERVED_BY", "backrest", "traefik:luna"));
    assert.ok(rel(plan, "RUNS", lxcId, "backrest"), "a bridge-network app runs on the Docker host, which is the LXC");
  });

  it("leaves a Kubernetes node that no UniFi client has the IP of as joined: false", () => {
    const eq = machines.find(m => m.observations.some(o => o.key === "kubernetes:node:eq-1"))!;
    assert.equal(eq.joined, false);
    assert.equal(node(plan, "Machine", eq.machineId)?.props.joined, false);
  });

  it("leaves an unmatched Tailscale phone separate, and does not draw a docker0 interface", () => {
    assert.equal(node(plan, "Machine", "tailscale:nPHONE")?.props.joined, false);
    assert.ok(!plan.nodes.some(n => n.label === "Interface" && (n.props.ips as string[] | undefined)?.includes("172.17.0.1")));
  });

  it("never leaves an edge without both ends", () => {
    const keys = new Set(plan.nodes.map(n => `${n.label}|${n.key}`));
    const devices = new Set(plan.nodes.filter(n => n.extraLabels?.includes("Device")).map(n => n.props.mac));
    for (const r of plan.rels) {
      for (const end of [r.from, r.to]) assert.ok(end.label === "Device" ? devices.has(end.key) : keys.has(`${end.label}|${end.key}`), `${r.type} ${end.label} ${end.key}`);
    }
  });
});

describe("buildGraph: failures", () => {
  it("reports one Proxmox host down as a partial source, keeping the others' data", async () => {
    const results = await collectAll({ proxmoxPartial: true });
    const proxmox = results.find(r => r.source === "proxmox")!;
    assert.deepEqual(proxmox.errors, ["proxmox skystar: connect ETIMEDOUT"]);
    assert.ok(proxmox.machines.length > 0);
  });

  it("fails the source outright when every target is down", async () => {
    await assert.rejects(collectProxmox([{ target: { name: "skystar", site: "skystar" }, client: proxmoxDown }]), /ETIMEDOUT/);
  });

  it("without UniFi, places LAN interfaces on last run's UniFi networks", async () => {
    const results = (await collectAll()).filter(r => r.source !== "unifi");
    const { plan } = buildGraph(results, { homeSite: "home", fallbackHomeNetworks: [{ networkId: "unifi:lan", cidr: "10.10.10.0/24" }] });
    assert.ok(node(plan, "Interface", `unifi:lan:${LXC_MAC.toLowerCase()}`));
    assert.equal(node(plan, "Network", "unifi:lan")?.props.cidr, "10.10.10.0/24");
    const without = buildGraph(results, { homeSite: "home" }).plan;
    assert.ok(node(without, "Interface", `site-lan:home:${LXC_MAC.toLowerCase()}`));
  });
});

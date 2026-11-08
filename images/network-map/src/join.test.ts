/**
 * node --test images/network-map/src/join.test.ts
 *
 * The machine join, on fixtures shaped like docs/network-map/schema.md's
 * 2026-11-07 inventory: a Proxmox LXC with its NetBird gateway container,
 * both also UniFi clients by MAC; a Tailscale device joined through the LXC's
 * tailscale0; and the duplicate hostnames that must not merge.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type JoinContext, joinMachines } from "./join.ts";
import type { MachineObservation } from "./model.ts";
import { TAILNET_NETWORK_ID } from "./model.ts";

const ctx: JoinContext = { homeSite: "home", homeCidrs: ["10.10.10.0/24"], aliases: [] };
const LXC_MAC = "bc:24:11:00:00:20";
const GW_MAC = "02:42:0a:0a:0a:15";

const obs = (o: Partial<MachineObservation> & Pick<MachineObservation, "source" | "key">): MachineObservation => ({ name: o.key, hostnames: [], interfaces: [], ...o });

const unifiClient = (mac: string, ip: string, hostname: string) =>
  obs({ source: "unifi", key: `unifi:client:${mac}`, kind: "client", hostnames: [hostname], interfaces: [{ network: { networkId: "unifi:lan" }, mac, ips: [ip] }] });

const lxc = obs({
  source: "proxmox",
  key: "proxmox:luna/120",
  kind: "lxc",
  hostnames: ["dockge-luna"],
  hostedOn: "proxmox:node:luna",
  interfaces: [
    { network: { lan: true, site: "home" }, mac: LXC_MAC, ips: ["10.10.10.20"], nic: "eth0" },
    { network: { networkId: TAILNET_NETWORK_ID }, ips: ["100.101.1.20"], nic: "tailscale0" },
  ],
});
const gatewayContainer = obs({
  source: "docker",
  key: "docker:luna/netbird-gateway",
  kind: "container",
  hostnames: ["netbird-gateway"],
  hostedOn: "docker:host:luna",
  interfaces: [{ network: { lan: true, site: "home" }, mac: GW_MAC, ips: ["10.10.10.21"] }],
});
const gatewayPeer = obs({
  source: "netbird",
  key: "netbird:peer-gw-luna",
  kind: "client",
  hostnames: ["gw-luna"],
  interfaces: [
    { network: { networkId: "netbird:netbird" }, ips: ["100.90.0.5"] },
    { network: { lan: true }, mac: GW_MAC, ips: ["10.10.10.21"] },
  ],
});
const dockerHost = obs({ source: "docker", key: "docker:host:luna", hostnames: ["dockge-luna"] });
const tailscaleLuna = obs({
  source: "tailscale",
  key: "tailscale:nLUNA",
  kind: "client",
  hostnames: ["dockge-luna"],
  tailnetFqdns: ["dockge-luna.tailnet.example"],
  interfaces: [{ network: { networkId: TAILNET_NETWORK_ID }, ips: ["100.101.1.20", "fd7a:115c:a1e0::20"] }],
});

const machineOf = (machines: ReturnType<typeof joinMachines>, key: string) => machines.find(m => m.observations.some(o => o.key === key))!;

describe("joinMachines: the schema's LXC + NetBird gateway example", () => {
  const machines = joinMachines([tailscaleLuna, gatewayPeer, unifiClient(GW_MAC, "10.10.10.21", "netbird-gateway"), dockerHost, lxc, gatewayContainer, unifiClient(LXC_MAC, "10.10.10.20", "dockge-luna")], ctx);

  it("makes two machines: the LXC and its gateway container", () => {
    assert.equal(machines.length, 2);
  });

  it("joins the LXC's UniFi client by MAC, its Docker host by hostname and its Tailscale device by tailscale0's 100.x", () => {
    const m = machineOf(machines, "proxmox:luna/120");
    assert.deepEqual(m.observations.map(o => o.key).sort(), ["docker:host:luna", "proxmox:luna/120", "tailscale:nLUNA", `unifi:client:${LXC_MAC}`].sort());
    assert.equal(m.machineId, `mac:${LXC_MAC}`);
    assert.equal(m.joined, true);
    assert.deepEqual([...m.matchedBy].sort(), ["hostname", "mac", "tailnet"]);
  });

  it("joins the gateway container, its NetBird peer and its UniFi client by the container's MAC", () => {
    const m = machineOf(machines, "docker:luna/netbird-gateway");
    assert.deepEqual(
      m.observations.map(o => o.source),
      ["unifi", "docker", "netbird"],
    );
    assert.equal(m.machineId, `mac:${GW_MAC}`);
    assert.deepEqual(m.matchedBy, ["mac", "mac"]);
  });

  it("is independent of input order", () => {
    const reversed = joinMachines(
      [unifiClient(LXC_MAC, "10.10.10.20", "dockge-luna"), gatewayContainer, lxc, dockerHost, unifiClient(GW_MAC, "10.10.10.21", "netbird-gateway"), gatewayPeer, tailscaleLuna].reverse(),
      ctx,
    );
    assert.deepEqual(reversed.map(m => m.machineId).sort(), machines.map(m => m.machineId).sort());
  });
});

describe("joinMachines: LAN IP", () => {
  it("joins a Kubernetes node to the UniFi client by IP, on the home site", () => {
    const node = obs({ source: "kubernetes", key: "kubernetes:node:eq-1", hostnames: ["eq-1"], interfaces: [{ network: { lan: true, site: "home" }, ips: ["10.10.10.31"] }] });
    const [m, ...rest] = joinMachines([node, unifiClient("bc:24:11:00:00:31", "10.10.10.31", "talos-abc")], ctx);
    assert.equal(rest.length, 0);
    assert.equal(m.machineId, "mac:bc:24:11:00:00:31");
    assert.deepEqual(m.matchedBy, ["lan-ip"]);
  });

  it("does not join the same IP on two different sites", () => {
    const remote = obs({ source: "proxmox", key: "proxmox:skystar/101", interfaces: [{ network: { lan: true, site: "skystar" }, ips: ["10.10.10.31"] }] });
    assert.equal(joinMachines([remote, unifiClient("bc:24:11:00:00:31", "10.10.10.31", "x")], ctx).length, 2);
  });

  it("places a site-less address (a NetBird peer's NIC) on the home site only inside a home CIDR", () => {
    const peer = (ip: string) => obs({ source: "netbird", key: `netbird:${ip}`, interfaces: [{ network: { lan: true }, ips: [ip] }] });
    assert.equal(joinMachines([peer("10.10.10.40"), unifiClient("bc:24:11:00:00:40", "10.10.10.40", "a")], ctx).length, 1);
    assert.equal(joinMachines([peer("192.168.1.40"), obs({ source: "proxmox", key: "p", interfaces: [{ network: { lan: true, site: "home" }, ips: ["192.168.1.40"] }] })], ctx).length, 2);
  });

  it("never joins by docker0's 172.17.0.1", () => {
    const a = obs({ source: "netbird", key: "netbird:a", interfaces: [{ network: { lan: true }, ips: ["172.17.0.1"] }] });
    const b = obs({ source: "proxmox", key: "proxmox:b", interfaces: [{ network: { lan: true, site: "home" }, ips: ["172.17.0.1"] }] });
    assert.equal(joinMachines([a, b], { ...ctx, homeCidrs: ["172.16.0.0/12"] }).length, 2);
  });
});

describe("joinMachines: hostnames", () => {
  const appleTv = (n: number) => obs({ source: "tailscale", key: `tailscale:tv${n}`, kind: "client", hostnames: ["apple-tv"], interfaces: [{ network: { networkId: TAILNET_NETWORK_ID }, ips: [`100.64.0.${n}`] }] });

  it("does not merge five Tailscale devices that share a hostname, nor any of them into the UniFi one", () => {
    const machines = joinMachines([1, 2, 3, 4, 5].map(appleTv).concat(unifiClient("aa:bb:cc:00:00:01", "10.10.10.50", "apple-tv")), ctx);
    assert.equal(machines.length, 6);
    assert.ok(machines.every(m => !m.joined));
  });

  it("joins a unique hostname across sources, but never two of one source", () => {
    const a = obs({ source: "netbird", key: "netbird:x", hostnames: ["builder"] });
    const b = obs({ source: "tailscale", key: "tailscale:x", hostnames: ["builder"] });
    assert.equal(joinMachines([a, b], ctx).length, 1);
    const c = obs({ source: "netbird", key: "netbird:y", hostnames: ["solo"] });
    const d = obs({ source: "netbird", key: "netbird:z", hostnames: ["Solo"] });
    assert.equal(joinMachines([c, d], ctx).length, 2);
  });

  it("drops a MAC one source reports twice", () => {
    const a = obs({ source: "netbird", key: "netbird:a", interfaces: [{ network: { lan: true }, mac: "02:42:ac:11:00:02", ips: [] }] });
    const b = obs({ source: "netbird", key: "netbird:b", interfaces: [{ network: { lan: true }, mac: "02:42:ac:11:00:02", ips: [] }] });
    const machines = joinMachines([a, b], ctx);
    assert.equal(machines.length, 2);
    assert.deepEqual(machines.map(m => m.machineId).sort(), ["netbird:a", "netbird:b"]);
  });
});

describe("joinMachines: tailnet aliases", () => {
  it("joins a Tailscale device to a Proxmox node by a Kubernetes egress tailnet-fqdn", () => {
    const node = obs({ source: "proxmox", key: "proxmox:node:luna", kind: "physical", hostnames: ["luna"] });
    // A UniFi client called `luna` too would make the plain hostname join ambiguous; the alias still lands on the host.
    const ts = obs({ source: "tailscale", key: "tailscale:nHOST", kind: "client", hostnames: ["luna-pve"], tailnetFqdns: ["luna.tailnet.example"] });
    const [m, ...rest] = joinMachines([node, ts], { ...ctx, aliases: [{ fqdn: "luna.tailnet.example", hostname: "luna" }] });
    assert.equal(rest.length, 0);
    assert.deepEqual(m.matchedBy, ["tailnet"]);
    assert.equal(m.machineId, "proxmox:node:luna");
  });

  it("joins by an exact observation alias (a Docker host's *-tailscale Traefik rule)", () => {
    const host = obs({ source: "docker", key: "docker:host:as", hostnames: ["dockge-as"] });
    const ts = obs({ source: "tailscale", key: "tailscale:nAS", hostnames: ["internal-as"], tailnetFqdns: ["internal-as.tailnet.example"] });
    assert.equal(joinMachines([host, ts], { ...ctx, aliases: [{ fqdn: "internal-as.tailnet.example", observationKey: "docker:host:as" }] }).length, 1);
  });

  it("leaves an unmatched device alone, joined: false", () => {
    const [m] = joinMachines([obs({ source: "tailscale", key: "tailscale:lonely", hostnames: ["phone"] })], ctx);
    assert.equal(m.joined, false);
    assert.equal(m.machineId, "tailscale:lonely");
  });
});

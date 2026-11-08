/**
 * node --test images/network-map/declared/zones.test.ts
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { DeclaredPlan } from "./plan.ts";
import { addZones, parseZones, UNIFI_ZONES } from "./zones.ts";

const all = (extra = "") => `zones:\n  Internal: [Home]\n  External: [Internet 1]\n  Gateway: []\n  Vpn: []\n  Hotspot: [Guest]\n  Dmz: []\n${extra}`;

describe("parseZones", () => {
  it("reads the checked-in file: all six zones, each network once", async () => {
    const zones = parseZones(await readFile(new URL("./unifi-zones.yaml", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(zones), [...UNIFI_ZONES]);
    assert.deepEqual(zones.External, ["Internet 1", "Internet 2"]);
  });

  it("refuses an unknown zone, a missing one, a non-list, and a network in two zones", () => {
    assert.throws(() => parseZones(all("  Lab: [x]\n")), /unknown zone Lab/);
    assert.throws(() => parseZones(all().replace("  Dmz: []\n", "")), /zone Dmz is missing/);
    assert.throws(() => parseZones(all().replace("Vpn: []", "Vpn: wireguard")), /zone Vpn must be a list/);
    assert.throws(() => parseZones(all().replace("Hotspot: [Guest]", "Hotspot: [Home]")), /Home is in both Internal and Hotspot/);
    assert.throws(() => parseZones("other: 1\n"), /no `zones` map/);
  });
});

describe("addZones", () => {
  it("makes every Zone, a named UniFi Network per listed network, and IN_ZONE between them", () => {
    const plan = new DeclaredPlan();
    addZones(plan, parseZones(all()));
    const { nodes, rels } = plan.finish();
    assert.equal(nodes.filter(n => n.label === "Zone").length, 6);
    assert.deepEqual(nodes.find(n => n.key === "unifi:name:Internet 1")?.props, { system: "unifi", name: "Internet 1" });
    assert.deepEqual(
      rels.map(r => `${r.from.key}>${r.to.key}`),
      ["unifi:name:Home>unifi-fw:Internal", "unifi:name:Internet 1>unifi-fw:External", "unifi:name:Guest>unifi-fw:Hotspot"],
    );
  });
});

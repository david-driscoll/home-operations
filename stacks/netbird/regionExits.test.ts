/**
 * node --test stacks/netbird/regionExits.test.ts
 *
 * The OpenBao payload at `third-party-tokens/mullvad/region-exits`. Its
 * property names are read by the region exits' ExternalSecret
 * (kubernetes/apps/region-exits), which spells them by hand.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MULLVAD_DEVICE_SLOTS, REGION_EXIT_DEFAULTS, REGION_EXIT_USER_GROUPS, REGION_EXITS, regionExitBaoData, regionExitNetbird } from "./regionExits.ts";

describe("regionExitBaoData", () => {
  it("writes <name>_private_key and <name>_address per region exit, and conceals only the keys", () => {
    const payload = regionExitBaoData([
      { name: "spitfire", privateKey: "priv-s", address: "10.64.1.2/32" },
      { name: "soarin", privateKey: "priv-o", address: "10.64.1.3/32" },
    ]);
    assert.deepEqual(payload.data, {
      spitfire_private_key: "priv-s",
      spitfire_address: "10.64.1.2/32",
      soarin_private_key: "priv-o",
      soarin_address: "10.64.1.3/32",
    });
    assert.deepEqual(payload.concealedFields, ["spitfire_private_key", "soarin_private_key"]);
  });
});

describe("REGION_EXIT_DEFAULTS", () => {
  it("lists all five Wonderbolts, spitfire first, with their default regions in gluetun's servers.json names (§A)", () => {
    assert.deepEqual(REGION_EXIT_DEFAULTS, [
      { name: "spitfire", defaultCountry: "USA" },
      { name: "soarin", defaultCountry: "Canada" },
      { name: "fleetfoot", defaultCountry: "UK" },
      { name: "misty-fly", defaultCountry: "Germany" },
      { name: "high-winds", defaultCountry: "Japan" },
    ]);
  });

  it("uses every one of the Mullvad account's five device slots, and no more", () => {
    assert.equal(MULLVAD_DEVICE_SLOTS, 5);
    assert.equal(REGION_EXITS.length, MULLVAD_DEVICE_SLOTS);
    assert.equal(new Set(REGION_EXITS).size, REGION_EXITS.length, "names are unique");
  });

  it("gives every region exit a distinct route, setup-key property and OpenBao property", () => {
    const routes = REGION_EXITS.map(name => regionExitNetbird(name).route);
    assert.deepEqual(routes, ["region-spitfire", "region-soarin", "region-fleetfoot", "region-misty-fly", "region-high-winds"]);
    const props = REGION_EXITS.map(name => regionExitNetbird(name).setupKeyProperty);
    assert.equal(new Set(props).size, 5);
    const bao = regionExitBaoData(REGION_EXITS.map(name => ({ name, privateKey: "k", address: "a" })));
    assert.equal(Object.keys(bao.data).length, 10);
    assert.ok("misty-fly_private_key" in bao.data && "high-winds_address" in bao.data);
  });
});

describe("regionExitNetbird", () => {
  it("names spitfire's NetBird objects as docs/plans/region-exits.md §C2 spells them", () => {
    assert.deepEqual(regionExitNetbird("spitfire"), {
      deviceGroup: "region-exit-spitfire",
      setupKey: "region-exit-spitfire",
      setupKeyProperty: "region_exit_spitfire",
      route: "region-spitfire",
    });
  });

  it("turns dashes into underscores in the setup-key property, as k8s_router does", () => {
    assert.equal(regionExitNetbird("misty-fly").setupKeyProperty, "region_exit_misty_fly");
  });

  it("offers the region exits to family, friends and admins, never media-managers", () => {
    assert.deepEqual([...REGION_EXIT_USER_GROUPS].sort(), ["admins", "family", "friends"]);
  });
});

describe("kubernetes/apps/region-exits", () => {
  const app = (file: string) => readFileSync(new URL(`../../kubernetes/apps/region-exits/app/${file}`, import.meta.url), "utf8");

  it("defaults each region exit to the same region as REGION_EXIT_DEFAULTS", () => {
    const kustomization = app("kustomization.yaml");
    for (const { name, defaultCountry } of REGION_EXIT_DEFAULTS) {
      const block = new RegExp(`name: region-exit-${name}-defaults\\s+literals:\\s+- SERVER_COUNTRIES=(\\S+)`).exec(kustomization);
      assert.equal(block?.[1], defaultCountry, name);
    }
  });

  it("reads every region exit's OpenBao properties under the names stacks/netbird writes", () => {
    const externalSecrets = app("externalsecret.yaml");
    for (const name of REGION_EXITS) {
      for (const property of [`${name}_private_key`, `${name}_address`, regionExitNetbird(name).setupKeyProperty]) {
        assert.ok(externalSecrets.includes(`property: ${property}\n`), property);
      }
    }
  });
});

/**
 * What stacks/netbird writes to OpenBao `third-party-tokens/mullvad/region-exits`
 * (docs/plans/region-exits.md §C1): per region exit, the WireGuard private key
 * and tunnel address gluetun needs. The region exits' ExternalSecret reads these
 * property names by hand; rename one only with the other.
 *
 * The pure half: region-exit-devices.ts declares the devices and the write.
 * Type-only imports, so `node --test` covers it.
 */
import type * as pulumi from "@pulumi/pulumi";

/** The standalone Mullvad account's device limit; the region exits use every slot (§A). */
export const MULLVAD_DEVICE_SLOTS = 5;

export interface RegionExitDefault {
  name: string;
  /** Its default region, in gluetun's servers.json spelling ("USA", "UK"). kubernetes/apps/region-exits repeats it as SERVER_COUNTRIES. */
  defaultCountry: string;
}

/**
 * The region exits, the one list every Mullvad device, NetBird group, setup
 * key, route and policy is generated from (docs/plans/region-exits.md §A).
 * spitfire stays first: it was the P1 prototype, and its resource names are
 * already live. Append, never rename: a renamed route collides with its old
 * self on create-before-delete.
 */
export const REGION_EXIT_DEFAULTS: readonly RegionExitDefault[] = [
  { name: "spitfire", defaultCountry: "USA" },
  { name: "soarin", defaultCountry: "Canada" },
  { name: "fleetfoot", defaultCountry: "UK" },
  { name: "misty-fly", defaultCountry: "Germany" },
  { name: "high-winds", defaultCountry: "Japan" },
];

/** The region exits' names, each with a Mullvad device. */
export const REGION_EXITS: readonly string[] = REGION_EXIT_DEFAULTS.map(exit => exit.name);
if (REGION_EXITS.length > MULLVAD_DEVICE_SLOTS) throw new Error(`${REGION_EXITS.length} region exits, but the Mullvad account has ${MULLVAD_DEVICE_SLOTS} device slots`);

/**
 * The user groups the region exits are offered to (§C2): the `region-*`
 * routes' distribution groups and the region-exit policies' sources.
 * media-managers is left out on purpose.
 */
export const REGION_EXIT_USER_GROUPS = ["admins", "family", "friends"] as const;

export interface RegionExitNetbirdNames {
  /** The device group the region exit's netbird sidecar joins. */
  deviceGroup: string;
  /** The ephemeral, reusable setup key that auto-joins it. */
  setupKey: string;
  /** Its property in OpenBao `third-party-tokens/netbird/setup-keys`, read by the region exit's ExternalSecret. */
  setupKeyProperty: string;
  /** The `0.0.0.0/0` route the region exit serves. Never rename it in one step: same-prefix routes collide on create-before-delete. */
  route: string;
}

/** The NetBird objects stacks/netbird declares for one region exit (docs/plans/region-exits.md §C2). */
export function regionExitNetbird(name: string): RegionExitNetbirdNames {
  return {
    deviceGroup: `region-exit-${name}`,
    setupKey: `region-exit-${name}`,
    setupKeyProperty: `region_exit_${name.replaceAll("-", "_")}`,
    route: `region-${name}`,
  };
}

/** Where the devices' keys and addresses go, under the `secrets` mount. */
export const REGION_EXITS_BAO_PATH = "third-party-tokens/mullvad/region-exits";

export interface RegionExitDeviceSecret {
  name: string;
  privateKey: pulumi.Input<string>;
  address: pulumi.Input<string>;
}

export interface RegionExitBaoData {
  data: Record<string, pulumi.Input<string>>;
  concealedFields: string[];
}

export function regionExitBaoData(devices: RegionExitDeviceSecret[]): RegionExitBaoData {
  const data: Record<string, pulumi.Input<string>> = {};
  const concealedFields: string[] = [];
  for (const device of devices) {
    data[`${device.name}_private_key`] = device.privateKey;
    data[`${device.name}_address`] = device.address;
    concealedFields.push(`${device.name}_private_key`);
  }
  return { data, concealedFields };
}

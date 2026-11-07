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

/**
 * The region exits with a Mullvad device. spitfire alone for the P1 prototype;
 * soarin, fleetfoot, misty-fly and high-winds join in P3, which uses all five
 * device slots on the account.
 */
export const REGION_EXITS = ["spitfire"] as const;

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

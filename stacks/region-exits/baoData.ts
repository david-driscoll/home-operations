/**
 * What stacks/region-exits writes to OpenBao `third-party-tokens/mullvad/region-exits`
 * (docs/plans/region-exits.md §C1): per region exit, the WireGuard private key
 * and tunnel address gluetun needs. The region exits' ExternalSecret reads these
 * property names by hand; rename one only with the other.
 */

/**
 * The region exits with a Mullvad device. spitfire alone for the P1 prototype;
 * soarin, fleetfoot, misty-fly and high-winds join in P3, which uses all five
 * device slots on the account.
 */
export const REGION_EXITS = ["spitfire"] as const;

export interface RegionExitDeviceSecret<T> {
  name: string;
  privateKey: T;
  address: T;
}

export interface RegionExitBaoData<T> {
  data: Record<string, T>;
  concealedFields: string[];
}

export function regionExitBaoData<T>(devices: RegionExitDeviceSecret<T>[]): RegionExitBaoData<T> {
  const data: Record<string, T> = {};
  const concealedFields: string[] = [];
  for (const device of devices) {
    data[`${device.name}_private_key`] = device.privateKey;
    data[`${device.name}_address`] = device.address;
    concealedFields.push(`${device.name}_private_key`);
  }
  return { data, concealedFields };
}

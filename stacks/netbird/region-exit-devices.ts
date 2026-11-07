/**
 * Section 13 of stacks/netbird: the region exits' Mullvad devices
 * (docs/plans/region-exits.md §C1, ADR 0005). regionExits.ts holds the pure
 * half; this declares:
 *
 *   1. one `MullvadDevice` per region exit, registered on the standalone
 *      Mullvad account (GlobalResources.mullvadCredential);
 *   2. each device's private key and tunnel address in OpenBao
 *      `third-party-tokens/mullvad/region-exits`, where the region exit's
 *      ExternalSecret hands them to gluetun.
 *
 * Destroying or replacing a device revokes it on Mullvad, freeing its slot.
 */
import * as pulumi from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import type { GlobalResources } from "components/globals.ts";
import { MullvadDevice } from "dynamic/mullvad/MullvadDevice.ts";
import { REGION_EXITS, REGION_EXITS_BAO_PATH, regionExitBaoData } from "./regionExits.ts";

export interface RegionExitDeviceOutputs {
  deviceId: pulumi.Output<string>;
  deviceName: pulumi.Output<string>;
  ipv4Address: pulumi.Output<string>;
}

/** Declares every region exit's device and the OpenBao write; returns each device's identity, by region exit. */
export function declareRegionExitDevices(globals: GlobalResources): Record<string, RegionExitDeviceOutputs> {
  // Secret whatever the path's concealed_fields say: it was written by hand.
  const accountNumber = pulumi.secret(globals.mullvadCredential.account);

  const devices = REGION_EXITS.map(name => ({ name, device: new MullvadDevice(`mullvad-${name}`, { accountNumber, label: name }) }));

  const payload = regionExitBaoData(devices.map(({ name, device }) => ({ name, privateKey: device.privateKey, address: device.ipv4Address })));

  baoKvSecret(
    "mullvad-region-exits",
    {
      mount: "secrets",
      path: REGION_EXITS_BAO_PATH,
      data: payload.data,
      concealedFields: payload.concealedFields,
      customMetadata: baoProvenance({ source_title: "Mullvad region exit devices (stacks/netbird)" }),
    },
    { provider: globals.baoProvider },
  );

  return Object.fromEntries(devices.map(({ name, device }) => [name, { deviceId: device.deviceId, deviceName: device.deviceName, ipv4Address: device.ipv4Address }]));
}

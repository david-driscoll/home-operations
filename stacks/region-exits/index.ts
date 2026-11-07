/**
 * Region exits' Mullvad devices (docs/plans/region-exits.md §C1, ADR 0005).
 *
 * One `MullvadDevice` per region exit, registered on the standalone Mullvad
 * account (GlobalResources.mullvadCredential). Each device's private key and
 * tunnel address go to OpenBao `third-party-tokens/mullvad/region-exits`, where
 * the region exit's ExternalSecret hands them to gluetun.
 *
 * Destroying or replacing a device revokes it on Mullvad, freeing its slot.
 */
import * as pulumi from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import { GlobalResources } from "components/globals.ts";
import { MullvadDevice } from "dynamic/mullvad/MullvadDevice.ts";
import { REGION_EXITS, regionExitBaoData } from "./baoData.ts";

const globals = new GlobalResources({}, {});
// Secret whatever the path's concealed_fields say: it was written by hand.
const accountNumber = pulumi.secret(globals.mullvadCredential.account);

const devices = REGION_EXITS.map(name => ({ name, device: new MullvadDevice(`mullvad-${name}`, { accountNumber, label: name }) }));

const payload = regionExitBaoData(devices.map(({ name, device }) => ({ name, privateKey: device.privateKey, address: device.ipv4Address })));

baoKvSecret(
  "mullvad-region-exits",
  {
    mount: "secrets",
    path: "third-party-tokens/mullvad/region-exits",
    data: payload.data,
    concealedFields: payload.concealedFields,
    customMetadata: baoProvenance({ source_title: "Mullvad region exit devices (stacks/region-exits)" }),
  },
  { provider: globals.baoProvider },
);

export const regionExitDevices = Object.fromEntries(devices.map(({ name, device }) => [name, { deviceId: device.deviceId, deviceName: device.deviceName, ipv4Address: device.ipv4Address }]));

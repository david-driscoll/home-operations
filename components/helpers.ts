import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { Output, output } from "@pulumi/pulumi";
import { GetDeviceResult } from "@pulumi/tailscale";

export function removeUndefinedProperties<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.filter((item) => item !== undefined).map((item) => removeUndefinedProperties(item)) as T;
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedProperties(v)] as const),
    ) as T;
  }
  return obj;
}

export function awaitOutput<T>(output: Output<T>) {
  return new Promise<T>((resolve) => output.apply(resolve));
}

export function getTailscaleDevice(device: Output<GetDeviceResult>) {
  return {
    hostname: device.hostname!,
    name: device.name!,
    nodeId: device.nodeId!,
    tags: device.tags!,
    id: device.id!,
    addresses: device.addresses!,
  };
}

export function getTailscaleSection(device: Output<GetDeviceResult>): OnePasswordItemSectionInput {
  return {
    fields: {
      hostname: {
        type: TypeEnum.String,
        value: device.hostname,
      },
      name: {
        type: TypeEnum.String,
        value: device.name!,
      },
      tags: {
        type: TypeEnum.String,
        value: device.tags.apply((z) => z.join(","))!,
      },
      addresses: {
        type: TypeEnum.String,
        value: device.addresses.apply((z) => z.join(",")),
      },
    },
  };
}

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
        .map(([k, v]) => [k, removeUndefinedProperties(v)] as const)
    ) as T;
  }
  return obj;
}

export function awaitOutput<T>(output: Output<T>) {
  return new Promise<T>((r) => output.apply(r));
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
    label: "Tailscale Device",
    fields: {
      hostname: {
        type: TypeEnum.String,
        value: device.hostname,
      },
      name: {
        type: TypeEnum.String,
        value: device.name!,
      },
      nodeId: {
        type: TypeEnum.String,
        value: device.nodeId!,
      },
      tags: {
        type: TypeEnum.String,
        value: device.tags.apply((z) => z.join(","))!,
      },
      id: {
        type: TypeEnum.String,
        value: device.id!,
      },
      addresses: {
        type: TypeEnum.String,
        value: device.addresses.apply((z) => z.join(",")),
      },
    },
  };
}

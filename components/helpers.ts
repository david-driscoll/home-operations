import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { asset, Input, interpolate, Output, output, Resource } from "@pulumi/pulumi";
import { GetDeviceResult } from "@pulumi/tailscale";
import { writeFile } from "fs/promises";
import * as yaml from "yaml";
import { remote } from "@pulumi/command";
import { md5 } from "@pulumi/std";
import { GatusDefinition } from "@openapi/application-definition.js";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export const tempDir = join(tmpdir(), "home-operations-pulumi");
mkdirSync(tempDir, { recursive: true });
export function getTempFilePath(fileName: string) {
  return join(tempDir, fileName);
}

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

export async function addUptimeGatus(name: string, globals: GlobalResources, endpoints: Input<GatusDefinition[]>, parent: Resource) {
  const id = output(endpoints).apply(async (endpoints) => {
    const content = yaml.stringify({ endpoints: endpoints.sort((a, b) => a.name.localeCompare(b.name)) }, { lineWidth: 0 });
    const id = (await md5({ input: content })).result;
    await writeFile(getTempFilePath(`${name}.yaml`), content);
    return id;
  });

  new remote.CopyToRemote(
    name,
    {
      connection: {
        host: interpolate`dockge-as.${globals.tailscaleDomain}`,
        user: "root",
      },
      source: new asset.FileAsset(getTempFilePath(`${name}.yaml`)),
      remotePath: `/opt/stacks/uptime/config/${name}.yaml`,
      triggers: [id],
    },
    { parent }
  );
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

export function getTailscaleSection(obj: { tailscaleHostname: Input<string>; tailscaleIpAddress: Input<string> }): OnePasswordItemSectionInput {
  return {
    fields: {
      hostname: {
        type: TypeEnum.String,
        value: obj.tailscaleHostname,
      },
      ipAddress: {
        type: TypeEnum.String,
        value: obj.tailscaleIpAddress,
      },
    },
  };
}

import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { all, asset, Input, interpolate, mergeOptions, Output, output, Resource } from "@pulumi/pulumi";
import { GetDeviceResult } from "@pulumi/tailscale";
import { writeFile } from "fs/promises";
import * as yaml from "yaml";
import { remote, types } from "@pulumi/command";
import { md5 } from "@pulumi/std";
import { ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { md5Output } from "@pulumi/std/md5.js";
import { dir } from "console";

export const tempDir = join(tmpdir(), "home-operations-pulumi");
mkdirSync(tempDir, { recursive: true });
export function getTempFilePath(fileName: string) {
  return join(tempDir, fileName);
}

export function writeTempFile(fileName: Input<string>, content: Input<string>) {
  const filePath = output(fileName).apply((name) => getTempFilePath(name));
  return all([filePath, content])
    .apply(async ([filePath, content]) => writeFile(filePath, content))
    .apply(() => filePath);
}

export function copyFileToRemote(
  name: Input<string>,
  args: {
    content: Input<string>;
    remotePath: Input<string>;
    connection: types.input.remote.ConnectionArgs;
    parent?: Resource;
    dependsOn?: Input<Resource[]>;
  }
) {
  return output(name).apply((name) => {
    const tempFilePath = writeTempFile(name, args.content);
    const remotePath = output(args.remotePath);
    const fileAsset = tempFilePath.apply((path) => new asset.FileAsset(path));
    const id = md5Output({ input: args.content }).result;
    const mkdir = new remote.Command(
      `${name}-mkdir`,
      {
        connection: args.connection,
        create: interpolate`mkdir -p ${remotePath.apply(dirname)}`,
      },
      mergeOptions({ parent: args.parent }, { dependsOn: output(args.dependsOn).apply((d) => d ?? []) })
    );

    return new remote.CopyToRemote(
      name,
      {
        connection: args.connection,
        remotePath,
        source: fileAsset,
        triggers: [id, args.remotePath],
      },
      mergeOptions(
        { parent: args.parent },
        {
          dependsOn: output(args.dependsOn)
            .apply((d) => d ?? [])
            .apply((d) => [...d, mkdir]),
        }
      )
    );
  });
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

export function addUptimeGatus(name: string, globals: GlobalResources, args: { endpoints?: Input<GatusDefinition[]>; 'external-endpoints'?: Input<ExternalEndpoint[]> }, parent?: Resource) {
  const content = output(args).apply(async (a) => {
    return yaml.stringify({
      endpoints: (a.endpoints ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      "external-endpoints": (a["external-endpoints"] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }, { lineWidth: 0 });
  });

  return copyFileToRemote(name, {
    connection: {
      host: interpolate`dockge-as.${globals.tailscaleDomain}`,
      user: "root",
    },
    remotePath: `/opt/stacks/uptime/config/${name}.yaml`,
    content,
    parent,
  });
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

export type BackupTask = {
  name: Input<string>;
  schedule?: Input<string>;
  sourceType: Input<"b2" | "s3" | "local" | "sftp">;
  source: Input<string>;
  sourceSecret?: Input<string>;
  destinationType: Input<"b2" | "s3" | "local" | "sftp">;
  destination: Input<string>;
  destinationSecret?: Input<string>;
};

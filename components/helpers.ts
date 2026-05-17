import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { all, asset, Input, interpolate, log, mergeOptions, Output, output, Resource, ResourceOptions } from "@pulumi/pulumi";
import { GetDeviceResult } from "@pulumi/tailscale";
import { writeFile, rm } from "fs/promises";
import * as yaml from "yaml";
import { remote, types } from "@pulumi/command";
import { ApplicationDefinitionSchema, ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import { GlobalResources } from "./globals.ts";
import { mkdirSync } from "fs";
import { hash } from "node:crypto";
import { dirname, join } from "path";
import { unique } from "moderndash";
import { tmpdir } from "os";
import { RandomPassword, RandomString } from "@pulumi/random";
import type { ProxmoxHost } from "./ProxmoxHost.ts";

export const tempDir = join(tmpdir(), "_home-operations-pulumi");
mkdirSync(tempDir, { recursive: true });

export function getTempFilePath(fileName: string) {
  return join(tempDir, fileName);
}

export function getHostnames(name: string, globals: GlobalResources) {
  const hostname = interpolate`${name}.host.${globals.searchDomain}`;
  const tailscaleHostname = interpolate`${name}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleHostname };
}

export function getContainerHostnames(name: string, host: ProxmoxHost, globals: GlobalResources) {
  const hostname = interpolate`${host.shortName ?? host.name}.${globals.searchDomain}`;
  const tailscaleName = interpolate`${name}-${host.shortName ?? host.name}`;
  const tailscaleHostname = interpolate`${tailscaleName}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleName, tailscaleHostname };
}

export function writeTempFile(fileName: Input<string>, content: Input<string>) {
  const filePath = output(fileName).apply((name) => getTempFilePath(name));
  return all([filePath, content])
    .apply(async ([filePath, content]) => {
      try {
        await rm(filePath, { force: true });
      } catch (_) {}
      return writeFile(filePath, content.padEnd(1024), {});
    })
    .apply(() => filePath);
}

export function copyFileToRemote(
  name: Input<string>,
  args: {
    content: Input<string>;
    remotePath: Input<string>;
    connection: types.input.remote.ConnectionArgs;
    parent?: Resource;
    dependsOn?: Input<Input<Resource>[]>;
    triggers?: Input<any>[];
    withRemoveCommand?: boolean;
  },
) {
  return output(name)
    .apply((name) => output({ name, id: output(args.content).apply((c) => hash("md5", c, "hex")) }))
    .apply(({ name, id }) => {
      const tempFilePath = writeTempFile(name, args.content).apply((path) => {
        log.info(`Written temporary file for ${name} at ${path}`);
        return path;
      });
      const remotePath = output(args.remotePath);
      const fileAsset = tempFilePath.apply((path) => new asset.FileAsset(path));
      const mkdir = new remote.Command(
        `${name}-${id}-mkdir`,
        {
          connection: args.connection,
          create: interpolate`mkdir -p ${remotePath.apply(dirname)}`,
          triggers: [id, remotePath, ...(args.triggers ?? [])],
        },
        mergeOptions({ parent: args.parent }, { dependsOn: output(args.dependsOn).apply((d) => d ?? []) }),
      );

      const internalDeps = [mkdir];
      if (args.withRemoveCommand) {
        const remove = new remote.Command(
          `${name}-${id}-remove`,
          {
            connection: args.connection,
            delete: interpolate`rm -f ${remotePath}`,
          },
          { parent: args.parent },
        );
        internalDeps.push(remove);
      }

      return new remote.CopyToRemote(
        `${name}-${id}`,
        {
          connection: args.connection,
          remotePath,
          source: fileAsset,
          triggers: [id, args.remotePath, ...(args.triggers ?? [])],
        },
        mergeOptions(
          { parent: args.parent },
          {
            dependsOn: output(args.dependsOn)
              .apply((d) => d ?? [])
              .apply((d) => [...d, ...internalDeps]),
          },
        ),
      );
    });
}

export function pushLxcDefinition(
  name: Input<string>,
  args: {
    definition: Input<ApplicationDefinitionSchema>;
    vmId: Input<number>;
    connection: types.input.remote.ConnectionArgs;
    parent?: Resource;
    dependsOn?: Input<Resource>[];
  },
) {
  const content = output(args.definition).apply((def) => yaml.stringify(def, { lineWidth: 0 }));
  const vmId = output(args.vmId);

  const hostCopy = copyFileToRemote(
    output(name).apply((n) => `${n}-lxc-def`),
    {
      content,
      remotePath: output(name).apply((n) => `/tmp/app-defs/${n}.yaml`),
      connection: args.connection,
      parent: args.parent,
      dependsOn: args.dependsOn,
      withRemoveCommand: true,
    },
  );

  return all([name, hostCopy, vmId, args.dependsOn]).apply(
    ([n, copy, id, dependsOn]) =>
      new remote.Command(
        `${n}-push-lxc-def`,
        {
          connection: args.connection,
          create: `pct push ${id} /tmp/app-defs/${n}.yaml /etc/app-definition.yaml`,
          update: `pct push ${id} /tmp/app-defs/${n}.yaml /etc/app-definition.yaml`,
          triggers: [content],
        },
        mergeOptions({ parent: args.parent }, { dependsOn: [...(dependsOn ?? []), copy] }),
      ),
  );
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
        .map(([k, v]) => [k, removeUndefinedProperties(v)] as const),
    ) as T;
  }
  return obj;
}

export function addUptimeGatus(name: string, globals: GlobalResources, args: { endpoints?: Input<GatusDefinition[]>; "external-endpoints"?: Input<ExternalEndpoint[]> }, parent?: Resource) {
  const content = output(args).apply(async (a) => {
    log.info(`Generating Gatus config for ${name} with ${a.endpoints?.length ?? 0} endpoints and ${a["external-endpoints"]?.length ?? 0} external endpoints`);
    const y = yaml.stringify(
      {
        endpoints: unique(
          (a.endpoints ?? [])
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => {
              return {
                interval: "2m",
                ...e,
              };
            }),
          (a, b) => a.name === b.name,
        ),
        "external-endpoints": unique(
          (a["external-endpoints"] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
          (a, b) => a.name === b.name,
        ),
      },
      { lineWidth: 0 },
    );
    log.info(`Generated Gatus config for ${name}:\n${y}`);
    return y;
  });

  return copyFileToRemote(`gatus-${name}`, {
    connection: {
      host: interpolate`dockge-as.${globals.tailscaleDomain}`,
      user: "root",
    },
    remotePath: `/opt/stacks/uptime/config/uptime-${name}.yaml`,
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
  token?: Input<string>;
};

export type RepositoryBackupTask = {
  name: Input<string>;
  repository: Input<string>;
  schedule?: Input<string>;
  sourceType: Input<"b2" | "s3" | "local" | "sftp">;
  destinationType: Input<"b2" | "s3" | "local" | "sftp">;
};

export function toGatusKey(group: string, name: string) {
  return `${group.replace(/[\s\/_,.#+&]+/g, "-")}_${name.replace(/[\s\/_,.#+&]+/g, "-")}`.toLowerCase();
}

export function clientIdPair(
  resourceName: string,
  options: {
    clientId?: Input<string>;
    clientSecret?: Input<string>;
    options: ResourceOptions;
  },
) {
  const clientId = options.clientId
    ? output(options.clientId)
    : new RandomString(
        `${resourceName}-client-id`,
        {
          length: 16,
          upper: false,
          special: false,
        },
        options.options,
      ).result;
  const clientSecret = options.clientSecret
    ? output(options.clientSecret)
    : new RandomPassword(
        `${resourceName}-client-secret`,
        {
          length: 32,
          upper: false,
          special: false,
        },
        options.options,
      ).result;

  return { clientId, clientSecret };
}

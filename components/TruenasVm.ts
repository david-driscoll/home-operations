import * as pulumi from "@pulumi/pulumi";
import * as minio from "@pulumi/minio";
import * as b2 from "@pulumi/b2";
import * as random from "@pulumi/random";

export type { CustomResourceOptions } from "@pulumi/pulumi";

import { OPClient } from "./op.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { GlobalResources } from "./globals.ts";
import { getTruenasClient } from "./truenas.ts";
import TrueNASResourceManager from "./truenas/truenas-manager.ts";
import { OnePasswordItem, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { Dataset } from "@components/truenas/index.ts";
import { types } from "@pulumi/command";
import { TailscaleIp } from "@openapi/tailscale-grants.js";

export interface TruenasVmArgs {
  credential: pulumi.Input<string>;
  globals: GlobalResources;
  host: ProxmoxHost;
  ipAddress: pulumi.Input<TailscaleIp>;
  macAddress: string;
  tailscaleIpAddress: TailscaleIp;
}

export interface TruenasVmResult {
  longhorn: string;
  volsync: string;
  backblaze: {
    backup: pulumi.Output<string>;
    backupCredential: OnePasswordItem;
    backupApplicationKey: pulumi.Output<string>;
    database: pulumi.Output<string>;
    databaseCredential: OnePasswordItem;
    databaseApplicationKey: pulumi.Output<string>;
  };
  truenas: {
    backup: pulumi.Output<string>;
    database: pulumi.Output<string>;
  };
}

function promisifyOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

export class TruenasVm extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly ipAddress: pulumi.Output<TailscaleIp>;
  public readonly tailscaleIpAddress: TailscaleIp;
  public readonly macAddress: string;
  // public readonly device: pulumi.Output<GetDeviceResult>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly globals: GlobalResources;
  public readonly hostname: pulumi.Output<string>;
  constructor(name: string, args: TruenasVmArgs, opts?: pulumi.ComponentResourceOptions) {
    super("home:truenas:TruenasVM", name, opts);
    const opClient = new OPClient();
    const cro = { parent: this };
    this.name = name;
    this.ipAddress = pulumi.output(args.ipAddress);
    this.tailscaleIpAddress = args.tailscaleIpAddress;
    this.macAddress = args.macAddress;
    this.credential = pulumi.output(args.credential);
    const credentialItem = this.credential.apply(async (title) => opClient.getItemByTitle(title));
    this.globals = args.globals;

    this.hostname = pulumi.interpolate`${name}.${this.globals.searchDomain}`;
    const tailscaleHostname = pulumi.interpolate`${name}.${this.globals.tailscaleDomain}`;

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.ipAddress,
      user: credentialItem.apply((z) => z.fields?.username?.value!),
      password: credentialItem.apply((z) => z.fields?.credential?.value!),
    });
    // const tailscaleSet = installTailscale({ connection, name, parent: this, tailscaleName: pulumi.output(name), globals: args.globals });

    // Get Tailscale device
    // this.device = getDeviceOutput({ hostname: name }, { provider: args.globals.tailscaleProvider, parent: this, dependsOn: [tailscaleSet] }).apply(async (result) => {
    //   try {
    //     await tailscale.paths["/device/{deviceId}/ip"].post({ deviceId: result.nodeId }, { ipv4: args.tailscaleIpAddress });
    //   } catch (e) {
    //     pulumi.log.error(`Error setting IP address for device ${args.tailscaleIpAddress}: ${e}`, this);
    //   }
    //   return result;
    // });

    const truenasInfo = new OnePasswordItem(
      `${args.host.name}-truenas`,
      {
        category: FullItem.CategoryEnum.SecureNote,
        title: pulumi.interpolate`Truenas: ${args.host.title}`,
        tags: ["truenas"],
        sections: {
          ssh: {
            fields: {
              hostname: { type: TypeEnum.String, value: tailscaleHostname },
              username: { type: TypeEnum.String, value: args.globals.proxmoxCredential.apply((z) => z.fields?.username?.value!) },
              password: { type: TypeEnum.Concealed, value: args.globals.proxmoxCredential.apply((z) => z.fields?.password?.value!) },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.ipAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      { parent: this }
    );
  }

  public get backupDatasetId() {
    return "stash/backup";
  }
  public get dataDatasetId() {
    return "stash/data";
  }
  public get mediaDatasetId() {
    return "stash/media";
  }

  public credential: pulumi.Output<string>;
}

const backupDatasetId = "stash/backup";

export async function addClusterBackup(
  name: string,
  { globals, credential, parent }: { globals: GlobalResources; credential: pulumi.Input<string>; parent: pulumi.Resource }
): Promise<TruenasVmResult> {
  const manager = await promisifyOutput(
    pulumi.output(credential).apply(async (credential) => {
      return new TrueNASResourceManager(await getTruenasClient(credential));
    })
  );

  let longhorn: Dataset | null = null;
  let volsync: Dataset | null = null;
  if (!pulumi.runtime.isDryRun()) {
    const root = await manager.ensureDataset(`${backupDatasetId}/${name}`, { type: "FILESYSTEM" });
    longhorn = await manager.ensureDataset(`${backupDatasetId}/${name}/longhorn`, { type: "FILESYSTEM" });
    volsync = await manager.ensureDataset(`${backupDatasetId}/${name}/volsync`, { type: "FILESYSTEM" });
    await manager.ensureNFSShare(longhorn.mountpoint!, {
      mapall_user: "apps",
      mapall_group: "apps",
    });
    await manager.ensureNFSShare(volsync.mountpoint!, {
      mapall_user: "apps",
      mapall_group: "apps",
    });
  }

  const suffix = new random.RandomPet(`${name}-suffix`, { length: 2 }, { parent }).id.apply((z) => z.toLowerCase());

  const minioBucket = new minio.S3Bucket(
    `${name}-minio-bucket`,
    {
      acl: "private",
      bucket: pulumi.interpolate`${suffix}-backup`,
    },
    {
      parent,
      provider: globals.truenasMinioProvider,
      protect: false,
      retainOnDelete: true,
    }
  );

  const b2Bucket = new b2.Bucket(
    `${name}-b2-bucket`,
    {
      bucketName: pulumi.interpolate`${suffix}-backup`,
      bucketType: "allPrivate",
      bucketInfo: {
        project: "home-operations",
        cluster: name,
        purpose: "backup",
      },
      lifecycleRules: [
        {
          fileNamePrefix: "",
          daysFromHidingToDeleting: 1,
        },
      ],
    },
    {
      parent,
      provider: globals.backblazeProvider,
      protect: true,
      retainOnDelete: true,
    }
  );

  // b2 buckets, application key, minio buckets
  const b2BucketApplicationKey = new b2.ApplicationKey(
    `${name}-b2-application-key`,
    {
      keyName: pulumi.interpolate`home-operations-${suffix}-backup`,
      bucketId: b2Bucket.id,
      capabilities: [
        "deleteFiles",
        "listAllBucketNames",
        "listBuckets",
        "listFiles",
        "readBucketEncryption",
        "readBucketLogging",
        "readBucketNotifications",
        "readBucketReplications",
        "readBuckets",
        "readFiles",
        "shareFiles",
        "writeBucketEncryption",
        "writeBucketLogging",
        "writeBucketNotifications",
        "writeBucketReplications",
        "writeFiles",
      ],
    },
    { parent, provider: globals.backblazeProvider }
  );

  const minioDbBucket = new minio.S3Bucket(
    `${name}-minio-db-bucket`,
    {
      acl: "private",
      bucket: pulumi.interpolate`${suffix}-db`,
    },
    {
      parent,
      provider: globals.truenasMinioProvider,
      protect: true,
      retainOnDelete: true,
    }
  );

  const b2DatabaseBucket = new b2.Bucket(
    `${name}-b2-db-bucket`,
    {
      bucketName: pulumi.interpolate`${suffix}-db`,
      bucketType: "allPrivate",
      bucketInfo: {
        project: "home-operations",
        cluster: name,
        purpose: "database-backup",
      },
      lifecycleRules: [
        {
          fileNamePrefix: "",
          daysFromHidingToDeleting: 1,
        },
      ],
    },
    {
      parent,
      provider: globals.backblazeProvider,
      protect: true,
      retainOnDelete: true,
    }
  );

  // b2 buckets, application key, minio buckets
  const b2DatabaseBucketApplicationKey = new b2.ApplicationKey(
    `${name}-b2-db-application-key`,
    {
      keyName: pulumi.interpolate`home-operations-${suffix}-db`,
      bucketId: b2DatabaseBucket.id,
      capabilities: [
        "deleteFiles",
        "listAllBucketNames",
        "listBuckets",
        "listFiles",
        "readBucketEncryption",
        "readBucketLogging",
        "readBucketNotifications",
        "readBucketReplications",
        "readBuckets",
        "readFiles",
        "shareFiles",
        "writeBucketEncryption",
        "writeBucketLogging",
        "writeBucketNotifications",
        "writeBucketReplications",
        "writeFiles",
      ],
    },
    { parent, provider: globals.backblazeProvider }
  );

  const backupCredential = new OnePasswordItem(
    `${name}-b2-credential`,
    {
      title: pulumi.interpolate`B2 Backup Key ${name}`,
      category: FullItem.CategoryEnum.APICredential,
      fields: pulumi.output({
        username: { value: b2BucketApplicationKey.applicationKeyId, type: TypeEnum.String },
        credential: { value: b2BucketApplicationKey.applicationKey, type: TypeEnum.Concealed },
        keyName: { value: b2BucketApplicationKey.keyName, type: TypeEnum.String },
        bucket: { value: b2Bucket.bucketName, type: TypeEnum.String },
        hostname: { value: "s3.us-east-005.backblazeb2.com", type: TypeEnum.String },
      }),
      tags: ["backblaze", "backup", name],
    },
    { parent }
  );

  const databaseCredential = new OnePasswordItem(
    `${name}-b2-db-credential`,
    {
      title: pulumi.interpolate`B2 Database Key ${name}`,
      category: FullItem.CategoryEnum.APICredential,
      fields: pulumi.output({
        username: { value: b2DatabaseBucketApplicationKey.applicationKeyId, type: TypeEnum.String },
        credential: { value: b2DatabaseBucketApplicationKey.applicationKey, type: TypeEnum.Concealed },
        keyName: { value: b2DatabaseBucketApplicationKey.keyName, type: TypeEnum.String },
        bucket: { value: b2DatabaseBucket.bucketName, type: TypeEnum.String },
        hostname: { value: "s3.us-east-005.backblazeb2.com", type: TypeEnum.String },
      }),
      tags: ["backblaze", "database", "backup", name],
    },
    { parent }
  );

  return {
    longhorn: longhorn?.mountpoint ?? `/mnt/${backupDatasetId}/${name}/longhorn`,
    volsync: volsync?.mountpoint ?? `/mnt/${backupDatasetId}/${name}/volsync`,
    backblaze: {
      backupCredential: backupCredential,
      backup: b2Bucket.bucketName,
      backupApplicationKey: b2BucketApplicationKey.applicationKeyId,
      database: b2DatabaseBucket.bucketName,
      databaseCredential: databaseCredential,
      databaseApplicationKey: b2DatabaseBucketApplicationKey.applicationKeyId,
    },
    truenas: {
      backup: minioBucket.bucket,
      database: minioDbBucket.bucket,
    },
  };
}

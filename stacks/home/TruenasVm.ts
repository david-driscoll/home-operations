import * as pulumi from "@pulumi/pulumi";
import * as minio from "@pulumi/minio";
import * as b2 from "@pulumi/b2";
import * as random from "@pulumi/random";

export type { CustomResourceOptions } from "@pulumi/pulumi";

import { OPClient } from "../../components/op.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { GlobalResources } from "../../components/globals.ts";
import { getTruenasClient } from "../../components/truenas.ts";
import TrueNASResourceManager from "../../components/truenas/truenas-manager.ts";
import { OnePasswordItem } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { Dataset } from "@components/truenas/index.ts";

export interface TruenasVmArgs {
  credential: pulumi.Input<string>;
  globals: GlobalResources;
  host: ProxmoxHost;
}

export interface TruenasVmResult {
  longhorn: string;
  volsync: string;
  backblaze: {
    backup: pulumi.Output<string>;
    backupCredential: {
      id: pulumi.Output<string>;
      title: pulumi.Output<string>;
    };
    backupApplicationKey: pulumi.Output<string>;
    database: pulumi.Output<string>;
    databaseCredential: {
      id: pulumi.Output<string>;
      title: pulumi.Output<string>;
    };
    databaseApplicationKey: pulumi.Output<string>;
  };
  truenas: {
    bucket: pulumi.Output<string>;
  };
}

function promisifyOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

export class TruenasVm {
  globals: GlobalResources;
  constructor(args: TruenasVmArgs) {
    this.credential = pulumi.output(args.credential);
    this.globals = args.globals;
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
  public async addClusterBackup(name: string, parent: pulumi.Resource): Promise<TruenasVmResult> {
    const manager = await promisifyOutput(
      pulumi.output(this.credential).apply(async (credential) => {
        return new TrueNASResourceManager(await getTruenasClient(credential));
      })
    );

    let longhorn: Dataset | null = null;
    let volsync: Dataset | null = null;
    if (!pulumi.runtime.isDryRun()) {
      const root = await manager.ensureDataset(`${this.backupDatasetId}/${name}`, { type: "FILESYSTEM" });
      longhorn = await manager.ensureDataset(`${this.backupDatasetId}/${name}/longhorn`, { type: "FILESYSTEM" });
      volsync = await manager.ensureDataset(`${this.backupDatasetId}/${name}/volsync`, { type: "FILESYSTEM" });
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
      },
      { parent, provider: this.globals.truenasMinioProvider }
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
      },
      { parent, provider: this.globals.backblazeProvider }
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
      { parent, provider: this.globals.backblazeProvider }
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
      },
      { parent, provider: this.globals.backblazeProvider }
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
      { parent, provider: this.globals.backblazeProvider }
    );

    const backupCredential = new OnePasswordItem(`${name}-b2-credential`, {
      title: pulumi.interpolate`B2 Backup Key ${name}`,
      category: FullItem.CategoryEnum.APICredential,
      fields: [
        pulumi.output({ label: "username", value: b2BucketApplicationKey.applicationKeyId, type: FullItemAllOfFields.TypeEnum.String }),
        pulumi.output({ label: "credential", value: b2BucketApplicationKey.applicationKey, type: FullItemAllOfFields.TypeEnum.Concealed }),
        pulumi.output({ label: "keyName", value: b2BucketApplicationKey.keyName, type: FullItemAllOfFields.TypeEnum.String }),
        pulumi.output({ label: "bucket", value: b2Bucket.bucketName, type: FullItemAllOfFields.TypeEnum.String }),
        pulumi.output({ label: "hostname", value: "s3.us-east-005.backblazeb2.com", type: FullItemAllOfFields.TypeEnum.String }),
      ],
      tags: ["backblaze", "backup", name],
    });

    const databaseCredential = new OnePasswordItem(`${name}-b2-db-credential`, {
      title: pulumi.interpolate`B2 Database Key ${name}`,
      category: FullItem.CategoryEnum.APICredential,
      fields: [
        pulumi.output({ label: "username", value: b2DatabaseBucketApplicationKey.applicationKeyId, type: FullItemAllOfFields.TypeEnum.String }),
        pulumi.output({ label: "credential", value: b2DatabaseBucketApplicationKey.applicationKey, type: FullItemAllOfFields.TypeEnum.Concealed }),
        pulumi.output({ label: "keyName", value: b2DatabaseBucketApplicationKey.keyName, type: FullItemAllOfFields.TypeEnum.String }),
        pulumi.output({ label: "bucket", value: b2DatabaseBucket.bucketName, type: FullItemAllOfFields.TypeEnum.String }),
        pulumi.output({ label: "hostname", value: "s3.us-east-005.backblazeb2.com", type: FullItemAllOfFields.TypeEnum.String }),
      ],
      tags: ["backblaze", "database", "backup", name],
    });

    return {
      longhorn: longhorn?.mountpoint ?? `/mnt/${this.backupDatasetId}/${name}/longhorn`,
      volsync: volsync?.mountpoint ?? `/mnt/${this.backupDatasetId}/${name}/volsync`,
      backblaze: {
        backupCredential: {
          id: backupCredential.id,
          title: backupCredential.title,
        },
        backup: b2Bucket.bucketName,
        backupApplicationKey: b2BucketApplicationKey.applicationKeyId,
        database: b2DatabaseBucket.bucketName,
        databaseCredential: {
          id: databaseCredential.id,
          title: databaseCredential.title,
        },
        databaseApplicationKey: b2DatabaseBucketApplicationKey.applicationKeyId,
      },
      truenas: {
        bucket: minioBucket.bucket,
      },
    };
  }
}

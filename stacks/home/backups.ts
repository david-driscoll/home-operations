import { DockgeLxc } from "./DockgeLxc.ts";
import * as pulumi from "@pulumi/pulumi";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { CategoryEnum, OnePasswordItem as OPI, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { GlobalResources } from "@components/globals.ts";
import * as minio from "@pulumi/minio";
import { BackupPlanManager } from "./jobs.ts";

export async function createBackupJobs({
  celestiaDockgeRuntime,
  lunaDockgeRuntime,
  alphaSiteDockgeRuntime,
  celestiaHost,
  globals,
}: {
  celestiaDockgeRuntime: DockgeLxc;
  lunaDockgeRuntime: DockgeLxc;
  alphaSiteDockgeRuntime: DockgeLxc;
  celestiaHost: ProxmoxHost;
  lunaHost: ProxmoxHost;
  alphaSiteHost: ProxmoxHost;
  globals: GlobalResources;
}) {
  const celestiaBackupManager = new BackupPlanManager("celestia-backup-plan-manager", {
    globals: globals,
    source: celestiaDockgeRuntime,
    localBackup: celestiaDockgeRuntime,
    remoteBackup: lunaDockgeRuntime,
  });
  // const alphaSiteBackupManager = new BackupPlanManager("alpha-site-backup-plan-manager", {
  //   globals: globals,
  //   source: alphaSiteDockgeRuntime,
  //   localBackup: celestiaDockgeRuntime,
  //   remoteBackup: lunaDockgeRuntime,
  // });

  // await alphaSiteBackupManager.createBackrestPlan("adguard", {
  //   title: "AdGuard Home",
  //   paths: ["/opt/stacks/adguard"],
  //   repository: "adguard",
  // });

  // await alphaSiteBackupManager.createBackrestPlan("zigbee", {
  //   title: "ZigBee",
  //   paths: ["/opt/stacks/zigbee-poe"],
  //   repository: "zigbee",
  // });

  await celestiaBackupManager.createBackrestPlan("immich", {
    title: "Immich",
    paths: ["/spike/data/immich/"],
    repository: "immich",
    planConfig: {
      excludes: ["/spike/data/immich/backups", "/spike/data/immich/encoded-video"],
    },
    backblazeSecret: celestiaHost.backupVolumes!.backblaze.backupCredential.title!,
  });

  createMinioBucketBackupJob({
    title: "Home Operations",
    bucket: "home-operations",
    backblazeSecret: "Backblaze home-operations",
    source: celestiaDockgeRuntime,
    destination: lunaDockgeRuntime,
    globals,
  });
  createMinioBucketBackupJob({
    title: "Stargate Command Postgres",
    bucket: "stargate-command-db",
    restoreBucket: "stargate-command-db-restore",
    backblazeSecret: "Backblaze S3 Stargate Command Database",
    source: celestiaDockgeRuntime,
    destination: lunaDockgeRuntime,
    globals,
  });
  createMinioBucketBackupJob({
    title: "Equestria Postgres",
    bucket: "equestria-db",
    restoreBucket: "equestria-db-restore",
    backblazeSecret: "Backblaze S3 Equestria Database",
    source: celestiaDockgeRuntime,
    destination: lunaDockgeRuntime,
    globals,
  });

  const thanosStorage = new minio.S3Bucket(
    `thanos-storage`,
    {
      acl: "private",
    },
    {
      provider: globals.truenasMinioProvider,
      protect: true,
      retainOnDelete: true,
    }
  );

  const thanosMinioSecret = new OPI("thanos-minio-secret", {
    title: "Thanos S3 Storage",
    category: CategoryEnum.APICredential,
    fields: {
      username: { type: TypeEnum.String, value: globals.truenasMinioProvider.minioUser },
      password: { type: TypeEnum.Concealed, value: globals.truenasMinioProvider.minioPassword },
      bucket: { type: TypeEnum.String, value: thanosStorage.bucket },
      endpoint: { type: TypeEnum.String, value: globals.truenasMinioProvider.minioServer },
    },
  });

  // Backup Thanos bucket to Celestia and Luna
  createMinioBucketBackupJob({ title: "Thanos Storage", bucket: thanosStorage.bucket, source: celestiaDockgeRuntime, destination: lunaDockgeRuntime, globals });

  // await alphaSiteBackupManager.updateBackrestConfig();
  await celestiaBackupManager.updateBackrestConfig();
}

function createMinioBucketBackupJob({
  title,
  bucket,
  backblazeSecret,
  source,
  destination,
  globals,
  restoreBucket: restoreBucket,
}: {
  source: DockgeLxc;
  destination: DockgeLxc;
  title: pulumi.Input<string>;
  bucket: pulumi.Input<string>;
  globals: GlobalResources;
  backblazeSecret?: pulumi.Input<string>;
  restoreBucket?: pulumi.Input<string>;
}) {
  source.createBackupJob({
    name: pulumi.interpolate`Backup ${title}`,
    schedule: "0 10 * * *",
    sourceType: "local",
    source: pulumi.interpolate`/spike/data/minio/${bucket}/`,
    destinationType: "local",
    destination: pulumi.interpolate`/data/backup/spike/${bucket}/`,
  });

  if (backblazeSecret) {
    source.createBackupJob({
      name: pulumi.interpolate`Replicate ${title} to B2`,
      schedule: "0 8 */4 * *",
      sourceType: "local",
      source: pulumi.interpolate`/spike/data/minio/${bucket}/`,
      destinationType: "b2",
      destination: pulumi.interpolate`/`,
      destinationSecret: backblazeSecret,
    });
  }

  destination.createBackupJob({
    name: pulumi.interpolate`Replicate ${title}`,
    schedule: "0 3 * * *",
    sourceType: "sftp",
    source: pulumi.interpolate`${source.tailscaleHostname}/spike/${bucket}/`,
    destinationType: "local",
    destination: pulumi.interpolate`/data/backup/spike/${bucket}/`,
  });

  if (restoreBucket) {
    pulumi.all([bucket, restoreBucket]).apply(([bucket, restoreBucket]) => {
      const minioBucket = new minio.S3Bucket(
        `${restoreBucket}-minio-bucket`,
        {
          acl: "private",
          bucket: pulumi.interpolate`${restoreBucket}`,
        },
        {
          provider: globals.truenasMinioProvider,
          protect: true,
          retainOnDelete: true,
        }
      );
      source.createBackupJob({
        name: pulumi.interpolate`Sync ${bucket} from ${restoreBucket}`,
        schedule: "*/10 * * * *",
        sourceType: "s3",
        source: pulumi.interpolate`${bucket}/`,
        sourceSecret: globals.truenasMinioCredential.title!,
        destinationType: "s3",
        destination: pulumi.interpolate`${minioBucket.bucket}/`,
        destinationSecret: globals.truenasMinioCredential.title!,
      });
    });
  }
}

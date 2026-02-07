import { all, ComponentResource, ComponentResourceOptions, Input, interpolate, jsonStringify, log, Output, output } from "@pulumi/pulumi";
import { Provider as PbsProvider, Datastore, S3Endpoint } from "@pulumi/pbs";
import { RandomString, RandomPet } from "@pulumi/random";
import { Purrl } from "@pulumiverse/purrl";
import * as b2 from "@pulumi/b2";
import * as http from "@pulumi/http";
import { OPClient } from "@components/op.ts";
import { ClusterDefinition, GlobalResources } from "@components/globals.ts";
import { awaitOutput } from "@components/helpers.ts";

export interface ProxmoxBackupServerArgs {
  credential: Input<string>;
  hostname: Input<string>;
  globals: GlobalResources;
}

export class ProxmoxBackupServer extends ComponentResource {
  provider: PbsProvider;
  name: Output<string>;
  constructor(name: string, args: ProxmoxBackupServerArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:ProxmoxBackupServer", name, opts);

    const opClient = new OPClient();
    const credential = output(args.credential).apply((x) => opClient.getItemByTitle(x));

    this.name = output(args.hostname);

    this.provider = new PbsProvider(
      `${name}-provider`,
      {
        endpoint: interpolate`https://${args.hostname}:8007`,
        username: interpolate`${credential.apply((i) => i.fields.username.value!)}@pbs`,
        password: credential.apply((i) => i.fields.password.value!),
      },
      { parent: this },
    );
  }
}

export async function createBackupDatastores(
  name: string,
  args: {
    globals: GlobalResources;
    sourceServer: ProxmoxBackupServer;
    destinationServer: ProxmoxBackupServer;
  },
) {
  const suffix = new RandomString(`${name}-pbs-datastore`, {
    length: 6,
    upper: false,
    lower: true,
    number: true,
    special: false,
  });

  // const sourceDatastore = new Datastore(
  //   `${name}-src`,
  //   {
  //     type: "dir",
  //     contents: ["backup"],
  //     path: interpolate`/data/backup/${name}-${suffix.result}`,
  //     gcSchedule: "daily",
  //     pruneSchedule: "daily",
  //     createBasePath: true,
  //   },
  //   {
  //     provider: args.sourceServer.provider,
  //     parent: args.sourceServer,
  //     retainOnDelete: true,
  //     protect: true,
  //   },
  // );

  // const sourcePruneJob = createPruneJob(`${name}-src`, {
  //   server: args.sourceServer,
  //   schedule: "daily",
  //   store: sourceDatastore.name,
  //   keepDaily: 7,
  //   keepWeekly: 4,
  //   keepLast: 10,
  //   keepMonthly: 3,
  // });

  // const destinationDatastore = new Datastore(
  //   `${name}-dst`,
  //   {
  //     type: "dir",
  //     contents: ["backup"],
  //     path: interpolate`/data/backup/${name}-${suffix.result}`,
  //     createBasePath: true,
  //     gcSchedule: "weekly",
  //     pruneSchedule: "weekly",
  //   },
  //   {
  //     provider: args.destinationServer.provider,
  //     parent: args.destinationServer,
  //     dependsOn: [sourceDatastore],
  //     retainOnDelete: true,
  //     protect: true,
  //   },
  // );

  // const destinationPruneJob = createPruneJob(`${name}-dst`, {
  //   server: args.destinationServer,
  //   schedule: "weekly",
  //   store: destinationDatastore.name,
  //   keepDaily: 7,
  //   keepWeekly: 4,
  //   keepLast: 10,
  //   keepMonthly: 3,
  // });

  const bucketName = new RandomPet(`${name}-bucket-name`, {
    length: 2,
  }).id.apply((z) => z.toLowerCase());

  const b2Bucket = new b2.Bucket(
    `${name}-bucket`,
    {
      bucketName: interpolate`${bucketName}-${suffix.result}`,
      bucketType: "allPrivate",
      bucketInfo: {
        project: "home-operations",
        cluster: name,
        purpose: "pbs-backup",
      },
      lifecycleRules: [
        {
          fileNamePrefix: "",
          daysFromHidingToDeleting: 1,
        },
      ],
    },
    {
      parent: args.sourceServer,
      provider: args.globals.backblazeProvider,
      retainOnDelete: true,
      protect: true,
    },
  );

  // b2 buckets, application key, minio buckets
  const b2BucketApplicationKey = new b2.ApplicationKey(
    `${name}-bucket-application-key`,
    {
      keyName: interpolate`${name}-${suffix.result}`,
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
    { parent: args.sourceServer, provider: args.globals.backblazeProvider },
  );

  const s3Endpoint = new S3Endpoint(
    `${name}-bucket-s3-endpoint`,
    {
      s3EndpointId: interpolate`${name}-${suffix.result}`,
      endpoint: "s3.us-east-005.backblazeb2.com",
      accessKey: b2BucketApplicationKey.applicationKeyId,
      secretKey: b2BucketApplicationKey.applicationKey,
      pathStyle: true,
      providerQuirks: ["skip-if-none-match-header"],
    },
    {
      provider: args.sourceServer.provider,
      parent: args.sourceServer,
      retainOnDelete: true,
      protect: true,
    },
  );

  // const destinationBackblazeBucket = new Datastore(
  //   `${name}-b2`,
  //   {
  //     contents: ["backup"],
  //     s3Bucket: b2Bucket.bucketName,
  //     s3Client: s3Endpoint.s3EndpointId,
  //     gcSchedule: "weekly",
  //     pruneSchedule: "weekly",
  //     path: interpolate`/data/cache/${s3Endpoint.s3EndpointId}`,
  //     createBasePath: true,
  //   },
  //   {
  //     provider: args.sourceServer.provider,
  //     parent: args.sourceServer,
  //     dependsOn: [destinationDatastore],

  //     retainOnDelete: true,
  //     protect: true,
  //   }
  // );

  // const b2PruneJob = createPruneJob(`${name}-b2`, {
  //   server: args.sourceServer,
  //   schedule: "weekly",
  //   store: destinationBackblazeBucket.name,
  //   keepDaily: 7,
  //   keepWeekly: 4,
  //   keepLast: 10,
  //   keepMonthly: 3,
  // });

  // const pullFromSource = createSyncJob(`${name}-pull-src`, {
  //   sourceServer: args.destinationServer,
  //   destinationServer: args.sourceServer,
  //   syncDirection: "pull",
  //   schedule: "daily",
  //   store: destinationDatastore.name,
  //   remoteStore: sourceDatastore.name,
  //   removeVanished: true,
  //   comment: interpolate`Pull from ${args.sourceServer.name}`,
  // });

  // const pushToS3 = createSyncJob(`${name}-push-s3`, {
  //   sourceServer: args.sourceServer,
  //   destinationServer: args.destinationServer,
  //   syncDirection: "push",
  //   schedule: "daily",
  //   store: sourceDatastore.name,
  //   comment: interpolate`Sync to Backblaze ${args.destinationServer.name}`,
  //   remoteStore: destinationBackblazeBucket.name,
  //   removeVanished: true,
  //   maxDepth: 1,
  // });

  // await awaitOutput(destinationBackblazeBucket.id);

  return {
    // sourceDatastore,
    // destinationDatastore,
    // destinationBackblazeBucket,
    b2Bucket,
    b2BucketApplicationKey,
  };
}

interface PruneJobArgs {
  server: ProxmoxBackupServer;
  store: Input<string>;
  schedule: Input<string>;
  comment?: Input<string>;
  keepLast?: Input<number>;
  keepHourly?: Input<number>;
  keepDaily?: Input<number>;
  keepWeekly?: Input<number>;
  keepMonthly?: Input<number>;
  keepYearly?: Input<number>;
}

function createPruneJob(name: string, args: PruneJobArgs) {
  const suffix = new RandomString(
    `${name}-pbs-prune-job-suffix`,
    {
      length: 6,
      upper: false,
      lower: true,
      number: true,
      special: false,
    },
    { parent: args.server },
  );

  const jobId = interpolate`${name}-${suffix.result}`;
  const endpoint = args.server.provider.endpoint;

  const job = new Purrl(
    `${name}-pbs-prune-job`,
    {
      name: name,
      method: "POST",
      url: interpolate`${endpoint}/api2/json/config/prune`,
      headers: {
        "Content-Type": "application/json",
      },
      body: output({
        id: jobId,
        store: args.store,
        schedule: args.schedule,
        comment: args.comment,
        "keep-last": args.keepLast,
        "keep-hourly": args.keepHourly,
        "keep-daily": args.keepDaily,
        "keep-weekly": args.keepWeekly,
        "keep-monthly": args.keepMonthly,
        "keep-yearly": args.keepYearly,
      }).apply((data) => jsonStringify(Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined && v !== null)))),
      responseCodes: ["200", "201", "202", "203", "204"],

      deleteMethod: "DELETE",
      deleteUrl: interpolate`${endpoint}/api2/json/config/prune/${jobId}`,
      deleteBody: jsonStringify({}),
      deleteResponseCodes: ["200"],
    },
    { parent: args.server },
  );

  return job;
}

interface SyncJobArgs {
  sourceServer: ProxmoxBackupServer;
  destinationServer: ProxmoxBackupServer;
  store: Input<string>;
  remoteStore: Input<string>;
  schedule: Input<string>;
  comment?: Input<string>;
  owner?: Input<string>;
  removeVanished?: Input<boolean>;
  maxDepth?: Input<number>;
  groupFilter?: Input<string>;
  rateIn?: Input<number>;
  burstIn?: Input<number>;
  transferLast?: Input<number>;
  syncDirection: Input<"push" | "pull">;
}

function createSyncJob(name: string, args: SyncJobArgs) {
  const suffix = new RandomString(
    `${name}-pbs-sync-job-suffix`,
    {
      length: 6,
      upper: false,
      lower: true,
      number: true,
      special: false,
    },
    { parent: args.sourceServer },
  );

  const jobId = interpolate`${name}-${suffix.result}`;
  const endpoint = args.sourceServer.provider.endpoint;

  all([args.sourceServer.name, jobId, args.destinationServer.name]).apply(([name, jobID, remote]) => log.info(`Creating PBS sync job ${jobID} on server ${name} for remote ${remote}`));

  const job = new Purrl(
    `${name}-pbs-sync-job`,
    {
      name: name,
      method: "POST",
      url: interpolate`${endpoint}/api2/json/config/sync`,
      headers: {
        "Content-Type": "application/json",
      },
      body: output({
        id: jobId,
        store: args.store,
        "remote-store": args.remoteStore,
        remote: args.destinationServer.name,
        schedule: args.schedule,
        comment: args.comment,
        owner: args.owner,
        "remove-vanished": args.removeVanished,
        "max-depth": args.maxDepth,
        "group-filter": args.groupFilter,
        "rate-in": args.rateIn,
        "burst-in": args.burstIn,
        "transfer-last": args.transferLast,
        "sync-direction": args.syncDirection,
      }).apply((data) => jsonStringify(Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined && v !== null)))),
      responseCodes: ["200", "201"],

      deleteMethod: "DELETE",
      deleteUrl: interpolate`${endpoint}/api2/json/config/sync/${jobId}`,
      deleteBody: jsonStringify({}),
      deleteResponseCodes: ["200"],
    },
    { parent: args.sourceServer },
  );

  // celestia.opossum-yo.ts.net
  // celestia@pbs!celestia
  // 72:6a:08:b0:27:ea:96:13:dc:1a:b4:44:94:c3:1a:db:07:9d:f9:4b:bb:e3:8e:e0:45:c1:59:d5:c0:8a:f1:d4

  return job;
}

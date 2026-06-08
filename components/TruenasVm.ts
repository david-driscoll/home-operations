import * as pulumi from "@pulumi/pulumi";
import * as minio from "@pulumi/minio";
// import * as b2 from "@pulumi/b2";
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
import { awaitOutput } from "./helpers.ts";

export interface TruenasVmArgs {
  credential: pulumi.Input<string>;
  globals: GlobalResources;
  host: ProxmoxHost;
  ipAddress: pulumi.Input<TailscaleIp>;
  tailscaleIpAddress: TailscaleIp;
}

export interface TruenasVmResult {
  longhorn: string;
  volsync: string;
  // backblaze: {
  //   backup: pulumi.Output<string>;
  //   backupCredential: OnePasswordItem;
  //   backupApplicationKey: pulumi.Output<string>;
  //   database: pulumi.Output<string>;
  //   databaseCredential: OnePasswordItem;
  //   databaseApplicationKey: pulumi.Output<string>;
  // };
  // truenas: {`
  //   backup: pulumi.Output<string>;
  //   database: pulumi.Output<string>;
  // };`
}

function promisifyOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

export class TruenasVm extends pulumi.ComponentResource {
  public readonly name: string;
  public readonly ipAddress: pulumi.Output<TailscaleIp>;
  public readonly tailscaleIpAddress: TailscaleIp;
  public readonly tailscaleName: pulumi.Output<string>;
  public readonly remoteConnection: types.input.remote.ConnectionArgs;
  public readonly globals: GlobalResources;
  public readonly hostname: pulumi.Output<string>;
  constructor(name: string, args: TruenasVmArgs, opts?: pulumi.ComponentResourceOptions) {
    super("home:truenas:TruenasVM", name, opts);
    const cro = { parent: this };
    this.name = name;
    this.ipAddress = pulumi.output(args.ipAddress);
    this.tailscaleIpAddress = args.tailscaleIpAddress;
    this.tailscaleName = pulumi.interpolate`${name}`;
    this.credential = pulumi.output(args.credential);
    const credentialItem = this.credential.apply((title) => args.globals.store.getSecretByTitle<{ username: string; credential: string }>(title));
    this.globals = args.globals;

    this.hostname = pulumi.interpolate`${name}.${this.globals.searchDomain}`;
    const tailscaleHostname = pulumi.interpolate`${name}.${this.globals.tailscaleDomain}`;

    const connection: types.input.remote.ConnectionArgs = (this.remoteConnection = {
      host: this.ipAddress,
      user: credentialItem.apply((z) => z.username),
      password: credentialItem.apply((z) => z.credential),
    });

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
              username: { type: TypeEnum.String, value: args.globals.proxmoxCredential.username },
              password: { type: TypeEnum.Concealed, value: args.globals.proxmoxCredential.password },
            },
          },
        },
        fields: {
          hostname: { type: TypeEnum.String, value: this.hostname },
          ipAddress: { type: TypeEnum.String, value: this.ipAddress },
          tailscaleIpAddress: { type: TypeEnum.String, value: this.tailscaleIpAddress },
        },
      },
      { parent: this },
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
  public async addClusterBackup(name: string, parent: pulumi.Resource): Promise<TruenasVmResult> {
    const manager = await promisifyOutput(
      pulumi.output(this.credential).apply(async (credential) => {
        return new TrueNASResourceManager(await getTruenasClient(this.globals, credential));
      }),
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

    return {
      longhorn: longhorn?.mountpoint ?? `/mnt/${this.backupDatasetId}/${name}/longhorn`,
      volsync: volsync?.mountpoint ?? `/mnt/${this.backupDatasetId}/${name}/volsync`,
      // backblaze: {
      //   backupCredential: backupCredential,
      //   backup: b2Bucket.bucketName,
      //   backupApplicationKey: b2BucketApplicationKey.applicationKeyId,
      //   database: b2DatabaseBucket.bucketName,
      //   databaseCredential: backupCredential,
      //   databaseApplicationKey: b2DatabaseBucketApplicationKey.applicationKeyId,
      // },
      // truenas: {
      //   backup: minioBucket.bucket,
      //   database: minioDbBucket.bucket,
      // },
    };
  }
}

import * as pulumi from "@pulumi/pulumi";

export { TruenasProvider, TruenasResource } from "./truenas.js";
export { TruenasDatasetProvider, TruenasDataset } from "./truenas-dataset.js";
export { TruenasSmbShareProvider, TruenasSmbShare } from "./truenas-smb-share.js";
export { TruenasNfsShareProvider, TruenasNfsShare } from "./truenas-nfs-share.js";
export { TruenasPoolProvider, TruenasPool } from "./truenas-pool.js";
export { TruenasUserProvider, TruenasUser } from "./truenas-user.js";
export { TruenasGroupProvider, TruenasGroup } from "./truenas-group.js";
export { TruenasDiskProvider, TruenasDisk } from "./truenas-disk.js";
export { TruenasSystemProvider, TruenasSystem } from "./truenas-system.js";
export { TruenasAppProvider, TruenasApp } from "./truenas-app.js";
export type { CustomResourceOptions } from "@pulumi/pulumi";

import { OPClient } from "../../components/op.js";
import { getTruenasClient } from "../../components/truenas.js";
import { TruenasNfsShare } from "./truenas-nfs-share.js";
import { TruenasDataset } from "./truenas-dataset.js";
import { GlobalResources } from "../../stacks/home/globals.js";
import { ProxmoxHost } from "../../stacks/home/ProxmoxHost.js";
export type OnePasswordItem = pulumi.Unwrap<ReturnType<OPClient["getItemByTitle"]>>;

export interface TruenasVmArgs {
  credential: pulumi.Input<string>;
  globals: GlobalResources;
  host: ProxmoxHost;
}

export class TruenasVm extends pulumi.ComponentResource<TruenasVmArgs> {
  constructor(name: string, args: TruenasVmArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:truenas:Vm", name, args, opts);

    const client = pulumi.output(args.credential).apply(getTruenasClient);

    this.credential = pulumi.output(args.credential);
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
  public addClusterBackup(name: string, importExisting?: boolean) {
    return new ClusterBackup(
      name,
      {
        truenas: this,
        import: importExisting,
      },
      { parent: this }
    );
  }
}
export interface ClusterBackupArgs {
  truenas: TruenasVm;
  import?: boolean;
}

export class ClusterBackup extends pulumi.ComponentResource {
  public nfsShare: TruenasNfsShare;
  public volsyncDataset: TruenasDataset;
  public longhornDataset: TruenasDataset;

  constructor(name: string, args: ClusterBackupArgs, options?: pulumi.ComponentResourceOptions) {
    super("custom:truenas:cluster-backup", name, args, options);

    const cro: pulumi.CustomResourceOptions = { parent: this };
    const ccro: pulumi.ComponentResourceOptions = { parent: this };

    const container = new TruenasDataset(
      name,
      {
        credential: args.truenas.credential,
        pool: "stash",
        type: "FILESYSTEM",
        name: pulumi.interpolate`${args.truenas.backupDatasetId}/${name}`,
      },
      {
        ...cro,
        import: args.import ? `${args.truenas.backupDatasetId}/${name}` : undefined,
        retainOnDelete: true,
      }
    );

    this.longhornDataset = new TruenasDataset(
      `${name}-longhorn-dataset`,
      {
        credential: args.truenas.credential,
        pool: "stash",
        type: "FILESYSTEM",
        name: pulumi.interpolate`${args.truenas.backupDatasetId}/longhorn`,
      },
      {
        ...cro,
        import: args.import ? `${args.truenas.backupDatasetId}/${name}/longhorn` : undefined,
        retainOnDelete: true,
      }
    );

    this.volsyncDataset = new TruenasDataset(
      `${name}-volsync-dataset`,
      {
        credential: args.truenas.credential,
        pool: "stash",
        type: "FILESYSTEM",
        name: pulumi.interpolate`${args.truenas.backupDatasetId}/volsync`,
      },
      {
        ...cro,
        import: args.import ? `${args.truenas.backupDatasetId}/${name}/volsync` : undefined,
        retainOnDelete: true,
      }
    );

    this.nfsShare = new TruenasNfsShare(
      `${name}-nfs`,
      {
        credential: args.truenas.credential,
        paths: pulumi.output([this.longhornDataset.mountpoint, this.volsyncDataset.mountpoint]),
        mapall_user: "apps",
        mapall_group: "apps",
      },
      ccro
    );
  }
}

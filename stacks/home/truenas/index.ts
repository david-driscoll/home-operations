import * as pulumi from "@pulumi/pulumi";

export type { CustomResourceOptions } from "@pulumi/pulumi";

import { OPClient } from "../../../components/op.js";
import { ProxmoxHost } from "../ProxmoxHost.js";
import { GlobalResources } from "../globals.js";
import { getTruenasClient } from "../../../components/truenas.js";
import TrueNASResourceManager from "../../../components/truenas/truenas-manager.js";
export type OnePasswordItem = pulumi.Unwrap<ReturnType<OPClient["getItemByTitle"]>>;

export interface TruenasVmArgs {
  credential: pulumi.Input<string>;
  globals: GlobalResources;
  host: ProxmoxHost;
}

export interface ITruenasVm {
  addClusterBackup(name: string): pulumi.Output<{ longhorn: string ; volsync: string ; }>;
}

export class TruenasVm implements ITruenasVm {
  constructor(args: TruenasVmArgs) {
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
  public addClusterBackup(name: string): pulumi.Output<{ longhorn: string ; volsync: string ; }> {
    const manager = pulumi.output(this.credential).apply(async (credential) => {
      return new TrueNASResourceManager(await getTruenasClient(credential));
    });

    return manager.apply(async (manager) => {
      const root = await manager.ensureDataset(`${this.backupDatasetId}/${name}`, {
        type: "FILESYSTEM",
      });
      const longhorn = await manager.ensureDataset(`${this.backupDatasetId}/${name}/longhorn`, { type: "FILESYSTEM" });
      const volsync = await manager.ensureDataset(`${this.backupDatasetId}/${name}/volsync`, { type: "FILESYSTEM" });
      await manager.ensureNFSShare(longhorn.mountpoint!, {
        mapall_user: "apps",
        mapall_group: "apps",
      });
      await manager.ensureNFSShare(volsync.mountpoint!, {
        mapall_user: "apps",
        mapall_group: "apps",
      });

      return {
        longhorn: longhorn.mountpoint!,
        volsync: volsync.mountpoint!,
      };
    });
  }
}

import * as pulumi from "@pulumi/pulumi";
import { createDataset, createSmbShare, createNfsShare } from "../../../dynamic";

// Example: Create a dataset
const myDataset = createDataset("my-dataset", {
  name: "tank/mydata",
  type: "FILESYSTEM",
  compression: "lz4",
  quota: 100 * 1024 * 1024 * 1024, // 100GB
  description: "My application data storage",
});

// Example: Create an SMB share for the dataset
const mySmbShare = createSmbShare(
  "my-smb-share",
  {
    name: "mydata",
    path: "/mnt/tank/mydata",
    comment: "My data SMB share",
    enabled: true,
    browsable: true,
    guestok: false,
    ro: false,
    description: "SMB share for my application data",
  },
  {
    dependsOn: [myDataset],
  }
);

// Example: Create an NFS share for the same dataset
const myNfsShare = createNfsShare(
  "my-nfs-share",
  {
    paths: ["/mnt/tank/mydata"],
    comment: "My data NFS share",
    enabled: true,
    ro: false,
    networks: ["192.168.1.0/24"],
    security: ["SYS"],
    description: "NFS share for my application data",
  },
  {
    dependsOn: [myDataset],
  }
);

// Export resource information
export const datasetPath = myDataset.path;
export const datasetMountpoint = myDataset.mountpoint;
export const smbShareName = mySmbShare.name;
export const nfsSharePaths = myNfsShare.paths;

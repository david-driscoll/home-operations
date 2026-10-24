# u-longhorn: the Longhorn data disk, mounted at /var/mnt/longhorn (the path
# every node's `node.longhorn.io/default-disks-config` annotation names). 1TB
# xfs, not grown. The disk is the node's `data.longhornDisk` CEL selector in
# topf.yaml -- by model where the node has two NVMe drives, by path elsewhere.
apiVersion: v1alpha1
kind: UserVolumeConfig
name: longhorn
provisioning:
  diskSelector:
    match: {{ .Node.Data.longhornDisk | squote }}
  grow: false
  minSize: 1TB
  maxSize: 1TB
filesystem:
  type: xfs

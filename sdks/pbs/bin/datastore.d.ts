import * as pulumi from "@pulumi/pulumi";
export declare class Datastore extends pulumi.CustomResource {
    /**
     * Get an existing Datastore resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: DatastoreState, opts?: pulumi.CustomResourceOptions): Datastore;
    /**
     * Returns true if the given object is an instance of Datastore.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Datastore;
    /**
     * Block size for ZFS datasets (e.g., `4K`, `8K`, `16K`).
     */
    readonly blockSize: pulumi.Output<string | undefined>;
    /**
     * Description for the datastore.
     */
    readonly comment: pulumi.Output<string | undefined>;
    /**
     * Compression algorithm for ZFS. Valid values: `on`, `off`, `lz4`, `zstd`, `gzip`.
     */
    readonly compression: pulumi.Output<string | undefined>;
    /**
     * Content types allowed on this datastore. Valid values: `backup`, `ct`, `iso`, `vztmpl`.
     */
    readonly contents: pulumi.Output<string[]>;
    /**
     * Create base directory if it doesn't exist. Only applicable for directory datastores.
     */
    readonly createBasePath: pulumi.Output<boolean>;
    /**
     * Whether the datastore is disabled.
     */
    readonly disabled: pulumi.Output<boolean>;
    /**
     * Domain for CIFS authentication. Optional for CIFS datastores.
     */
    readonly domain: pulumi.Output<string | undefined>;
    /**
     * NFS export path. Required for NFS datastores.
     */
    readonly export: pulumi.Output<string | undefined>;
    /**
     * Certificate fingerprint for secure connections (network datastores).
     */
    readonly fingerprint: pulumi.Output<string | undefined>;
    /**
     * Garbage collection schedule in cron format (e.g., `daily`, `weekly`, or `0 3 * * 0`).
     */
    readonly gcSchedule: pulumi.Output<string | undefined>;
    /**
     * Maximum number of backups per guest. Set to 0 for unlimited backups.
     */
    readonly maxBackups: pulumi.Output<number | undefined>;
    /**
     * Unique identifier for the datastore.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Notification level. Valid values: `info`, `notice`, `warning`, `error`.
     */
    readonly notifyLevel: pulumi.Output<string | undefined>;
    /**
     * User to send datastore notifications to (e.g., `root@pam`).
     */
    readonly notifyUser: pulumi.Output<string | undefined>;
    /**
     * Mount options for network storage (e.g., `vers=3,soft`).
     */
    readonly options: pulumi.Output<string | undefined>;
    /**
     * Password for CIFS authentication. Optional for CIFS datastores.
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * Path to the datastore. Required for directory datastores, optional for others.
     */
    readonly path: pulumi.Output<string | undefined>;
    /**
     * Prune schedule in cron format (e.g., `daily`, `weekly`, or `0 2 * * *`).
     */
    readonly pruneSchedule: pulumi.Output<string | undefined>;
    /**
     * S3 bucket name for S3 datastores. The bucket must be created beforehand.
     */
    readonly s3Bucket: pulumi.Output<string | undefined>;
    /**
     * S3 endpoint ID for S3 datastores. Must reference an existing S3 endpoint configuration.
     */
    readonly s3Client: pulumi.Output<string | undefined>;
    /**
     * Server hostname or IP address. Required for CIFS/NFS datastores.
     */
    readonly server: pulumi.Output<string | undefined>;
    /**
     * CIFS share name. Required for CIFS datastores.
     */
    readonly share: pulumi.Output<string | undefined>;
    /**
     * Subdirectory on the remote share. Optional for network datastores.
     */
    readonly subDir: pulumi.Output<string | undefined>;
    /**
     * LVM thin pool name. Optional for LVM datastores.
     */
    readonly thinPool: pulumi.Output<string | undefined>;
    /**
     * Tuning level for performance optimization (0-4).
     */
    readonly tuneLevel: pulumi.Output<number | undefined>;
    /**
     * Type of datastore backend. Valid values: `dir`, `zfs`, `lvm`, `cifs`, `nfs`, `s3`.
     */
    readonly type: pulumi.Output<string>;
    /**
     * Username for CIFS authentication. Optional for CIFS datastores.
     */
    readonly username: pulumi.Output<string | undefined>;
    /**
     * LVM volume group name. Required for LVM datastores.
     */
    readonly volumeGroup: pulumi.Output<string | undefined>;
    /**
     * ZFS dataset name. Optional for ZFS datastores.
     */
    readonly zfsDataset: pulumi.Output<string | undefined>;
    /**
     * ZFS pool name. Required for ZFS datastores.
     */
    readonly zfsPool: pulumi.Output<string | undefined>;
    /**
     * Create a Datastore resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: DatastoreArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Datastore resources.
 */
export interface DatastoreState {
    /**
     * Block size for ZFS datasets (e.g., `4K`, `8K`, `16K`).
     */
    blockSize?: pulumi.Input<string>;
    /**
     * Description for the datastore.
     */
    comment?: pulumi.Input<string>;
    /**
     * Compression algorithm for ZFS. Valid values: `on`, `off`, `lz4`, `zstd`, `gzip`.
     */
    compression?: pulumi.Input<string>;
    /**
     * Content types allowed on this datastore. Valid values: `backup`, `ct`, `iso`, `vztmpl`.
     */
    contents?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Create base directory if it doesn't exist. Only applicable for directory datastores.
     */
    createBasePath?: pulumi.Input<boolean>;
    /**
     * Whether the datastore is disabled.
     */
    disabled?: pulumi.Input<boolean>;
    /**
     * Domain for CIFS authentication. Optional for CIFS datastores.
     */
    domain?: pulumi.Input<string>;
    /**
     * NFS export path. Required for NFS datastores.
     */
    export?: pulumi.Input<string>;
    /**
     * Certificate fingerprint for secure connections (network datastores).
     */
    fingerprint?: pulumi.Input<string>;
    /**
     * Garbage collection schedule in cron format (e.g., `daily`, `weekly`, or `0 3 * * 0`).
     */
    gcSchedule?: pulumi.Input<string>;
    /**
     * Maximum number of backups per guest. Set to 0 for unlimited backups.
     */
    maxBackups?: pulumi.Input<number>;
    /**
     * Unique identifier for the datastore.
     */
    name?: pulumi.Input<string>;
    /**
     * Notification level. Valid values: `info`, `notice`, `warning`, `error`.
     */
    notifyLevel?: pulumi.Input<string>;
    /**
     * User to send datastore notifications to (e.g., `root@pam`).
     */
    notifyUser?: pulumi.Input<string>;
    /**
     * Mount options for network storage (e.g., `vers=3,soft`).
     */
    options?: pulumi.Input<string>;
    /**
     * Password for CIFS authentication. Optional for CIFS datastores.
     */
    password?: pulumi.Input<string>;
    /**
     * Path to the datastore. Required for directory datastores, optional for others.
     */
    path?: pulumi.Input<string>;
    /**
     * Prune schedule in cron format (e.g., `daily`, `weekly`, or `0 2 * * *`).
     */
    pruneSchedule?: pulumi.Input<string>;
    /**
     * S3 bucket name for S3 datastores. The bucket must be created beforehand.
     */
    s3Bucket?: pulumi.Input<string>;
    /**
     * S3 endpoint ID for S3 datastores. Must reference an existing S3 endpoint configuration.
     */
    s3Client?: pulumi.Input<string>;
    /**
     * Server hostname or IP address. Required for CIFS/NFS datastores.
     */
    server?: pulumi.Input<string>;
    /**
     * CIFS share name. Required for CIFS datastores.
     */
    share?: pulumi.Input<string>;
    /**
     * Subdirectory on the remote share. Optional for network datastores.
     */
    subDir?: pulumi.Input<string>;
    /**
     * LVM thin pool name. Optional for LVM datastores.
     */
    thinPool?: pulumi.Input<string>;
    /**
     * Tuning level for performance optimization (0-4).
     */
    tuneLevel?: pulumi.Input<number>;
    /**
     * Type of datastore backend. Valid values: `dir`, `zfs`, `lvm`, `cifs`, `nfs`, `s3`.
     */
    type?: pulumi.Input<string>;
    /**
     * Username for CIFS authentication. Optional for CIFS datastores.
     */
    username?: pulumi.Input<string>;
    /**
     * LVM volume group name. Required for LVM datastores.
     */
    volumeGroup?: pulumi.Input<string>;
    /**
     * ZFS dataset name. Optional for ZFS datastores.
     */
    zfsDataset?: pulumi.Input<string>;
    /**
     * ZFS pool name. Required for ZFS datastores.
     */
    zfsPool?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Datastore resource.
 */
export interface DatastoreArgs {
    /**
     * Block size for ZFS datasets (e.g., `4K`, `8K`, `16K`).
     */
    blockSize?: pulumi.Input<string>;
    /**
     * Description for the datastore.
     */
    comment?: pulumi.Input<string>;
    /**
     * Compression algorithm for ZFS. Valid values: `on`, `off`, `lz4`, `zstd`, `gzip`.
     */
    compression?: pulumi.Input<string>;
    /**
     * Content types allowed on this datastore. Valid values: `backup`, `ct`, `iso`, `vztmpl`.
     */
    contents?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Create base directory if it doesn't exist. Only applicable for directory datastores.
     */
    createBasePath?: pulumi.Input<boolean>;
    /**
     * Whether the datastore is disabled.
     */
    disabled?: pulumi.Input<boolean>;
    /**
     * Domain for CIFS authentication. Optional for CIFS datastores.
     */
    domain?: pulumi.Input<string>;
    /**
     * NFS export path. Required for NFS datastores.
     */
    export?: pulumi.Input<string>;
    /**
     * Certificate fingerprint for secure connections (network datastores).
     */
    fingerprint?: pulumi.Input<string>;
    /**
     * Garbage collection schedule in cron format (e.g., `daily`, `weekly`, or `0 3 * * 0`).
     */
    gcSchedule?: pulumi.Input<string>;
    /**
     * Maximum number of backups per guest. Set to 0 for unlimited backups.
     */
    maxBackups?: pulumi.Input<number>;
    /**
     * Unique identifier for the datastore.
     */
    name?: pulumi.Input<string>;
    /**
     * Notification level. Valid values: `info`, `notice`, `warning`, `error`.
     */
    notifyLevel?: pulumi.Input<string>;
    /**
     * User to send datastore notifications to (e.g., `root@pam`).
     */
    notifyUser?: pulumi.Input<string>;
    /**
     * Mount options for network storage (e.g., `vers=3,soft`).
     */
    options?: pulumi.Input<string>;
    /**
     * Password for CIFS authentication. Optional for CIFS datastores.
     */
    password?: pulumi.Input<string>;
    /**
     * Path to the datastore. Required for directory datastores, optional for others.
     */
    path?: pulumi.Input<string>;
    /**
     * Prune schedule in cron format (e.g., `daily`, `weekly`, or `0 2 * * *`).
     */
    pruneSchedule?: pulumi.Input<string>;
    /**
     * S3 bucket name for S3 datastores. The bucket must be created beforehand.
     */
    s3Bucket?: pulumi.Input<string>;
    /**
     * S3 endpoint ID for S3 datastores. Must reference an existing S3 endpoint configuration.
     */
    s3Client?: pulumi.Input<string>;
    /**
     * Server hostname or IP address. Required for CIFS/NFS datastores.
     */
    server?: pulumi.Input<string>;
    /**
     * CIFS share name. Required for CIFS datastores.
     */
    share?: pulumi.Input<string>;
    /**
     * Subdirectory on the remote share. Optional for network datastores.
     */
    subDir?: pulumi.Input<string>;
    /**
     * LVM thin pool name. Optional for LVM datastores.
     */
    thinPool?: pulumi.Input<string>;
    /**
     * Tuning level for performance optimization (0-4).
     */
    tuneLevel?: pulumi.Input<number>;
    /**
     * Type of datastore backend. Valid values: `dir`, `zfs`, `lvm`, `cifs`, `nfs`, `s3`.
     */
    type: pulumi.Input<string>;
    /**
     * Username for CIFS authentication. Optional for CIFS datastores.
     */
    username?: pulumi.Input<string>;
    /**
     * LVM volume group name. Required for LVM datastores.
     */
    volumeGroup?: pulumi.Input<string>;
    /**
     * ZFS dataset name. Optional for ZFS datastores.
     */
    zfsDataset?: pulumi.Input<string>;
    /**
     * ZFS pool name. Required for ZFS datastores.
     */
    zfsPool?: pulumi.Input<string>;
}

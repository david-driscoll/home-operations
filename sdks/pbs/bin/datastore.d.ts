import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * UUID of the filesystem partition for a removable datastore (e.g., `01234567-89ab-cdef-0123-456789abcdef`).
     */
    readonly backingDevice: pulumi.Output<string | undefined>;
    /**
     * Description for the datastore.
     */
    readonly comment: pulumi.Output<string | undefined>;
    /**
     * Opaque digest returned by PBS for optimistic locking.
     */
    readonly digest: pulumi.Output<string>;
    /**
     * Whether the datastore is disabled.
     */
    readonly disabled: pulumi.Output<boolean>;
    /**
     * Certificate fingerprint for secure connections (S3 datastores).
     */
    readonly fingerprint: pulumi.Output<string | undefined>;
    /**
     * Garbage collection schedule in cron format (e.g., `daily`, `weekly`, or `0 3 * * 0`).
     */
    readonly gcSchedule: pulumi.Output<string | undefined>;
    /**
     * Number of daily backups to keep when pruning.
     */
    readonly keepDaily: pulumi.Output<number | undefined>;
    /**
     * Number of hourly backups to keep when pruning.
     */
    readonly keepHourly: pulumi.Output<number | undefined>;
    /**
     * Number of latest backups to keep when pruning.
     */
    readonly keepLast: pulumi.Output<number | undefined>;
    /**
     * Number of monthly backups to keep when pruning.
     */
    readonly keepMonthly: pulumi.Output<number | undefined>;
    /**
     * Number of weekly backups to keep when pruning.
     */
    readonly keepWeekly: pulumi.Output<number | undefined>;
    /**
     * Number of yearly backups to keep when pruning.
     */
    readonly keepYearly: pulumi.Output<number | undefined>;
    /**
     * Maintenance mode configuration allowing `offline` or `read-only` modes with optional message.
     */
    readonly maintenanceMode: pulumi.Output<outputs.DatastoreMaintenanceMode | undefined>;
    /**
     * Unique identifier for the datastore.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Notification delivery mode. Valid values: `legacy-sendmail`, `notification-system`.
     */
    readonly notificationMode: pulumi.Output<string | undefined>;
    /**
     * Per-job notification settings overriding datastore defaults.
     */
    readonly notify: pulumi.Output<outputs.DatastoreNotify | undefined>;
    /**
     * Notification level. Valid values: `info`, `notice`, `warning`, `error`.
     */
    readonly notifyLevel: pulumi.Output<string | undefined>;
    /**
     * User to send datastore notifications to (e.g., `root@pam`).
     */
    readonly notifyUser: pulumi.Output<string | undefined>;
    /**
     * Allow overwriting chunks that are currently in use.
     */
    readonly overwriteInUse: pulumi.Output<boolean | undefined>;
    /**
     * Filesystem path to the datastore data. Required for directory datastores and used as the local cache directory for S3 datastores.
     */
    readonly path: pulumi.Output<string | undefined>;
    /**
     * Prune schedule in cron format (e.g., `daily`, `weekly`, or `0 2 * * *`).
     *
     * @deprecated Deprecated
     */
    readonly pruneSchedule: pulumi.Output<string | undefined>;
    /**
     * Set to `true` to manage a removable datastore backed by a device UUID.
     */
    readonly removable: pulumi.Output<boolean>;
    /**
     * Reuse existing datastore chunks when possible.
     */
    readonly reuseDatastore: pulumi.Output<boolean | undefined>;
    /**
     * S3 bucket name for S3 datastores. The bucket must be created beforehand.
     */
    readonly s3Bucket: pulumi.Output<string | undefined>;
    /**
     * S3 endpoint ID for S3 datastores. Must reference an existing S3 endpoint configuration.
     */
    readonly s3Client: pulumi.Output<string | undefined>;
    /**
     * Tuning level for performance optimization (0-4).
     *
     * @deprecated Deprecated
     */
    readonly tuneLevel: pulumi.Output<number | undefined>;
    /**
     * Advanced tuning options for datastore behaviour such as chunk order and sync level.
     */
    readonly tuning: pulumi.Output<outputs.DatastoreTuning | undefined>;
    /**
     * Verify newly created snapshots immediately after backup.
     */
    readonly verifyNew: pulumi.Output<boolean | undefined>;
    /**
     * Create a Datastore resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: DatastoreArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Datastore resources.
 */
export interface DatastoreState {
    /**
     * UUID of the filesystem partition for a removable datastore (e.g., `01234567-89ab-cdef-0123-456789abcdef`).
     */
    backingDevice?: pulumi.Input<string>;
    /**
     * Description for the datastore.
     */
    comment?: pulumi.Input<string>;
    /**
     * Opaque digest returned by PBS for optimistic locking.
     */
    digest?: pulumi.Input<string>;
    /**
     * Whether the datastore is disabled.
     */
    disabled?: pulumi.Input<boolean>;
    /**
     * Certificate fingerprint for secure connections (S3 datastores).
     */
    fingerprint?: pulumi.Input<string>;
    /**
     * Garbage collection schedule in cron format (e.g., `daily`, `weekly`, or `0 3 * * 0`).
     */
    gcSchedule?: pulumi.Input<string>;
    /**
     * Number of daily backups to keep when pruning.
     */
    keepDaily?: pulumi.Input<number>;
    /**
     * Number of hourly backups to keep when pruning.
     */
    keepHourly?: pulumi.Input<number>;
    /**
     * Number of latest backups to keep when pruning.
     */
    keepLast?: pulumi.Input<number>;
    /**
     * Number of monthly backups to keep when pruning.
     */
    keepMonthly?: pulumi.Input<number>;
    /**
     * Number of weekly backups to keep when pruning.
     */
    keepWeekly?: pulumi.Input<number>;
    /**
     * Number of yearly backups to keep when pruning.
     */
    keepYearly?: pulumi.Input<number>;
    /**
     * Maintenance mode configuration allowing `offline` or `read-only` modes with optional message.
     */
    maintenanceMode?: pulumi.Input<inputs.DatastoreMaintenanceMode>;
    /**
     * Unique identifier for the datastore.
     */
    name?: pulumi.Input<string>;
    /**
     * Notification delivery mode. Valid values: `legacy-sendmail`, `notification-system`.
     */
    notificationMode?: pulumi.Input<string>;
    /**
     * Per-job notification settings overriding datastore defaults.
     */
    notify?: pulumi.Input<inputs.DatastoreNotify>;
    /**
     * Notification level. Valid values: `info`, `notice`, `warning`, `error`.
     */
    notifyLevel?: pulumi.Input<string>;
    /**
     * User to send datastore notifications to (e.g., `root@pam`).
     */
    notifyUser?: pulumi.Input<string>;
    /**
     * Allow overwriting chunks that are currently in use.
     */
    overwriteInUse?: pulumi.Input<boolean>;
    /**
     * Filesystem path to the datastore data. Required for directory datastores and used as the local cache directory for S3 datastores.
     */
    path?: pulumi.Input<string>;
    /**
     * Prune schedule in cron format (e.g., `daily`, `weekly`, or `0 2 * * *`).
     *
     * @deprecated Deprecated
     */
    pruneSchedule?: pulumi.Input<string>;
    /**
     * Set to `true` to manage a removable datastore backed by a device UUID.
     */
    removable?: pulumi.Input<boolean>;
    /**
     * Reuse existing datastore chunks when possible.
     */
    reuseDatastore?: pulumi.Input<boolean>;
    /**
     * S3 bucket name for S3 datastores. The bucket must be created beforehand.
     */
    s3Bucket?: pulumi.Input<string>;
    /**
     * S3 endpoint ID for S3 datastores. Must reference an existing S3 endpoint configuration.
     */
    s3Client?: pulumi.Input<string>;
    /**
     * Tuning level for performance optimization (0-4).
     *
     * @deprecated Deprecated
     */
    tuneLevel?: pulumi.Input<number>;
    /**
     * Advanced tuning options for datastore behaviour such as chunk order and sync level.
     */
    tuning?: pulumi.Input<inputs.DatastoreTuning>;
    /**
     * Verify newly created snapshots immediately after backup.
     */
    verifyNew?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a Datastore resource.
 */
export interface DatastoreArgs {
    /**
     * UUID of the filesystem partition for a removable datastore (e.g., `01234567-89ab-cdef-0123-456789abcdef`).
     */
    backingDevice?: pulumi.Input<string>;
    /**
     * Description for the datastore.
     */
    comment?: pulumi.Input<string>;
    /**
     * Opaque digest returned by PBS for optimistic locking.
     */
    digest?: pulumi.Input<string>;
    /**
     * Whether the datastore is disabled.
     */
    disabled?: pulumi.Input<boolean>;
    /**
     * Certificate fingerprint for secure connections (S3 datastores).
     */
    fingerprint?: pulumi.Input<string>;
    /**
     * Garbage collection schedule in cron format (e.g., `daily`, `weekly`, or `0 3 * * 0`).
     */
    gcSchedule?: pulumi.Input<string>;
    /**
     * Number of daily backups to keep when pruning.
     */
    keepDaily?: pulumi.Input<number>;
    /**
     * Number of hourly backups to keep when pruning.
     */
    keepHourly?: pulumi.Input<number>;
    /**
     * Number of latest backups to keep when pruning.
     */
    keepLast?: pulumi.Input<number>;
    /**
     * Number of monthly backups to keep when pruning.
     */
    keepMonthly?: pulumi.Input<number>;
    /**
     * Number of weekly backups to keep when pruning.
     */
    keepWeekly?: pulumi.Input<number>;
    /**
     * Number of yearly backups to keep when pruning.
     */
    keepYearly?: pulumi.Input<number>;
    /**
     * Maintenance mode configuration allowing `offline` or `read-only` modes with optional message.
     */
    maintenanceMode?: pulumi.Input<inputs.DatastoreMaintenanceMode>;
    /**
     * Unique identifier for the datastore.
     */
    name?: pulumi.Input<string>;
    /**
     * Notification delivery mode. Valid values: `legacy-sendmail`, `notification-system`.
     */
    notificationMode?: pulumi.Input<string>;
    /**
     * Per-job notification settings overriding datastore defaults.
     */
    notify?: pulumi.Input<inputs.DatastoreNotify>;
    /**
     * Notification level. Valid values: `info`, `notice`, `warning`, `error`.
     */
    notifyLevel?: pulumi.Input<string>;
    /**
     * User to send datastore notifications to (e.g., `root@pam`).
     */
    notifyUser?: pulumi.Input<string>;
    /**
     * Allow overwriting chunks that are currently in use.
     */
    overwriteInUse?: pulumi.Input<boolean>;
    /**
     * Filesystem path to the datastore data. Required for directory datastores and used as the local cache directory for S3 datastores.
     */
    path?: pulumi.Input<string>;
    /**
     * Prune schedule in cron format (e.g., `daily`, `weekly`, or `0 2 * * *`).
     *
     * @deprecated Deprecated
     */
    pruneSchedule?: pulumi.Input<string>;
    /**
     * Set to `true` to manage a removable datastore backed by a device UUID.
     */
    removable?: pulumi.Input<boolean>;
    /**
     * Reuse existing datastore chunks when possible.
     */
    reuseDatastore?: pulumi.Input<boolean>;
    /**
     * S3 bucket name for S3 datastores. The bucket must be created beforehand.
     */
    s3Bucket?: pulumi.Input<string>;
    /**
     * S3 endpoint ID for S3 datastores. Must reference an existing S3 endpoint configuration.
     */
    s3Client?: pulumi.Input<string>;
    /**
     * Tuning level for performance optimization (0-4).
     *
     * @deprecated Deprecated
     */
    tuneLevel?: pulumi.Input<number>;
    /**
     * Advanced tuning options for datastore behaviour such as chunk order and sync level.
     */
    tuning?: pulumi.Input<inputs.DatastoreTuning>;
    /**
     * Verify newly created snapshots immediately after backup.
     */
    verifyNew?: pulumi.Input<boolean>;
}

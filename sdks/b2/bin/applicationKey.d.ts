import * as pulumi from "@pulumi/pulumi";
export declare class ApplicationKey extends pulumi.CustomResource {
    /**
     * Get an existing ApplicationKey resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ApplicationKeyState, opts?: pulumi.CustomResourceOptions): ApplicationKey;
    /**
     * Returns true if the given object is an instance of ApplicationKey.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ApplicationKey;
    /**
     * The key.
     */
    readonly applicationKey: pulumi.Output<string>;
    /**
     * The ID of the newly created key.
     */
    readonly applicationKeyId: pulumi.Output<string>;
    readonly b2ApplicationKeyId: pulumi.Output<string>;
    /**
     * When present, restricts access to one bucket. Conflicts with `bucket_ids`. **Modifying this attribute will force creation of a new resource.**
     *
     * @deprecated Deprecated
     */
    readonly bucketId: pulumi.Output<string | undefined>;
    /**
     * When provided, the new key can only access the specified buckets. Conflicts with `bucket_id`. **Modifying this attribute will force creation of a new resource.**
     */
    readonly bucketIds: pulumi.Output<string[] | undefined>;
    /**
     * A set of strings, each one naming a capability the key has. **Modifying this attribute will force creation of a new resource.**
     */
    readonly capabilities: pulumi.Output<string[]>;
    /**
     * When present, says when this key will expire, in milliseconds since 1970.
     */
    readonly expirationTimestamp: pulumi.Output<number>;
    /**
     * The name of the key. **Modifying this attribute will force creation of a new resource.**
     */
    readonly keyName: pulumi.Output<string>;
    /**
     * When present, restricts access to files whose names start with the prefix. **Modifying this attribute will force creation of a new resource.**
     */
    readonly namePrefix: pulumi.Output<string | undefined>;
    /**
     * List of application key options.
     */
    readonly options: pulumi.Output<string[]>;
    /**
     * When provided, the key will expire after the given number of seconds, and will have expirationTimestamp set. Value must be a positive integer, and must be less than 1000 days (in seconds). **Modifying this attribute will force creation of a new resource.**
     */
    readonly validDurationInSeconds: pulumi.Output<number | undefined>;
    /**
     * Create a ApplicationKey resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ApplicationKeyArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ApplicationKey resources.
 */
export interface ApplicationKeyState {
    /**
     * The key.
     */
    applicationKey?: pulumi.Input<string | undefined>;
    /**
     * The ID of the newly created key.
     */
    applicationKeyId?: pulumi.Input<string | undefined>;
    b2ApplicationKeyId?: pulumi.Input<string | undefined>;
    /**
     * When present, restricts access to one bucket. Conflicts with `bucket_ids`. **Modifying this attribute will force creation of a new resource.**
     *
     * @deprecated Deprecated
     */
    bucketId?: pulumi.Input<string | undefined>;
    /**
     * When provided, the new key can only access the specified buckets. Conflicts with `bucket_id`. **Modifying this attribute will force creation of a new resource.**
     */
    bucketIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * A set of strings, each one naming a capability the key has. **Modifying this attribute will force creation of a new resource.**
     */
    capabilities?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * When present, says when this key will expire, in milliseconds since 1970.
     */
    expirationTimestamp?: pulumi.Input<number | undefined>;
    /**
     * The name of the key. **Modifying this attribute will force creation of a new resource.**
     */
    keyName?: pulumi.Input<string | undefined>;
    /**
     * When present, restricts access to files whose names start with the prefix. **Modifying this attribute will force creation of a new resource.**
     */
    namePrefix?: pulumi.Input<string | undefined>;
    /**
     * List of application key options.
     */
    options?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * When provided, the key will expire after the given number of seconds, and will have expirationTimestamp set. Value must be a positive integer, and must be less than 1000 days (in seconds). **Modifying this attribute will force creation of a new resource.**
     */
    validDurationInSeconds?: pulumi.Input<number | undefined>;
}
/**
 * The set of arguments for constructing a ApplicationKey resource.
 */
export interface ApplicationKeyArgs {
    b2ApplicationKeyId?: pulumi.Input<string | undefined>;
    /**
     * When present, restricts access to one bucket. Conflicts with `bucket_ids`. **Modifying this attribute will force creation of a new resource.**
     *
     * @deprecated Deprecated
     */
    bucketId?: pulumi.Input<string | undefined>;
    /**
     * When provided, the new key can only access the specified buckets. Conflicts with `bucket_id`. **Modifying this attribute will force creation of a new resource.**
     */
    bucketIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * A set of strings, each one naming a capability the key has. **Modifying this attribute will force creation of a new resource.**
     */
    capabilities: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the key. **Modifying this attribute will force creation of a new resource.**
     */
    keyName: pulumi.Input<string>;
    /**
     * When present, restricts access to files whose names start with the prefix. **Modifying this attribute will force creation of a new resource.**
     */
    namePrefix?: pulumi.Input<string | undefined>;
    /**
     * When provided, the key will expire after the given number of seconds, and will have expirationTimestamp set. Value must be a positive integer, and must be less than 1000 days (in seconds). **Modifying this attribute will force creation of a new resource.**
     */
    validDurationInSeconds?: pulumi.Input<number | undefined>;
}
//# sourceMappingURL=applicationKey.d.ts.map
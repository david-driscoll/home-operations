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
     * When present, restricts access to one bucket.
     */
    readonly bucketId: pulumi.Output<string | undefined>;
    /**
     * A set of strings, each one naming a capability the key has.
     */
    readonly capabilities: pulumi.Output<string[]>;
    /**
     * The name of the key.
     */
    readonly keyName: pulumi.Output<string>;
    /**
     * When present, restricts access to files whose names start with the prefix.
     */
    readonly namePrefix: pulumi.Output<string | undefined>;
    /**
     * List of application key options.
     */
    readonly options: pulumi.Output<string[]>;
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
    applicationKey?: pulumi.Input<string>;
    /**
     * The ID of the newly created key.
     */
    applicationKeyId?: pulumi.Input<string>;
    b2ApplicationKeyId?: pulumi.Input<string>;
    /**
     * When present, restricts access to one bucket.
     */
    bucketId?: pulumi.Input<string>;
    /**
     * A set of strings, each one naming a capability the key has.
     */
    capabilities?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the key.
     */
    keyName?: pulumi.Input<string>;
    /**
     * When present, restricts access to files whose names start with the prefix.
     */
    namePrefix?: pulumi.Input<string>;
    /**
     * List of application key options.
     */
    options?: pulumi.Input<pulumi.Input<string>[]>;
}
/**
 * The set of arguments for constructing a ApplicationKey resource.
 */
export interface ApplicationKeyArgs {
    b2ApplicationKeyId?: pulumi.Input<string>;
    /**
     * When present, restricts access to one bucket.
     */
    bucketId?: pulumi.Input<string>;
    /**
     * A set of strings, each one naming a capability the key has.
     */
    capabilities: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the key.
     */
    keyName: pulumi.Input<string>;
    /**
     * When present, restricts access to files whose names start with the prefix.
     */
    namePrefix?: pulumi.Input<string>;
}

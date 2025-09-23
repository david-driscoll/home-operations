import * as pulumi from "@pulumi/pulumi";
export declare class EnterpriseLicense extends pulumi.CustomResource {
    /**
     * Get an existing EnterpriseLicense resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: EnterpriseLicenseState, opts?: pulumi.CustomResourceOptions): EnterpriseLicense;
    /**
     * Returns true if the given object is an instance of EnterpriseLicense.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is EnterpriseLicense;
    readonly enterpriseLicenseId: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly expiry: pulumi.Output<number>;
    /**
     * Generated.
     */
    readonly externalUsers: pulumi.Output<number>;
    /**
     * Generated.
     */
    readonly internalUsers: pulumi.Output<number>;
    readonly key: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Create a EnterpriseLicense resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: EnterpriseLicenseArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering EnterpriseLicense resources.
 */
export interface EnterpriseLicenseState {
    enterpriseLicenseId?: pulumi.Input<string>;
    /**
     * Generated.
     */
    expiry?: pulumi.Input<number>;
    /**
     * Generated.
     */
    externalUsers?: pulumi.Input<number>;
    /**
     * Generated.
     */
    internalUsers?: pulumi.Input<number>;
    key?: pulumi.Input<string>;
    /**
     * Generated.
     */
    name?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a EnterpriseLicense resource.
 */
export interface EnterpriseLicenseArgs {
    enterpriseLicenseId?: pulumi.Input<string>;
    key: pulumi.Input<string>;
}

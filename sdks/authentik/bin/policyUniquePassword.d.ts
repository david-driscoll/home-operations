import * as pulumi from "@pulumi/pulumi";
export declare class PolicyUniquePassword extends pulumi.CustomResource {
    /**
     * Get an existing PolicyUniquePassword resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PolicyUniquePasswordState, opts?: pulumi.CustomResourceOptions): PolicyUniquePassword;
    /**
     * Returns true if the given object is an instance of PolicyUniquePassword.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PolicyUniquePassword;
    /**
     * Defaults to `false`.
     */
    readonly executionLogging: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Defaults to `1`.
     */
    readonly numHistoricalPasswords: pulumi.Output<number | undefined>;
    /**
     * Defaults to `password`.
     */
    readonly passwordField: pulumi.Output<string | undefined>;
    readonly policyUniquePasswordId: pulumi.Output<string>;
    /**
     * Create a PolicyUniquePassword resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: PolicyUniquePasswordArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PolicyUniquePassword resources.
 */
export interface PolicyUniquePasswordState {
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `1`.
     */
    numHistoricalPasswords?: pulumi.Input<number>;
    /**
     * Defaults to `password`.
     */
    passwordField?: pulumi.Input<string>;
    policyUniquePasswordId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PolicyUniquePassword resource.
 */
export interface PolicyUniquePasswordArgs {
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `1`.
     */
    numHistoricalPasswords?: pulumi.Input<number>;
    /**
     * Defaults to `password`.
     */
    passwordField?: pulumi.Input<string>;
    policyUniquePasswordId?: pulumi.Input<string>;
}

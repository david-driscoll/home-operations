import * as pulumi from "@pulumi/pulumi";
export declare class PolicyDummy extends pulumi.CustomResource {
    /**
     * Get an existing PolicyDummy resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PolicyDummyState, opts?: pulumi.CustomResourceOptions): PolicyDummy;
    /**
     * Returns true if the given object is an instance of PolicyDummy.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PolicyDummy;
    /**
     * Defaults to `false`.
     */
    readonly executionLogging: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly policyDummyId: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly result: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `30`.
     */
    readonly waitMax: pulumi.Output<number | undefined>;
    /**
     * Defaults to `5`.
     */
    readonly waitMin: pulumi.Output<number | undefined>;
    /**
     * Create a PolicyDummy resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: PolicyDummyArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PolicyDummy resources.
 */
export interface PolicyDummyState {
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    policyDummyId?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    result?: pulumi.Input<boolean>;
    /**
     * Defaults to `30`.
     */
    waitMax?: pulumi.Input<number>;
    /**
     * Defaults to `5`.
     */
    waitMin?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a PolicyDummy resource.
 */
export interface PolicyDummyArgs {
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    policyDummyId?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    result?: pulumi.Input<boolean>;
    /**
     * Defaults to `30`.
     */
    waitMax?: pulumi.Input<number>;
    /**
     * Defaults to `5`.
     */
    waitMin?: pulumi.Input<number>;
}

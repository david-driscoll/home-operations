import * as pulumi from "@pulumi/pulumi";
export declare class PolicyReputation extends pulumi.CustomResource {
    /**
     * Get an existing PolicyReputation resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PolicyReputationState, opts?: pulumi.CustomResourceOptions): PolicyReputation;
    /**
     * Returns true if the given object is an instance of PolicyReputation.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PolicyReputation;
    /**
     * Defaults to `true`.
     */
    readonly checkIp: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly checkUsername: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly executionLogging: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly policyReputationId: pulumi.Output<string>;
    /**
     * Defaults to `10`.
     */
    readonly threshold: pulumi.Output<number | undefined>;
    /**
     * Create a PolicyReputation resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: PolicyReputationArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PolicyReputation resources.
 */
export interface PolicyReputationState {
    /**
     * Defaults to `true`.
     */
    checkIp?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    checkUsername?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    policyReputationId?: pulumi.Input<string>;
    /**
     * Defaults to `10`.
     */
    threshold?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a PolicyReputation resource.
 */
export interface PolicyReputationArgs {
    /**
     * Defaults to `true`.
     */
    checkIp?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    checkUsername?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    policyReputationId?: pulumi.Input<string>;
    /**
     * Defaults to `10`.
     */
    threshold?: pulumi.Input<number>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class PolicyBinding extends pulumi.CustomResource {
    /**
     * Get an existing PolicyBinding resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PolicyBindingState, opts?: pulumi.CustomResourceOptions): PolicyBinding;
    /**
     * Returns true if the given object is an instance of PolicyBinding.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PolicyBinding;
    /**
     * Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly failureResult: pulumi.Output<boolean | undefined>;
    /**
     * UUID of the group
     */
    readonly group: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly negate: pulumi.Output<boolean | undefined>;
    readonly order: pulumi.Output<number>;
    /**
     * UUID of the policy
     */
    readonly policy: pulumi.Output<string | undefined>;
    readonly policyBindingId: pulumi.Output<string>;
    /**
     * ID of the object this binding should apply to
     */
    readonly target: pulumi.Output<string>;
    /**
     * Defaults to `30`.
     */
    readonly timeout: pulumi.Output<number | undefined>;
    /**
     * PK of the user
     */
    readonly user: pulumi.Output<number | undefined>;
    /**
     * Create a PolicyBinding resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PolicyBindingArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PolicyBinding resources.
 */
export interface PolicyBindingState {
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    failureResult?: pulumi.Input<boolean>;
    /**
     * UUID of the group
     */
    group?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    negate?: pulumi.Input<boolean>;
    order?: pulumi.Input<number>;
    /**
     * UUID of the policy
     */
    policy?: pulumi.Input<string>;
    policyBindingId?: pulumi.Input<string>;
    /**
     * ID of the object this binding should apply to
     */
    target?: pulumi.Input<string>;
    /**
     * Defaults to `30`.
     */
    timeout?: pulumi.Input<number>;
    /**
     * PK of the user
     */
    user?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a PolicyBinding resource.
 */
export interface PolicyBindingArgs {
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    failureResult?: pulumi.Input<boolean>;
    /**
     * UUID of the group
     */
    group?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    negate?: pulumi.Input<boolean>;
    order: pulumi.Input<number>;
    /**
     * UUID of the policy
     */
    policy?: pulumi.Input<string>;
    policyBindingId?: pulumi.Input<string>;
    /**
     * ID of the object this binding should apply to
     */
    target: pulumi.Input<string>;
    /**
     * Defaults to `30`.
     */
    timeout?: pulumi.Input<number>;
    /**
     * PK of the user
     */
    user?: pulumi.Input<number>;
}

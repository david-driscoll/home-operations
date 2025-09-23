import * as pulumi from "@pulumi/pulumi";
export declare class FlowStageBinding extends pulumi.CustomResource {
    /**
     * Get an existing FlowStageBinding resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: FlowStageBindingState, opts?: pulumi.CustomResourceOptions): FlowStageBinding;
    /**
     * Returns true if the given object is an instance of FlowStageBinding.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is FlowStageBinding;
    /**
     * Evaluate policies during the Flow planning process. Defaults to `true`.
     */
    readonly evaluateOnPlan: pulumi.Output<boolean | undefined>;
    readonly flowStageBindingId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `retry`
     *   - `restart`
     *   - `restart_with_context`
     *  Defaults to `retry`.
     */
    readonly invalidResponseAction: pulumi.Output<string | undefined>;
    readonly order: pulumi.Output<number>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    /**
     * Evaluate policies when the Stage is present to the user. Defaults to `false`.
     */
    readonly reEvaluatePolicies: pulumi.Output<boolean | undefined>;
    readonly stage: pulumi.Output<string>;
    readonly target: pulumi.Output<string>;
    /**
     * Create a FlowStageBinding resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: FlowStageBindingArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering FlowStageBinding resources.
 */
export interface FlowStageBindingState {
    /**
     * Evaluate policies during the Flow planning process. Defaults to `true`.
     */
    evaluateOnPlan?: pulumi.Input<boolean>;
    flowStageBindingId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `retry`
     *   - `restart`
     *   - `restart_with_context`
     *  Defaults to `retry`.
     */
    invalidResponseAction?: pulumi.Input<string>;
    order?: pulumi.Input<number>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    /**
     * Evaluate policies when the Stage is present to the user. Defaults to `false`.
     */
    reEvaluatePolicies?: pulumi.Input<boolean>;
    stage?: pulumi.Input<string>;
    target?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a FlowStageBinding resource.
 */
export interface FlowStageBindingArgs {
    /**
     * Evaluate policies during the Flow planning process. Defaults to `true`.
     */
    evaluateOnPlan?: pulumi.Input<boolean>;
    flowStageBindingId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `retry`
     *   - `restart`
     *   - `restart_with_context`
     *  Defaults to `retry`.
     */
    invalidResponseAction?: pulumi.Input<string>;
    order: pulumi.Input<number>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    /**
     * Evaluate policies when the Stage is present to the user. Defaults to `false`.
     */
    reEvaluatePolicies?: pulumi.Input<boolean>;
    stage: pulumi.Input<string>;
    target: pulumi.Input<string>;
}

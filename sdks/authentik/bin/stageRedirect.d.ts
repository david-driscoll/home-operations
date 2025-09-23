import * as pulumi from "@pulumi/pulumi";
export declare class StageRedirect extends pulumi.CustomResource {
    /**
     * Get an existing StageRedirect resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageRedirectState, opts?: pulumi.CustomResourceOptions): StageRedirect;
    /**
     * Returns true if the given object is an instance of StageRedirect.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageRedirect;
    /**
     * Defaults to `true`.
     */
    readonly keepContext: pulumi.Output<boolean | undefined>;
    /**
     * Allowed values:
     *   - `static`
     *   - `flow`
     *  Defaults to `flow`.
     */
    readonly mode: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageRedirectId: pulumi.Output<string>;
    readonly targetFlow: pulumi.Output<string | undefined>;
    readonly targetStatic: pulumi.Output<string | undefined>;
    /**
     * Create a StageRedirect resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageRedirectArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageRedirect resources.
 */
export interface StageRedirectState {
    /**
     * Defaults to `true`.
     */
    keepContext?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `static`
     *   - `flow`
     *  Defaults to `flow`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageRedirectId?: pulumi.Input<string>;
    targetFlow?: pulumi.Input<string>;
    targetStatic?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageRedirect resource.
 */
export interface StageRedirectArgs {
    /**
     * Defaults to `true`.
     */
    keepContext?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `static`
     *   - `flow`
     *  Defaults to `flow`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageRedirectId?: pulumi.Input<string>;
    targetFlow?: pulumi.Input<string>;
    targetStatic?: pulumi.Input<string>;
}

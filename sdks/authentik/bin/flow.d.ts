import * as pulumi from "@pulumi/pulumi";
export declare class Flow extends pulumi.CustomResource {
    /**
     * Get an existing Flow resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: FlowState, opts?: pulumi.CustomResourceOptions): Flow;
    /**
     * Returns true if the given object is an instance of Flow.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Flow;
    /**
     * Allowed values:
     *   - `none`
     *   - `require_authenticated`
     *   - `require_unauthenticated`
     *   - `require_superuser`
     *   - `require_redirect`
     *   - `require_outpost`
     *  Defaults to `none`.
     */
    readonly authentication: pulumi.Output<string | undefined>;
    /**
     * Optional URL to an image which will be used as the background during the flow.
     */
    readonly background: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly compatibilityMode: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `message_continue`.
     */
    readonly deniedAction: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `authentication`
     *   - `authorization`
     *   - `invalidation`
     *   - `enrollment`
     *   - `unenrollment`
     *   - `recovery`
     *   - `stage_configuration`
     */
    readonly designation: pulumi.Output<string>;
    readonly flowId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `stacked`
     *   - `content_left`
     *   - `content_right`
     *   - `sidebar_left`
     *   - `sidebar_right`
     *  Defaults to `stacked`.
     */
    readonly layout: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    readonly slug: pulumi.Output<string>;
    readonly title: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly uuid: pulumi.Output<string>;
    /**
     * Create a Flow resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: FlowArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Flow resources.
 */
export interface FlowState {
    /**
     * Allowed values:
     *   - `none`
     *   - `require_authenticated`
     *   - `require_unauthenticated`
     *   - `require_superuser`
     *   - `require_redirect`
     *   - `require_outpost`
     *  Defaults to `none`.
     */
    authentication?: pulumi.Input<string>;
    /**
     * Optional URL to an image which will be used as the background during the flow.
     */
    background?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    compatibilityMode?: pulumi.Input<boolean>;
    /**
     * Defaults to `message_continue`.
     */
    deniedAction?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `authentication`
     *   - `authorization`
     *   - `invalidation`
     *   - `enrollment`
     *   - `unenrollment`
     *   - `recovery`
     *   - `stage_configuration`
     */
    designation?: pulumi.Input<string>;
    flowId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `stacked`
     *   - `content_left`
     *   - `content_right`
     *   - `sidebar_left`
     *   - `sidebar_right`
     *  Defaults to `stacked`.
     */
    layout?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
    title?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Flow resource.
 */
export interface FlowArgs {
    /**
     * Allowed values:
     *   - `none`
     *   - `require_authenticated`
     *   - `require_unauthenticated`
     *   - `require_superuser`
     *   - `require_redirect`
     *   - `require_outpost`
     *  Defaults to `none`.
     */
    authentication?: pulumi.Input<string>;
    /**
     * Optional URL to an image which will be used as the background during the flow.
     */
    background?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    compatibilityMode?: pulumi.Input<boolean>;
    /**
     * Defaults to `message_continue`.
     */
    deniedAction?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `authentication`
     *   - `authorization`
     *   - `invalidation`
     *   - `enrollment`
     *   - `unenrollment`
     *   - `recovery`
     *   - `stage_configuration`
     */
    designation: pulumi.Input<string>;
    flowId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `stacked`
     *   - `content_left`
     *   - `content_right`
     *   - `sidebar_left`
     *   - `sidebar_right`
     *  Defaults to `stacked`.
     */
    layout?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    slug: pulumi.Input<string>;
    title: pulumi.Input<string>;
}

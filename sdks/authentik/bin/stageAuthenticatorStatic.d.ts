import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorStatic extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorStatic resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorStaticState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorStatic;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorStatic.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorStatic;
    readonly configureFlow: pulumi.Output<string | undefined>;
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageAuthenticatorStaticId: pulumi.Output<string>;
    /**
     * Defaults to `6`.
     */
    readonly tokenCount: pulumi.Output<number | undefined>;
    /**
     * Defaults to `12`.
     */
    readonly tokenLength: pulumi.Output<number | undefined>;
    /**
     * Create a StageAuthenticatorStatic resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageAuthenticatorStaticArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorStatic resources.
 */
export interface StageAuthenticatorStaticState {
    configureFlow?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorStaticId?: pulumi.Input<string>;
    /**
     * Defaults to `6`.
     */
    tokenCount?: pulumi.Input<number>;
    /**
     * Defaults to `12`.
     */
    tokenLength?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorStatic resource.
 */
export interface StageAuthenticatorStaticArgs {
    configureFlow?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorStaticId?: pulumi.Input<string>;
    /**
     * Defaults to `6`.
     */
    tokenCount?: pulumi.Input<number>;
    /**
     * Defaults to `12`.
     */
    tokenLength?: pulumi.Input<number>;
}

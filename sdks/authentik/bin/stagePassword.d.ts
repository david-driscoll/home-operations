import * as pulumi from "@pulumi/pulumi";
export declare class StagePassword extends pulumi.CustomResource {
    /**
     * Get an existing StagePassword resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StagePasswordState, opts?: pulumi.CustomResourceOptions): StagePassword;
    /**
     * Returns true if the given object is an instance of StagePassword.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StagePassword;
    /**
     * Defaults to `false`.
     */
    readonly allowShowPassword: pulumi.Output<boolean | undefined>;
    readonly backends: pulumi.Output<string[]>;
    readonly configureFlow: pulumi.Output<string | undefined>;
    /**
     * Defaults to `5`.
     */
    readonly failedAttemptsBeforeCancel: pulumi.Output<number | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stagePasswordId: pulumi.Output<string>;
    /**
     * Create a StagePassword resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StagePasswordArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StagePassword resources.
 */
export interface StagePasswordState {
    /**
     * Defaults to `false`.
     */
    allowShowPassword?: pulumi.Input<boolean>;
    backends?: pulumi.Input<pulumi.Input<string>[]>;
    configureFlow?: pulumi.Input<string>;
    /**
     * Defaults to `5`.
     */
    failedAttemptsBeforeCancel?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    stagePasswordId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StagePassword resource.
 */
export interface StagePasswordArgs {
    /**
     * Defaults to `false`.
     */
    allowShowPassword?: pulumi.Input<boolean>;
    backends: pulumi.Input<pulumi.Input<string>[]>;
    configureFlow?: pulumi.Input<string>;
    /**
     * Defaults to `5`.
     */
    failedAttemptsBeforeCancel?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    stagePasswordId?: pulumi.Input<string>;
}

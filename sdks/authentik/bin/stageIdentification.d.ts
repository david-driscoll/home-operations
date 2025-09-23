import * as pulumi from "@pulumi/pulumi";
export declare class StageIdentification extends pulumi.CustomResource {
    /**
     * Get an existing StageIdentification resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageIdentificationState, opts?: pulumi.CustomResourceOptions): StageIdentification;
    /**
     * Returns true if the given object is an instance of StageIdentification.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageIdentification;
    readonly captchaStage: pulumi.Output<string | undefined>;
    readonly caseInsensitiveMatching: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly enableRememberMe: pulumi.Output<boolean | undefined>;
    readonly enrollmentFlow: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly passwordStage: pulumi.Output<string | undefined>;
    readonly passwordlessFlow: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly pretendUserExists: pulumi.Output<boolean | undefined>;
    readonly recoveryFlow: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly showMatchedUser: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly showSourceLabels: pulumi.Output<boolean | undefined>;
    readonly sources: pulumi.Output<string[] | undefined>;
    readonly stageIdentificationId: pulumi.Output<string>;
    readonly userFields: pulumi.Output<string[] | undefined>;
    /**
     * Create a StageIdentification resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageIdentificationArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageIdentification resources.
 */
export interface StageIdentificationState {
    captchaStage?: pulumi.Input<string>;
    caseInsensitiveMatching?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    enableRememberMe?: pulumi.Input<boolean>;
    enrollmentFlow?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    passwordStage?: pulumi.Input<string>;
    passwordlessFlow?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    pretendUserExists?: pulumi.Input<boolean>;
    recoveryFlow?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    showMatchedUser?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    showSourceLabels?: pulumi.Input<boolean>;
    sources?: pulumi.Input<pulumi.Input<string>[]>;
    stageIdentificationId?: pulumi.Input<string>;
    userFields?: pulumi.Input<pulumi.Input<string>[]>;
}
/**
 * The set of arguments for constructing a StageIdentification resource.
 */
export interface StageIdentificationArgs {
    captchaStage?: pulumi.Input<string>;
    caseInsensitiveMatching?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    enableRememberMe?: pulumi.Input<boolean>;
    enrollmentFlow?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    passwordStage?: pulumi.Input<string>;
    passwordlessFlow?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    pretendUserExists?: pulumi.Input<boolean>;
    recoveryFlow?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    showMatchedUser?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    showSourceLabels?: pulumi.Input<boolean>;
    sources?: pulumi.Input<pulumi.Input<string>[]>;
    stageIdentificationId?: pulumi.Input<string>;
    userFields?: pulumi.Input<pulumi.Input<string>[]>;
}

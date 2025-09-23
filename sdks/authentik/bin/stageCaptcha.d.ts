import * as pulumi from "@pulumi/pulumi";
export declare class StageCaptcha extends pulumi.CustomResource {
    /**
     * Get an existing StageCaptcha resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageCaptchaState, opts?: pulumi.CustomResourceOptions): StageCaptcha;
    /**
     * Returns true if the given object is an instance of StageCaptcha.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageCaptcha;
    /**
     * Defaults to `https://www.recaptcha.net/recaptcha/api/siteverify`.
     */
    readonly apiUrl: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly errorOnInvalidScore: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly interactive: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `https://www.recaptcha.net/recaptcha/api.js`.
     */
    readonly jsUrl: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly privateKey: pulumi.Output<string>;
    readonly publicKey: pulumi.Output<string>;
    /**
     * Defaults to `0.5`.
     */
    readonly scoreMaxThreshold: pulumi.Output<number | undefined>;
    /**
     * Defaults to `1`.
     */
    readonly scoreMinThreshold: pulumi.Output<number | undefined>;
    readonly stageCaptchaId: pulumi.Output<string>;
    /**
     * Create a StageCaptcha resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StageCaptchaArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageCaptcha resources.
 */
export interface StageCaptchaState {
    /**
     * Defaults to `https://www.recaptcha.net/recaptcha/api/siteverify`.
     */
    apiUrl?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    errorOnInvalidScore?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    interactive?: pulumi.Input<boolean>;
    /**
     * Defaults to `https://www.recaptcha.net/recaptcha/api.js`.
     */
    jsUrl?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    privateKey?: pulumi.Input<string>;
    publicKey?: pulumi.Input<string>;
    /**
     * Defaults to `0.5`.
     */
    scoreMaxThreshold?: pulumi.Input<number>;
    /**
     * Defaults to `1`.
     */
    scoreMinThreshold?: pulumi.Input<number>;
    stageCaptchaId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageCaptcha resource.
 */
export interface StageCaptchaArgs {
    /**
     * Defaults to `https://www.recaptcha.net/recaptcha/api/siteverify`.
     */
    apiUrl?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    errorOnInvalidScore?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    interactive?: pulumi.Input<boolean>;
    /**
     * Defaults to `https://www.recaptcha.net/recaptcha/api.js`.
     */
    jsUrl?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    privateKey: pulumi.Input<string>;
    publicKey: pulumi.Input<string>;
    /**
     * Defaults to `0.5`.
     */
    scoreMaxThreshold?: pulumi.Input<number>;
    /**
     * Defaults to `1`.
     */
    scoreMinThreshold?: pulumi.Input<number>;
    stageCaptchaId?: pulumi.Input<string>;
}

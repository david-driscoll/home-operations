import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorValidate extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorValidate resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorValidateState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorValidate;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorValidate.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorValidate;
    readonly configurationStages: pulumi.Output<string[] | undefined>;
    readonly deviceClasses: pulumi.Output<string[] | undefined>;
    /**
     * Defaults to `1`.
     */
    readonly emailOtpThrottlingFactor: pulumi.Output<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    readonly lastAuthThreshold: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `skip`
     *   - `deny`
     *   - `configure`
     */
    readonly notConfiguredAction: pulumi.Output<string>;
    /**
     * Defaults to `1`.
     */
    readonly smsOtpThrottlingFactor: pulumi.Output<number | undefined>;
    readonly stageAuthenticatorValidateId: pulumi.Output<string>;
    /**
     * Defaults to `1`.
     */
    readonly staticOtpThrottlingFactor: pulumi.Output<number | undefined>;
    /**
     * Defaults to `1`.
     */
    readonly totpOtpThrottlingFactor: pulumi.Output<number | undefined>;
    readonly webauthnAllowedDeviceTypes: pulumi.Output<string[] | undefined>;
    readonly webauthnHints: pulumi.Output<string[] | undefined>;
    /**
     * Allowed values:
     *   - `required`
     *   - `preferred`
     *   - `discouraged`
     *      Defaults to `preferred`.
     */
    readonly webauthnUserVerification: pulumi.Output<string | undefined>;
    /**
     * Create a StageAuthenticatorValidate resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StageAuthenticatorValidateArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorValidate resources.
 */
export interface StageAuthenticatorValidateState {
    configurationStages?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    deviceClasses?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Defaults to `1`.
     */
    emailOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    lastAuthThreshold?: pulumi.Input<string | undefined>;
    name?: pulumi.Input<string | undefined>;
    /**
     * Allowed values:
     *   - `skip`
     *   - `deny`
     *   - `configure`
     */
    notConfiguredAction?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `1`.
     */
    smsOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    stageAuthenticatorValidateId?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `1`.
     */
    staticOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    /**
     * Defaults to `1`.
     */
    totpOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    webauthnAllowedDeviceTypes?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    webauthnHints?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Allowed values:
     *   - `required`
     *   - `preferred`
     *   - `discouraged`
     *      Defaults to `preferred`.
     */
    webauthnUserVerification?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorValidate resource.
 */
export interface StageAuthenticatorValidateArgs {
    configurationStages?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    deviceClasses?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Defaults to `1`.
     */
    emailOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    lastAuthThreshold?: pulumi.Input<string | undefined>;
    name?: pulumi.Input<string | undefined>;
    /**
     * Allowed values:
     *   - `skip`
     *   - `deny`
     *   - `configure`
     */
    notConfiguredAction: pulumi.Input<string>;
    /**
     * Defaults to `1`.
     */
    smsOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    stageAuthenticatorValidateId?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `1`.
     */
    staticOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    /**
     * Defaults to `1`.
     */
    totpOtpThrottlingFactor?: pulumi.Input<number | undefined>;
    webauthnAllowedDeviceTypes?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    webauthnHints?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Allowed values:
     *   - `required`
     *   - `preferred`
     *   - `discouraged`
     *      Defaults to `preferred`.
     */
    webauthnUserVerification?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=stageAuthenticatorValidate.d.ts.map
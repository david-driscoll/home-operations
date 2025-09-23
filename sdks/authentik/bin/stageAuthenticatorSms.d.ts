import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorSms extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorSms resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorSmsState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorSms;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorSms.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorSms;
    readonly accountSid: pulumi.Output<string>;
    readonly auth: pulumi.Output<string>;
    readonly authPassword: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `basic`
     *   - `bearer`
     *  Defaults to `basic`.
     */
    readonly authType: pulumi.Output<string | undefined>;
    readonly configureFlow: pulumi.Output<string | undefined>;
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly fromNumber: pulumi.Output<string>;
    readonly mapping: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `twilio`
     *   - `generic`
     *  Defaults to `twilio`.
     */
    readonly smsProvider: pulumi.Output<string | undefined>;
    readonly stageAuthenticatorSmsId: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly verifyOnly: pulumi.Output<boolean | undefined>;
    /**
     * Create a StageAuthenticatorSms resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StageAuthenticatorSmsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorSms resources.
 */
export interface StageAuthenticatorSmsState {
    accountSid?: pulumi.Input<string>;
    auth?: pulumi.Input<string>;
    authPassword?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `basic`
     *   - `bearer`
     *  Defaults to `basic`.
     */
    authType?: pulumi.Input<string>;
    configureFlow?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    fromNumber?: pulumi.Input<string>;
    mapping?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `twilio`
     *   - `generic`
     *  Defaults to `twilio`.
     */
    smsProvider?: pulumi.Input<string>;
    stageAuthenticatorSmsId?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    verifyOnly?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorSms resource.
 */
export interface StageAuthenticatorSmsArgs {
    accountSid: pulumi.Input<string>;
    auth: pulumi.Input<string>;
    authPassword?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `basic`
     *   - `bearer`
     *  Defaults to `basic`.
     */
    authType?: pulumi.Input<string>;
    configureFlow?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    fromNumber: pulumi.Input<string>;
    mapping?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `twilio`
     *   - `generic`
     *  Defaults to `twilio`.
     */
    smsProvider?: pulumi.Input<string>;
    stageAuthenticatorSmsId?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    verifyOnly?: pulumi.Input<boolean>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorWebauthn extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorWebauthn resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorWebauthnState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorWebauthn;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorWebauthn.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorWebauthn;
    /**
     * Allowed values:
     *   - `platform`
     *   - `cross-platform`
     */
    readonly authenticatorAttachment: pulumi.Output<string | undefined>;
    readonly configureFlow: pulumi.Output<string | undefined>;
    readonly deviceTypeRestrictions: pulumi.Output<string[] | undefined>;
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly maxAttempts: pulumi.Output<number | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `discouraged`
     *   - `preferred`
     *   - `required`
     *  Defaults to `preferred`.
     */
    readonly residentKeyRequirement: pulumi.Output<string | undefined>;
    readonly stageAuthenticatorWebauthnId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `required`
     *   - `preferred`
     *   - `discouraged`
     *  Defaults to `preferred`.
     */
    readonly userVerification: pulumi.Output<string | undefined>;
    /**
     * Create a StageAuthenticatorWebauthn resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageAuthenticatorWebauthnArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorWebauthn resources.
 */
export interface StageAuthenticatorWebauthnState {
    /**
     * Allowed values:
     *   - `platform`
     *   - `cross-platform`
     */
    authenticatorAttachment?: pulumi.Input<string>;
    configureFlow?: pulumi.Input<string>;
    deviceTypeRestrictions?: pulumi.Input<pulumi.Input<string>[]>;
    friendlyName?: pulumi.Input<string>;
    maxAttempts?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `discouraged`
     *   - `preferred`
     *   - `required`
     *  Defaults to `preferred`.
     */
    residentKeyRequirement?: pulumi.Input<string>;
    stageAuthenticatorWebauthnId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `required`
     *   - `preferred`
     *   - `discouraged`
     *  Defaults to `preferred`.
     */
    userVerification?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorWebauthn resource.
 */
export interface StageAuthenticatorWebauthnArgs {
    /**
     * Allowed values:
     *   - `platform`
     *   - `cross-platform`
     */
    authenticatorAttachment?: pulumi.Input<string>;
    configureFlow?: pulumi.Input<string>;
    deviceTypeRestrictions?: pulumi.Input<pulumi.Input<string>[]>;
    friendlyName?: pulumi.Input<string>;
    maxAttempts?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `discouraged`
     *   - `preferred`
     *   - `required`
     *  Defaults to `preferred`.
     */
    residentKeyRequirement?: pulumi.Input<string>;
    stageAuthenticatorWebauthnId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `required`
     *   - `preferred`
     *   - `discouraged`
     *  Defaults to `preferred`.
     */
    userVerification?: pulumi.Input<string>;
}

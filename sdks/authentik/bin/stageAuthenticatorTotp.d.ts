import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorTotp extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorTotp resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorTotpState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorTotp;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorTotp.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorTotp;
    readonly configureFlow: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `6`
     *   - `8`
     *  Defaults to `6`.
     */
    readonly digits: pulumi.Output<string | undefined>;
    /**
     * Defaults to ``.
     */
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageAuthenticatorTotpId: pulumi.Output<string>;
    /**
     * Create a StageAuthenticatorTotp resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageAuthenticatorTotpArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorTotp resources.
 */
export interface StageAuthenticatorTotpState {
    configureFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `6`
     *   - `8`
     *  Defaults to `6`.
     */
    digits?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorTotpId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorTotp resource.
 */
export interface StageAuthenticatorTotpArgs {
    configureFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `6`
     *   - `8`
     *  Defaults to `6`.
     */
    digits?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorTotpId?: pulumi.Input<string>;
}

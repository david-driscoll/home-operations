import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorDuo extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorDuo resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorDuoState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorDuo;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorDuo.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorDuo;
    readonly adminIntegrationKey: pulumi.Output<string | undefined>;
    readonly adminSecretKey: pulumi.Output<string | undefined>;
    readonly apiHostname: pulumi.Output<string>;
    readonly clientId: pulumi.Output<string>;
    readonly clientSecret: pulumi.Output<string>;
    readonly configureFlow: pulumi.Output<string | undefined>;
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageAuthenticatorDuoId: pulumi.Output<string>;
    /**
     * Create a StageAuthenticatorDuo resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StageAuthenticatorDuoArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorDuo resources.
 */
export interface StageAuthenticatorDuoState {
    adminIntegrationKey?: pulumi.Input<string>;
    adminSecretKey?: pulumi.Input<string>;
    apiHostname?: pulumi.Input<string>;
    clientId?: pulumi.Input<string>;
    clientSecret?: pulumi.Input<string>;
    configureFlow?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorDuoId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorDuo resource.
 */
export interface StageAuthenticatorDuoArgs {
    adminIntegrationKey?: pulumi.Input<string>;
    adminSecretKey?: pulumi.Input<string>;
    apiHostname: pulumi.Input<string>;
    clientId: pulumi.Input<string>;
    clientSecret: pulumi.Input<string>;
    configureFlow?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorDuoId?: pulumi.Input<string>;
}

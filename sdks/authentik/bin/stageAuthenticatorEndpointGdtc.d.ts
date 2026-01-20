import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorEndpointGdtc extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorEndpointGdtc resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorEndpointGdtcState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorEndpointGdtc;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorEndpointGdtc.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorEndpointGdtc;
    readonly configureFlow: pulumi.Output<string | undefined>;
    readonly credentials: pulumi.Output<string>;
    /**
     * Defaults to ``.
     */
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageAuthenticatorEndpointGdtcId: pulumi.Output<string>;
    /**
     * Create a StageAuthenticatorEndpointGdtc resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StageAuthenticatorEndpointGdtcArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorEndpointGdtc resources.
 */
export interface StageAuthenticatorEndpointGdtcState {
    configureFlow?: pulumi.Input<string>;
    credentials?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorEndpointGdtcId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorEndpointGdtc resource.
 */
export interface StageAuthenticatorEndpointGdtcArgs {
    configureFlow?: pulumi.Input<string>;
    credentials: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageAuthenticatorEndpointGdtcId?: pulumi.Input<string>;
}

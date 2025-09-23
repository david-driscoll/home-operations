import * as pulumi from "@pulumi/pulumi";
export declare class ProviderRadius extends pulumi.CustomResource {
    /**
     * Get an existing ProviderRadius resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderRadiusState, opts?: pulumi.CustomResourceOptions): ProviderRadius;
    /**
     * Returns true if the given object is an instance of ProviderRadius.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderRadius;
    readonly authorizationFlow: pulumi.Output<string>;
    /**
     * Defaults to `0.0.0.0/0, ::/0`.
     */
    readonly clientNetworks: pulumi.Output<string | undefined>;
    readonly invalidationFlow: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly mfaSupport: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly providerRadiusId: pulumi.Output<string>;
    readonly sharedSecret: pulumi.Output<string>;
    /**
     * Create a ProviderRadius resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderRadiusArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderRadius resources.
 */
export interface ProviderRadiusState {
    authorizationFlow?: pulumi.Input<string>;
    /**
     * Defaults to `0.0.0.0/0, ::/0`.
     */
    clientNetworks?: pulumi.Input<string>;
    invalidationFlow?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    mfaSupport?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerRadiusId?: pulumi.Input<string>;
    sharedSecret?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderRadius resource.
 */
export interface ProviderRadiusArgs {
    authorizationFlow: pulumi.Input<string>;
    /**
     * Defaults to `0.0.0.0/0, ::/0`.
     */
    clientNetworks?: pulumi.Input<string>;
    invalidationFlow: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    mfaSupport?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerRadiusId?: pulumi.Input<string>;
    sharedSecret: pulumi.Input<string>;
}

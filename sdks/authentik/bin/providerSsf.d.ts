import * as pulumi from "@pulumi/pulumi";
export declare class ProviderSsf extends pulumi.CustomResource {
    /**
     * Get an existing ProviderSsf resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderSsfState, opts?: pulumi.CustomResourceOptions): ProviderSsf;
    /**
     * Returns true if the given object is an instance of ProviderSsf.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderSsf;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    readonly eventRetention: pulumi.Output<string | undefined>;
    /**
     * JWTs issued by any of the configured providers can be used to authenticate on behalf of this provider.
     */
    readonly jwtFederationProviders: pulumi.Output<number[] | undefined>;
    readonly name: pulumi.Output<string>;
    readonly providerSsfId: pulumi.Output<string>;
    readonly signingKey: pulumi.Output<string | undefined>;
    /**
     * Create a ProviderSsf resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: ProviderSsfArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderSsf resources.
 */
export interface ProviderSsfState {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    eventRetention?: pulumi.Input<string>;
    /**
     * JWTs issued by any of the configured providers can be used to authenticate on behalf of this provider.
     */
    jwtFederationProviders?: pulumi.Input<pulumi.Input<number>[]>;
    name?: pulumi.Input<string>;
    providerSsfId?: pulumi.Input<string>;
    signingKey?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderSsf resource.
 */
export interface ProviderSsfArgs {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    eventRetention?: pulumi.Input<string>;
    /**
     * JWTs issued by any of the configured providers can be used to authenticate on behalf of this provider.
     */
    jwtFederationProviders?: pulumi.Input<pulumi.Input<number>[]>;
    name?: pulumi.Input<string>;
    providerSsfId?: pulumi.Input<string>;
    signingKey?: pulumi.Input<string>;
}

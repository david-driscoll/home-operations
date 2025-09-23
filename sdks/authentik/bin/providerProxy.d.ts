import * as pulumi from "@pulumi/pulumi";
export declare class ProviderProxy extends pulumi.CustomResource {
    /**
     * Get an existing ProviderProxy resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderProxyState, opts?: pulumi.CustomResourceOptions): ProviderProxy;
    /**
     * Returns true if the given object is an instance of ProviderProxy.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderProxy;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=10`.
     */
    readonly accessTokenValidity: pulumi.Output<string | undefined>;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
    readonly authorizationFlow: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly basicAuthEnabled: pulumi.Output<boolean | undefined>;
    readonly basicAuthPasswordAttribute: pulumi.Output<string | undefined>;
    readonly basicAuthUsernameAttribute: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly clientId: pulumi.Output<string>;
    readonly cookieDomain: pulumi.Output<string | undefined>;
    readonly externalHost: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly interceptHeaderAuth: pulumi.Output<boolean | undefined>;
    readonly internalHost: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly internalHostSslValidation: pulumi.Output<boolean | undefined>;
    readonly invalidationFlow: pulumi.Output<string>;
    /**
     * Deprecated. Use `jwt_federation_sources` instead.
     */
    readonly jwksSources: pulumi.Output<string[] | undefined>;
    /**
     * JWTs issued by any of the configured providers can be used to authenticate on behalf of this provider.
     */
    readonly jwtFederationProviders: pulumi.Output<number[] | undefined>;
    /**
     * JWTs issued by keys configured in any of the selected sources can be used to authenticate on behalf of this provider.
     */
    readonly jwtFederationSources: pulumi.Output<string[] | undefined>;
    /**
     * Allowed values:
     *   - `proxy`
     *   - `forward_single`
     *   - `forward_domain`
     *  Defaults to `proxy`.
     */
    readonly mode: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly providerProxyId: pulumi.Output<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    readonly refreshTokenValidity: pulumi.Output<string | undefined>;
    readonly skipPathRegex: pulumi.Output<string | undefined>;
    /**
     * Create a ProviderProxy resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderProxyArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderProxy resources.
 */
export interface ProviderProxyState {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=10`.
     */
    accessTokenValidity?: pulumi.Input<string>;
    authenticationFlow?: pulumi.Input<string>;
    authorizationFlow?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    basicAuthEnabled?: pulumi.Input<boolean>;
    basicAuthPasswordAttribute?: pulumi.Input<string>;
    basicAuthUsernameAttribute?: pulumi.Input<string>;
    /**
     * Generated.
     */
    clientId?: pulumi.Input<string>;
    cookieDomain?: pulumi.Input<string>;
    externalHost?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    interceptHeaderAuth?: pulumi.Input<boolean>;
    internalHost?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    internalHostSslValidation?: pulumi.Input<boolean>;
    invalidationFlow?: pulumi.Input<string>;
    /**
     * Deprecated. Use `jwt_federation_sources` instead.
     */
    jwksSources?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * JWTs issued by any of the configured providers can be used to authenticate on behalf of this provider.
     */
    jwtFederationProviders?: pulumi.Input<pulumi.Input<number>[]>;
    /**
     * JWTs issued by keys configured in any of the selected sources can be used to authenticate on behalf of this provider.
     */
    jwtFederationSources?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `proxy`
     *   - `forward_single`
     *   - `forward_domain`
     *  Defaults to `proxy`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerProxyId?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    refreshTokenValidity?: pulumi.Input<string>;
    skipPathRegex?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderProxy resource.
 */
export interface ProviderProxyArgs {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=10`.
     */
    accessTokenValidity?: pulumi.Input<string>;
    authenticationFlow?: pulumi.Input<string>;
    authorizationFlow: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    basicAuthEnabled?: pulumi.Input<boolean>;
    basicAuthPasswordAttribute?: pulumi.Input<string>;
    basicAuthUsernameAttribute?: pulumi.Input<string>;
    cookieDomain?: pulumi.Input<string>;
    externalHost: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    interceptHeaderAuth?: pulumi.Input<boolean>;
    internalHost?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    internalHostSslValidation?: pulumi.Input<boolean>;
    invalidationFlow: pulumi.Input<string>;
    /**
     * Deprecated. Use `jwt_federation_sources` instead.
     */
    jwksSources?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * JWTs issued by any of the configured providers can be used to authenticate on behalf of this provider.
     */
    jwtFederationProviders?: pulumi.Input<pulumi.Input<number>[]>;
    /**
     * JWTs issued by keys configured in any of the selected sources can be used to authenticate on behalf of this provider.
     */
    jwtFederationSources?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `proxy`
     *   - `forward_single`
     *   - `forward_domain`
     *  Defaults to `proxy`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerProxyId?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    refreshTokenValidity?: pulumi.Input<string>;
    skipPathRegex?: pulumi.Input<string>;
}

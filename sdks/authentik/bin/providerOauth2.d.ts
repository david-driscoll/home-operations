import * as pulumi from "@pulumi/pulumi";
export declare class ProviderOauth2 extends pulumi.CustomResource {
    /**
     * Get an existing ProviderOauth2 resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderOauth2State, opts?: pulumi.CustomResourceOptions): ProviderOauth2;
    /**
     * Returns true if the given object is an instance of ProviderOauth2.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderOauth2;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=1`.
     */
    readonly accessCodeValidity: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=10`.
     */
    readonly accessTokenValidity: pulumi.Output<string | undefined>;
    readonly allowedRedirectUris: pulumi.Output<{
        [key: string]: string;
    }[] | undefined>;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
    readonly authorizationFlow: pulumi.Output<string>;
    readonly clientId: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly clientSecret: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `confidential`
     *   - `public`
     *  Defaults to `confidential`.
     */
    readonly clientType: pulumi.Output<string | undefined>;
    readonly encryptionKey: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly includeClaimsInIdToken: pulumi.Output<boolean | undefined>;
    readonly invalidationFlow: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `global`
     *   - `per_provider`
     *  Defaults to `per_provider`.
     */
    readonly issuerMode: pulumi.Output<string | undefined>;
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
     *   - `backchannel`
     *   - `frontchannel`
     *  Defaults to `backchannel`.
     */
    readonly logoutMethod: pulumi.Output<string | undefined>;
    readonly logoutUri: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly providerOauth2Id: pulumi.Output<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    readonly refreshTokenThreshold: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    readonly refreshTokenValidity: pulumi.Output<string | undefined>;
    readonly signingKey: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `hashed_user_id`
     *   - `user_id`
     *   - `user_uuid`
     *   - `user_username`
     *   - `user_email`
     *   - `user_upn`
     *  Defaults to `hashed_user_id`.
     */
    readonly subMode: pulumi.Output<string | undefined>;
    /**
     * Create a ProviderOauth2 resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderOauth2Args, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderOauth2 resources.
 */
export interface ProviderOauth2State {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=1`.
     */
    accessCodeValidity?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=10`.
     */
    accessTokenValidity?: pulumi.Input<string>;
    allowedRedirectUris?: pulumi.Input<pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>[]>;
    authenticationFlow?: pulumi.Input<string>;
    authorizationFlow?: pulumi.Input<string>;
    clientId?: pulumi.Input<string>;
    /**
     * Generated.
     */
    clientSecret?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `confidential`
     *   - `public`
     *  Defaults to `confidential`.
     */
    clientType?: pulumi.Input<string>;
    encryptionKey?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    includeClaimsInIdToken?: pulumi.Input<boolean>;
    invalidationFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `global`
     *   - `per_provider`
     *  Defaults to `per_provider`.
     */
    issuerMode?: pulumi.Input<string>;
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
     *   - `backchannel`
     *   - `frontchannel`
     *  Defaults to `backchannel`.
     */
    logoutMethod?: pulumi.Input<string>;
    logoutUri?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerOauth2Id?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    refreshTokenThreshold?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    refreshTokenValidity?: pulumi.Input<string>;
    signingKey?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `hashed_user_id`
     *   - `user_id`
     *   - `user_uuid`
     *   - `user_username`
     *   - `user_email`
     *   - `user_upn`
     *  Defaults to `hashed_user_id`.
     */
    subMode?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderOauth2 resource.
 */
export interface ProviderOauth2Args {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=1`.
     */
    accessCodeValidity?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=10`.
     */
    accessTokenValidity?: pulumi.Input<string>;
    allowedRedirectUris?: pulumi.Input<pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>[]>;
    authenticationFlow?: pulumi.Input<string>;
    authorizationFlow: pulumi.Input<string>;
    clientId: pulumi.Input<string>;
    /**
     * Generated.
     */
    clientSecret?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `confidential`
     *   - `public`
     *  Defaults to `confidential`.
     */
    clientType?: pulumi.Input<string>;
    encryptionKey?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    includeClaimsInIdToken?: pulumi.Input<boolean>;
    invalidationFlow: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `global`
     *   - `per_provider`
     *  Defaults to `per_provider`.
     */
    issuerMode?: pulumi.Input<string>;
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
     *   - `backchannel`
     *   - `frontchannel`
     *  Defaults to `backchannel`.
     */
    logoutMethod?: pulumi.Input<string>;
    logoutUri?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerOauth2Id?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    refreshTokenThreshold?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    refreshTokenValidity?: pulumi.Input<string>;
    signingKey?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `hashed_user_id`
     *   - `user_id`
     *   - `user_uuid`
     *   - `user_username`
     *   - `user_email`
     *   - `user_upn`
     *  Defaults to `hashed_user_id`.
     */
    subMode?: pulumi.Input<string>;
}

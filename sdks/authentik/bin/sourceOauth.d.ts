import * as pulumi from "@pulumi/pulumi";
export declare class SourceOauth extends pulumi.CustomResource {
    /**
     * Get an existing SourceOauth resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SourceOauthState, opts?: pulumi.CustomResourceOptions): SourceOauth;
    /**
     * Returns true if the given object is an instance of SourceOauth.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SourceOauth;
    /**
     * Only required for OAuth1.
     */
    readonly accessTokenUrl: pulumi.Output<string | undefined>;
    readonly additionalScopes: pulumi.Output<string | undefined>;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `basic_auth`
     *   - `post_body`
     *  Defaults to `basic_auth`.
     */
    readonly authorizationCodeAuthMethod: pulumi.Output<string | undefined>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    readonly authorizationUrl: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly callbackUri: pulumi.Output<string>;
    readonly consumerKey: pulumi.Output<string>;
    readonly consumerSecret: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    readonly enrollmentFlow: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    readonly groupMatchingMode: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Manually configure JWKS keys for use with machine-to-machine authentication. JSON format expected. Use `jsonencode()` to pass objects. Generated.
     */
    readonly oidcJwks: pulumi.Output<string>;
    /**
     * Automatically configure JWKS if not specified by `oidc_well_known_url`.
     */
    readonly oidcJwksUrl: pulumi.Output<string | undefined>;
    /**
     * Automatically configure source from OIDC well-known endpoint. URL is taken as is, and should end with `.well-known/openid-configuration`.
     */
    readonly oidcWellKnownUrl: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `none`
     *   - `plain`
     *   - `S256`
     *  Defaults to `none`.
     */
    readonly pkce: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    readonly profileUrl: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly promoted: pulumi.Output<boolean | undefined>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly propertyMappingsGroups: pulumi.Output<string[] | undefined>;
    /**
     * Allowed values:
     *   - `apple`
     *   - `openidconnect`
     *   - `entraid`
     *   - `azuread`
     *   - `discord`
     *   - `facebook`
     *   - `github`
     *   - `gitlab`
     *   - `google`
     *   - `mailcow`
     *   - `okta`
     *   - `patreon`
     *   - `reddit`
     *   - `slack`
     *   - `twitch`
     *   - `twitter`
     *   - `wechat`
     */
    readonly providerType: pulumi.Output<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    readonly requestTokenUrl: pulumi.Output<string | undefined>;
    readonly slug: pulumi.Output<string>;
    readonly sourceOauthId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `email_link`
     *   - `email_deny`
     *   - `username_link`
     *   - `username_deny`
     *  Defaults to `identifier`.
     */
    readonly userMatchingMode: pulumi.Output<string | undefined>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    readonly userPathTemplate: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly uuid: pulumi.Output<string>;
    /**
     * Create a SourceOauth resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SourceOauthArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SourceOauth resources.
 */
export interface SourceOauthState {
    /**
     * Only required for OAuth1.
     */
    accessTokenUrl?: pulumi.Input<string>;
    additionalScopes?: pulumi.Input<string>;
    authenticationFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `basic_auth`
     *   - `post_body`
     *  Defaults to `basic_auth`.
     */
    authorizationCodeAuthMethod?: pulumi.Input<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    authorizationUrl?: pulumi.Input<string>;
    /**
     * Generated.
     */
    callbackUri?: pulumi.Input<string>;
    consumerKey?: pulumi.Input<string>;
    consumerSecret?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    enrollmentFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    groupMatchingMode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Manually configure JWKS keys for use with machine-to-machine authentication. JSON format expected. Use `jsonencode()` to pass objects. Generated.
     */
    oidcJwks?: pulumi.Input<string>;
    /**
     * Automatically configure JWKS if not specified by `oidc_well_known_url`.
     */
    oidcJwksUrl?: pulumi.Input<string>;
    /**
     * Automatically configure source from OIDC well-known endpoint. URL is taken as is, and should end with `.well-known/openid-configuration`.
     */
    oidcWellKnownUrl?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `none`
     *   - `plain`
     *   - `S256`
     *  Defaults to `none`.
     */
    pkce?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    profileUrl?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    promoted?: pulumi.Input<boolean>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `apple`
     *   - `openidconnect`
     *   - `entraid`
     *   - `azuread`
     *   - `discord`
     *   - `facebook`
     *   - `github`
     *   - `gitlab`
     *   - `google`
     *   - `mailcow`
     *   - `okta`
     *   - `patreon`
     *   - `reddit`
     *   - `slack`
     *   - `twitch`
     *   - `twitter`
     *   - `wechat`
     */
    providerType?: pulumi.Input<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    requestTokenUrl?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
    sourceOauthId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `email_link`
     *   - `email_deny`
     *   - `username_link`
     *   - `username_deny`
     *  Defaults to `identifier`.
     */
    userMatchingMode?: pulumi.Input<string>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SourceOauth resource.
 */
export interface SourceOauthArgs {
    /**
     * Only required for OAuth1.
     */
    accessTokenUrl?: pulumi.Input<string>;
    additionalScopes?: pulumi.Input<string>;
    authenticationFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `basic_auth`
     *   - `post_body`
     *  Defaults to `basic_auth`.
     */
    authorizationCodeAuthMethod?: pulumi.Input<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    authorizationUrl?: pulumi.Input<string>;
    consumerKey: pulumi.Input<string>;
    consumerSecret: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    enrollmentFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    groupMatchingMode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Manually configure JWKS keys for use with machine-to-machine authentication. JSON format expected. Use `jsonencode()` to pass objects. Generated.
     */
    oidcJwks?: pulumi.Input<string>;
    /**
     * Automatically configure JWKS if not specified by `oidc_well_known_url`.
     */
    oidcJwksUrl?: pulumi.Input<string>;
    /**
     * Automatically configure source from OIDC well-known endpoint. URL is taken as is, and should end with `.well-known/openid-configuration`.
     */
    oidcWellKnownUrl?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `none`
     *   - `plain`
     *   - `S256`
     *  Defaults to `none`.
     */
    pkce?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    profileUrl?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    promoted?: pulumi.Input<boolean>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `apple`
     *   - `openidconnect`
     *   - `entraid`
     *   - `azuread`
     *   - `discord`
     *   - `facebook`
     *   - `github`
     *   - `gitlab`
     *   - `google`
     *   - `mailcow`
     *   - `okta`
     *   - `patreon`
     *   - `reddit`
     *   - `slack`
     *   - `twitch`
     *   - `twitter`
     *   - `wechat`
     */
    providerType: pulumi.Input<string>;
    /**
     * Manually configure OAuth2 URLs when `oidc_well_known_url` is not set.
     */
    requestTokenUrl?: pulumi.Input<string>;
    slug: pulumi.Input<string>;
    sourceOauthId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `email_link`
     *   - `email_deny`
     *   - `username_link`
     *   - `username_deny`
     *  Defaults to `identifier`.
     */
    userMatchingMode?: pulumi.Input<string>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}

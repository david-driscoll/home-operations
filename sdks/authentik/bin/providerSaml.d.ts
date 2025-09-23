import * as pulumi from "@pulumi/pulumi";
export declare class ProviderSaml extends pulumi.CustomResource {
    /**
     * Get an existing ProviderSaml resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderSamlState, opts?: pulumi.CustomResourceOptions): ProviderSaml;
    /**
     * Returns true if the given object is an instance of ProviderSaml.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderSaml;
    readonly acsUrl: pulumi.Output<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=-5`.
     */
    readonly assertionValidNotBefore: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=5`.
     */
    readonly assertionValidNotOnOrAfter: pulumi.Output<string | undefined>;
    /**
     * Defaults to ``.
     */
    readonly audience: pulumi.Output<string | undefined>;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
    readonly authnContextClassRefMapping: pulumi.Output<string | undefined>;
    readonly authorizationFlow: pulumi.Output<string>;
    /**
     * Defaults to ``.
     */
    readonly defaultRelayState: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#sha1`
     *   - `http://www.w3.org/2001/04/xmlenc#sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#sha384`
     *   - `http://www.w3.org/2001/04/xmlenc#sha512`
     *  Defaults to `http://www.w3.org/2001/04/xmlenc#sha256`.
     */
    readonly digestAlgorithm: pulumi.Output<string | undefined>;
    readonly encryptionKp: pulumi.Output<string | undefined>;
    readonly invalidationFlow: pulumi.Output<string>;
    /**
     * Defaults to `authentik`.
     */
    readonly issuer: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly nameIdMapping: pulumi.Output<string | undefined>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly providerSamlId: pulumi.Output<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=86400`.
     */
    readonly sessionValidNotOnOrAfter: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly signAssertion: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly signResponse: pulumi.Output<boolean | undefined>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#rsa-sha1`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha384`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha512`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha1`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512`
     *   - `http://www.w3.org/2000/09/xmldsig#dsa-sha1`
     *  Defaults to `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`.
     */
    readonly signatureAlgorithm: pulumi.Output<string | undefined>;
    readonly signingKp: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `redirect`
     *   - `post`
     *  Defaults to `redirect`.
     */
    readonly spBinding: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly urlSloPost: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly urlSloRedirect: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly urlSsoInit: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly urlSsoPost: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly urlSsoRedirect: pulumi.Output<string>;
    readonly verificationKp: pulumi.Output<string | undefined>;
    /**
     * Create a ProviderSaml resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderSamlArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderSaml resources.
 */
export interface ProviderSamlState {
    acsUrl?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=-5`.
     */
    assertionValidNotBefore?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=5`.
     */
    assertionValidNotOnOrAfter?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    audience?: pulumi.Input<string>;
    authenticationFlow?: pulumi.Input<string>;
    authnContextClassRefMapping?: pulumi.Input<string>;
    authorizationFlow?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    defaultRelayState?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#sha1`
     *   - `http://www.w3.org/2001/04/xmlenc#sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#sha384`
     *   - `http://www.w3.org/2001/04/xmlenc#sha512`
     *  Defaults to `http://www.w3.org/2001/04/xmlenc#sha256`.
     */
    digestAlgorithm?: pulumi.Input<string>;
    encryptionKp?: pulumi.Input<string>;
    invalidationFlow?: pulumi.Input<string>;
    /**
     * Defaults to `authentik`.
     */
    issuer?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    nameIdMapping?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerSamlId?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=86400`.
     */
    sessionValidNotOnOrAfter?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    signAssertion?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    signResponse?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#rsa-sha1`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha384`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha512`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha1`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512`
     *   - `http://www.w3.org/2000/09/xmldsig#dsa-sha1`
     *  Defaults to `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`.
     */
    signatureAlgorithm?: pulumi.Input<string>;
    signingKp?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `redirect`
     *   - `post`
     *  Defaults to `redirect`.
     */
    spBinding?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSloPost?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSloRedirect?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSsoInit?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSsoPost?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSsoRedirect?: pulumi.Input<string>;
    verificationKp?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderSaml resource.
 */
export interface ProviderSamlArgs {
    acsUrl: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=-5`.
     */
    assertionValidNotBefore?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=5`.
     */
    assertionValidNotOnOrAfter?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    audience?: pulumi.Input<string>;
    authenticationFlow?: pulumi.Input<string>;
    authnContextClassRefMapping?: pulumi.Input<string>;
    authorizationFlow: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    defaultRelayState?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#sha1`
     *   - `http://www.w3.org/2001/04/xmlenc#sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#sha384`
     *   - `http://www.w3.org/2001/04/xmlenc#sha512`
     *  Defaults to `http://www.w3.org/2001/04/xmlenc#sha256`.
     */
    digestAlgorithm?: pulumi.Input<string>;
    encryptionKp?: pulumi.Input<string>;
    invalidationFlow: pulumi.Input<string>;
    /**
     * Defaults to `authentik`.
     */
    issuer?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    nameIdMapping?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    providerSamlId?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=86400`.
     */
    sessionValidNotOnOrAfter?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    signAssertion?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    signResponse?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#rsa-sha1`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha384`
     *   - `http://www.w3.org/2001/04/xmldsig-more#rsa-sha512`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha1`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384`
     *   - `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512`
     *   - `http://www.w3.org/2000/09/xmldsig#dsa-sha1`
     *  Defaults to `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`.
     */
    signatureAlgorithm?: pulumi.Input<string>;
    signingKp?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `redirect`
     *   - `post`
     *  Defaults to `redirect`.
     */
    spBinding?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSloPost?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSloRedirect?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSsoInit?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSsoPost?: pulumi.Input<string>;
    /**
     * Generated.
     */
    urlSsoRedirect?: pulumi.Input<string>;
    verificationKp?: pulumi.Input<string>;
}

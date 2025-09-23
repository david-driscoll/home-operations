import * as pulumi from "@pulumi/pulumi";
export declare class SourceSaml extends pulumi.CustomResource {
    /**
     * Get an existing SourceSaml resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SourceSamlState, opts?: pulumi.CustomResourceOptions): SourceSaml;
    /**
     * Returns true if the given object is an instance of SourceSaml.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SourceSaml;
    /**
     * Defaults to `false`.
     */
    readonly allowIdpInitiated: pulumi.Output<boolean | undefined>;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `REDIRECT`
     *   - `POST`
     *   - `POST_AUTO`
     *  Defaults to `REDIRECT`.
     */
    readonly bindingType: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#sha1`
     *   - `http://www.w3.org/2001/04/xmlenc#sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#sha384`
     *   - `http://www.w3.org/2001/04/xmlenc#sha512`
     *  Defaults to `http://www.w3.org/2001/04/xmlenc#sha256`.
     */
    readonly digestAlgorithm: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    readonly encryptionKp: pulumi.Output<string | undefined>;
    readonly enrollmentFlow: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    readonly groupMatchingMode: pulumi.Output<string | undefined>;
    readonly issuer: pulumi.Output<string | undefined>;
    /**
     * SAML Metadata Generated.
     */
    readonly metadata: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:WindowsDomainQualifiedName`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:transient`
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`
     *  Defaults to `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`.
     */
    readonly nameIdPolicy: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    readonly preAuthenticationFlow: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly propertyMappingsGroups: pulumi.Output<string[] | undefined>;
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
    readonly sloUrl: pulumi.Output<string | undefined>;
    readonly slug: pulumi.Output<string>;
    readonly sourceSamlId: pulumi.Output<string>;
    readonly ssoUrl: pulumi.Output<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=1`.
     */
    readonly temporaryUserDeleteAfter: pulumi.Output<string | undefined>;
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
    readonly verificationKp: pulumi.Output<string | undefined>;
    /**
     * Create a SourceSaml resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SourceSamlArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SourceSaml resources.
 */
export interface SourceSamlState {
    /**
     * Defaults to `false`.
     */
    allowIdpInitiated?: pulumi.Input<boolean>;
    authenticationFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `REDIRECT`
     *   - `POST`
     *   - `POST_AUTO`
     *  Defaults to `REDIRECT`.
     */
    bindingType?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#sha1`
     *   - `http://www.w3.org/2001/04/xmlenc#sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#sha384`
     *   - `http://www.w3.org/2001/04/xmlenc#sha512`
     *  Defaults to `http://www.w3.org/2001/04/xmlenc#sha256`.
     */
    digestAlgorithm?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    encryptionKp?: pulumi.Input<string>;
    enrollmentFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    groupMatchingMode?: pulumi.Input<string>;
    issuer?: pulumi.Input<string>;
    /**
     * SAML Metadata Generated.
     */
    metadata?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:WindowsDomainQualifiedName`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:transient`
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`
     *  Defaults to `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`.
     */
    nameIdPolicy?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    preAuthenticationFlow?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
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
    sloUrl?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
    sourceSamlId?: pulumi.Input<string>;
    ssoUrl?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=1`.
     */
    temporaryUserDeleteAfter?: pulumi.Input<string>;
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
    verificationKp?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SourceSaml resource.
 */
export interface SourceSamlArgs {
    /**
     * Defaults to `false`.
     */
    allowIdpInitiated?: pulumi.Input<boolean>;
    authenticationFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `REDIRECT`
     *   - `POST`
     *   - `POST_AUTO`
     *  Defaults to `REDIRECT`.
     */
    bindingType?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `http://www.w3.org/2000/09/xmldsig#sha1`
     *   - `http://www.w3.org/2001/04/xmlenc#sha256`
     *   - `http://www.w3.org/2001/04/xmldsig-more#sha384`
     *   - `http://www.w3.org/2001/04/xmlenc#sha512`
     *  Defaults to `http://www.w3.org/2001/04/xmlenc#sha256`.
     */
    digestAlgorithm?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    encryptionKp?: pulumi.Input<string>;
    enrollmentFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    groupMatchingMode?: pulumi.Input<string>;
    issuer?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:X509SubjectName`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:WindowsDomainQualifiedName`
     *   - `urn:oasis:names:tc:SAML:2.0:nameid-format:transient`
     *   - `urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified`
     *  Defaults to `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`.
     */
    nameIdPolicy?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    preAuthenticationFlow: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
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
    sloUrl?: pulumi.Input<string>;
    slug: pulumi.Input<string>;
    sourceSamlId?: pulumi.Input<string>;
    ssoUrl: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=1`.
     */
    temporaryUserDeleteAfter?: pulumi.Input<string>;
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
    verificationKp?: pulumi.Input<string>;
}

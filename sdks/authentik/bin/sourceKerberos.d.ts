import * as pulumi from "@pulumi/pulumi";
export declare class SourceKerberos extends pulumi.CustomResource {
    /**
     * Get an existing SourceKerberos resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SourceKerberosState, opts?: pulumi.CustomResourceOptions): SourceKerberos;
    /**
     * Returns true if the given object is an instance of SourceKerberos.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SourceKerberos;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
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
    /**
     * Custom krb5.conf to use. Uses the system one by default
     */
    readonly krb5Conf: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * If enabled, the authentik-stored password will be updated upon login with the Kerberos password backend Defaults to `false`.
     */
    readonly passwordLoginUpdateInternalPassword: pulumi.Output<boolean | undefined>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    /**
     * Kerberos realm
     */
    readonly realm: pulumi.Output<string>;
    readonly slug: pulumi.Output<string>;
    readonly sourceKerberosId: pulumi.Output<string>;
    /**
     * Credential cache to use for SPNEGO in form type:residual
     */
    readonly spnegoCcache: pulumi.Output<string | undefined>;
    /**
     * SPNEGO keytab base64-encoded or path to keytab in the form FILE:path
     */
    readonly spnegoKeytab: pulumi.Output<string | undefined>;
    /**
     * Force the use of a specific server name for SPNEGO
     */
    readonly spnegoServerName: pulumi.Output<string | undefined>;
    /**
     * Credentials cache to authenticate to kadmin for sync. Must be in the form TYPE:residual
     */
    readonly syncCcache: pulumi.Output<string | undefined>;
    /**
     * Keytab to authenticate to kadmin for sync. Must be base64-encoded or in the form TYPE:residual
     */
    readonly syncKeytab: pulumi.Output<string | undefined>;
    /**
     * Password to authenticate to kadmin for sync
     */
    readonly syncPassword: pulumi.Output<string | undefined>;
    /**
     * Principal to authenticate to kadmin for sync.
     */
    readonly syncPrincipal: pulumi.Output<string | undefined>;
    /**
     * Sync users from Kerberos into authentik Defaults to `true`.
     */
    readonly syncUsers: pulumi.Output<boolean | undefined>;
    /**
     * When a user changes their password, sync it back to Kerberos Defaults to `true`.
     */
    readonly syncUsersPassword: pulumi.Output<boolean | undefined>;
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
     * Create a SourceKerberos resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SourceKerberosArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SourceKerberos resources.
 */
export interface SourceKerberosState {
    authenticationFlow?: pulumi.Input<string>;
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
    /**
     * Custom krb5.conf to use. Uses the system one by default
     */
    krb5Conf?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * If enabled, the authentik-stored password will be updated upon login with the Kerberos password backend Defaults to `false`.
     */
    passwordLoginUpdateInternalPassword?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    /**
     * Kerberos realm
     */
    realm?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
    sourceKerberosId?: pulumi.Input<string>;
    /**
     * Credential cache to use for SPNEGO in form type:residual
     */
    spnegoCcache?: pulumi.Input<string>;
    /**
     * SPNEGO keytab base64-encoded or path to keytab in the form FILE:path
     */
    spnegoKeytab?: pulumi.Input<string>;
    /**
     * Force the use of a specific server name for SPNEGO
     */
    spnegoServerName?: pulumi.Input<string>;
    /**
     * Credentials cache to authenticate to kadmin for sync. Must be in the form TYPE:residual
     */
    syncCcache?: pulumi.Input<string>;
    /**
     * Keytab to authenticate to kadmin for sync. Must be base64-encoded or in the form TYPE:residual
     */
    syncKeytab?: pulumi.Input<string>;
    /**
     * Password to authenticate to kadmin for sync
     */
    syncPassword?: pulumi.Input<string>;
    /**
     * Principal to authenticate to kadmin for sync.
     */
    syncPrincipal?: pulumi.Input<string>;
    /**
     * Sync users from Kerberos into authentik Defaults to `true`.
     */
    syncUsers?: pulumi.Input<boolean>;
    /**
     * When a user changes their password, sync it back to Kerberos Defaults to `true`.
     */
    syncUsersPassword?: pulumi.Input<boolean>;
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
 * The set of arguments for constructing a SourceKerberos resource.
 */
export interface SourceKerberosArgs {
    authenticationFlow?: pulumi.Input<string>;
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
    /**
     * Custom krb5.conf to use. Uses the system one by default
     */
    krb5Conf?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * If enabled, the authentik-stored password will be updated upon login with the Kerberos password backend Defaults to `false`.
     */
    passwordLoginUpdateInternalPassword?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    /**
     * Kerberos realm
     */
    realm: pulumi.Input<string>;
    slug: pulumi.Input<string>;
    sourceKerberosId?: pulumi.Input<string>;
    /**
     * Credential cache to use for SPNEGO in form type:residual
     */
    spnegoCcache?: pulumi.Input<string>;
    /**
     * SPNEGO keytab base64-encoded or path to keytab in the form FILE:path
     */
    spnegoKeytab?: pulumi.Input<string>;
    /**
     * Force the use of a specific server name for SPNEGO
     */
    spnegoServerName?: pulumi.Input<string>;
    /**
     * Credentials cache to authenticate to kadmin for sync. Must be in the form TYPE:residual
     */
    syncCcache?: pulumi.Input<string>;
    /**
     * Keytab to authenticate to kadmin for sync. Must be base64-encoded or in the form TYPE:residual
     */
    syncKeytab?: pulumi.Input<string>;
    /**
     * Password to authenticate to kadmin for sync
     */
    syncPassword?: pulumi.Input<string>;
    /**
     * Principal to authenticate to kadmin for sync.
     */
    syncPrincipal?: pulumi.Input<string>;
    /**
     * Sync users from Kerberos into authentik Defaults to `true`.
     */
    syncUsers?: pulumi.Input<boolean>;
    /**
     * When a user changes their password, sync it back to Kerberos Defaults to `true`.
     */
    syncUsersPassword?: pulumi.Input<boolean>;
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

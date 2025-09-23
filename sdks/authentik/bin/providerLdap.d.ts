import * as pulumi from "@pulumi/pulumi";
export declare class ProviderLdap extends pulumi.CustomResource {
    /**
     * Get an existing ProviderLdap resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderLdapState, opts?: pulumi.CustomResourceOptions): ProviderLdap;
    /**
     * Returns true if the given object is an instance of ProviderLdap.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderLdap;
    readonly baseDn: pulumi.Output<string>;
    readonly bindFlow: pulumi.Output<string>;
    /**
     * Defaults to `direct`.
     */
    readonly bindMode: pulumi.Output<string | undefined>;
    readonly certificate: pulumi.Output<string | undefined>;
    /**
     * Defaults to `4000`.
     */
    readonly gidStartNumber: pulumi.Output<number | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly mfaSupport: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly providerLdapId: pulumi.Output<string>;
    /**
     * Defaults to `direct`.
     */
    readonly searchMode: pulumi.Output<string | undefined>;
    readonly tlsServerName: pulumi.Output<string | undefined>;
    /**
     * Defaults to `2000`.
     */
    readonly uidStartNumber: pulumi.Output<number | undefined>;
    readonly unbindFlow: pulumi.Output<string>;
    /**
     * Create a ProviderLdap resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderLdapArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderLdap resources.
 */
export interface ProviderLdapState {
    baseDn?: pulumi.Input<string>;
    bindFlow?: pulumi.Input<string>;
    /**
     * Defaults to `direct`.
     */
    bindMode?: pulumi.Input<string>;
    certificate?: pulumi.Input<string>;
    /**
     * Defaults to `4000`.
     */
    gidStartNumber?: pulumi.Input<number>;
    /**
     * Defaults to `true`.
     */
    mfaSupport?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    providerLdapId?: pulumi.Input<string>;
    /**
     * Defaults to `direct`.
     */
    searchMode?: pulumi.Input<string>;
    tlsServerName?: pulumi.Input<string>;
    /**
     * Defaults to `2000`.
     */
    uidStartNumber?: pulumi.Input<number>;
    unbindFlow?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderLdap resource.
 */
export interface ProviderLdapArgs {
    baseDn: pulumi.Input<string>;
    bindFlow: pulumi.Input<string>;
    /**
     * Defaults to `direct`.
     */
    bindMode?: pulumi.Input<string>;
    certificate?: pulumi.Input<string>;
    /**
     * Defaults to `4000`.
     */
    gidStartNumber?: pulumi.Input<number>;
    /**
     * Defaults to `true`.
     */
    mfaSupport?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    providerLdapId?: pulumi.Input<string>;
    /**
     * Defaults to `direct`.
     */
    searchMode?: pulumi.Input<string>;
    tlsServerName?: pulumi.Input<string>;
    /**
     * Defaults to `2000`.
     */
    uidStartNumber?: pulumi.Input<number>;
    unbindFlow: pulumi.Input<string>;
}

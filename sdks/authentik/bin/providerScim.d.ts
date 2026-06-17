import * as pulumi from "@pulumi/pulumi";
export declare class ProviderScim extends pulumi.CustomResource {
    /**
     * Get an existing ProviderScim resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderScimState, opts?: pulumi.CustomResourceOptions): ProviderScim;
    /**
     * Returns true if the given object is an instance of ProviderScim.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderScim;
    /**
     * Allowed values:
     *   - `token`
     *   - `oauth`
     *  Defaults to `token`.
     */
    readonly authMode: pulumi.Output<string | undefined>;
    /**
     * Slug of an OAuth source used for authentication
     */
    readonly authOauth: pulumi.Output<string | undefined>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly authOauthParams: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `default`
     *   - `aws`
     *   - `slack`
     *   - `sfdc`
     *   - `webex`
     *   - `vcenter`
     *  Defaults to `default`.
     */
    readonly compatibilityMode: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly dryRun: pulumi.Output<boolean | undefined>;
    readonly excludeUsersServiceAccount: pulumi.Output<boolean | undefined>;
    readonly groupFilters: pulumi.Output<string[] | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly propertyMappingsGroups: pulumi.Output<string[] | undefined>;
    readonly providerScimId: pulumi.Output<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `hours=1`.
     */
    readonly serviceProviderConfigCacheTimeout: pulumi.Output<string | undefined>;
    /**
     * Defaults to `100`.
     */
    readonly syncPageSize: pulumi.Output<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    readonly syncPageTimeout: pulumi.Output<string | undefined>;
    readonly token: pulumi.Output<string | undefined>;
    readonly url: pulumi.Output<string>;
    /**
     * Create a ProviderScim resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderScimArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderScim resources.
 */
export interface ProviderScimState {
    /**
     * Allowed values:
     *   - `token`
     *   - `oauth`
     *  Defaults to `token`.
     */
    authMode?: pulumi.Input<string | undefined>;
    /**
     * Slug of an OAuth source used for authentication
     */
    authOauth?: pulumi.Input<string | undefined>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    authOauthParams?: pulumi.Input<string | undefined>;
    /**
     * Allowed values:
     *   - `default`
     *   - `aws`
     *   - `slack`
     *   - `sfdc`
     *   - `webex`
     *   - `vcenter`
     *  Defaults to `default`.
     */
    compatibilityMode?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `false`.
     */
    dryRun?: pulumi.Input<boolean | undefined>;
    excludeUsersServiceAccount?: pulumi.Input<boolean | undefined>;
    groupFilters?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    name?: pulumi.Input<string | undefined>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    providerScimId?: pulumi.Input<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `hours=1`.
     */
    serviceProviderConfigCacheTimeout?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `100`.
     */
    syncPageSize?: pulumi.Input<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    syncPageTimeout?: pulumi.Input<string | undefined>;
    token?: pulumi.Input<string | undefined>;
    url?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a ProviderScim resource.
 */
export interface ProviderScimArgs {
    /**
     * Allowed values:
     *   - `token`
     *   - `oauth`
     *  Defaults to `token`.
     */
    authMode?: pulumi.Input<string | undefined>;
    /**
     * Slug of an OAuth source used for authentication
     */
    authOauth?: pulumi.Input<string | undefined>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    authOauthParams?: pulumi.Input<string | undefined>;
    /**
     * Allowed values:
     *   - `default`
     *   - `aws`
     *   - `slack`
     *   - `sfdc`
     *   - `webex`
     *   - `vcenter`
     *  Defaults to `default`.
     */
    compatibilityMode?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `false`.
     */
    dryRun?: pulumi.Input<boolean | undefined>;
    excludeUsersServiceAccount?: pulumi.Input<boolean | undefined>;
    groupFilters?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    name?: pulumi.Input<string | undefined>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    providerScimId?: pulumi.Input<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `hours=1`.
     */
    serviceProviderConfigCacheTimeout?: pulumi.Input<string | undefined>;
    /**
     * Defaults to `100`.
     */
    syncPageSize?: pulumi.Input<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    syncPageTimeout?: pulumi.Input<string | undefined>;
    token?: pulumi.Input<string | undefined>;
    url: pulumi.Input<string>;
}
//# sourceMappingURL=providerScim.d.ts.map
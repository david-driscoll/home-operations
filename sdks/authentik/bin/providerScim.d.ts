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
     *   - `default`
     *   - `aws`
     *   - `slack`
     *  Defaults to `default`.
     */
    readonly compatibilityMode: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly dryRun: pulumi.Output<boolean | undefined>;
    readonly excludeUsersServiceAccount: pulumi.Output<boolean | undefined>;
    readonly filterGroup: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly propertyMappingsGroups: pulumi.Output<string[] | undefined>;
    readonly providerScimId: pulumi.Output<string>;
    readonly token: pulumi.Output<string>;
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
     *   - `default`
     *   - `aws`
     *   - `slack`
     *  Defaults to `default`.
     */
    compatibilityMode?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    dryRun?: pulumi.Input<boolean>;
    excludeUsersServiceAccount?: pulumi.Input<boolean>;
    filterGroup?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    providerScimId?: pulumi.Input<string>;
    token?: pulumi.Input<string>;
    url?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderScim resource.
 */
export interface ProviderScimArgs {
    /**
     * Allowed values:
     *   - `default`
     *   - `aws`
     *   - `slack`
     *  Defaults to `default`.
     */
    compatibilityMode?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    dryRun?: pulumi.Input<boolean>;
    excludeUsersServiceAccount?: pulumi.Input<boolean>;
    filterGroup?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    providerScimId?: pulumi.Input<string>;
    token: pulumi.Input<string>;
    url: pulumi.Input<string>;
}

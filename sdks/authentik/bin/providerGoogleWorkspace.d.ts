import * as pulumi from "@pulumi/pulumi";
export declare class ProviderGoogleWorkspace extends pulumi.CustomResource {
    /**
     * Get an existing ProviderGoogleWorkspace resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ProviderGoogleWorkspaceState, opts?: pulumi.CustomResourceOptions): ProviderGoogleWorkspace;
    /**
     * Returns true if the given object is an instance of ProviderGoogleWorkspace.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ProviderGoogleWorkspace;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly credentials: pulumi.Output<string | undefined>;
    readonly defaultGroupEmailDomain: pulumi.Output<string>;
    readonly delegatedSubject: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly dryRun: pulumi.Output<boolean | undefined>;
    readonly excludeUsersServiceAccount: pulumi.Output<boolean | undefined>;
    readonly filterGroup: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `delete`
     *   - `do_nothing`
     *  Defaults to `delete`.
     */
    readonly groupDeleteAction: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly propertyMappingsGroups: pulumi.Output<string[] | undefined>;
    readonly providerGoogleWorkspaceId: pulumi.Output<string>;
    /**
     * Defaults to `100`.
     */
    readonly syncPageSize: pulumi.Output<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    readonly syncPageTimeout: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `do_nothing`
     *   - `delete`
     *   - `suspend`
     *  Defaults to `delete`.
     */
    readonly userDeleteAction: pulumi.Output<string | undefined>;
    /**
     * Create a ProviderGoogleWorkspace resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ProviderGoogleWorkspaceArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ProviderGoogleWorkspace resources.
 */
export interface ProviderGoogleWorkspaceState {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    credentials?: pulumi.Input<string>;
    defaultGroupEmailDomain?: pulumi.Input<string>;
    delegatedSubject?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    dryRun?: pulumi.Input<boolean>;
    excludeUsersServiceAccount?: pulumi.Input<boolean>;
    filterGroup?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `delete`
     *   - `do_nothing`
     *  Defaults to `delete`.
     */
    groupDeleteAction?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    providerGoogleWorkspaceId?: pulumi.Input<string>;
    /**
     * Defaults to `100`.
     */
    syncPageSize?: pulumi.Input<number>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    syncPageTimeout?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `do_nothing`
     *   - `delete`
     *   - `suspend`
     *  Defaults to `delete`.
     */
    userDeleteAction?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ProviderGoogleWorkspace resource.
 */
export interface ProviderGoogleWorkspaceArgs {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    credentials?: pulumi.Input<string>;
    defaultGroupEmailDomain: pulumi.Input<string>;
    delegatedSubject?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    dryRun?: pulumi.Input<boolean>;
    excludeUsersServiceAccount?: pulumi.Input<boolean>;
    filterGroup?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `delete`
     *   - `do_nothing`
     *  Defaults to `delete`.
     */
    groupDeleteAction?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    providerGoogleWorkspaceId?: pulumi.Input<string>;
    /**
     * Defaults to `100`.
     */
    syncPageSize?: pulumi.Input<number>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    syncPageTimeout?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `do_nothing`
     *   - `delete`
     *   - `suspend`
     *  Defaults to `delete`.
     */
    userDeleteAction?: pulumi.Input<string>;
}

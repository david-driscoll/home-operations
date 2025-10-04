import * as pulumi from "@pulumi/pulumi";
export declare class ListFilter extends pulumi.CustomResource {
    /**
     * Get an existing ListFilter resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ListFilterState, opts?: pulumi.CustomResourceOptions): ListFilter;
    /**
     * Returns true if the given object is an instance of ListFilter.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ListFilter;
    /**
     * Whether this list filter is enabled. Defaults to `true`
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * Timestamp of last synchronization
     */
    readonly lastUpdated: pulumi.Output<string>;
    /**
     * Name of the list filter
     */
    readonly name: pulumi.Output<string>;
    /**
     * Number of rules in the list filter
     */
    readonly rulesCount: pulumi.Output<number>;
    /**
     * Url of the list filter
     */
    readonly url: pulumi.Output<string>;
    /**
     * When `true`, will consider this list filter of type whitelist. Defaults to `false`
     */
    readonly whitelist: pulumi.Output<boolean>;
    /**
     * Create a ListFilter resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ListFilterArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ListFilter resources.
 */
export interface ListFilterState {
    /**
     * Whether this list filter is enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Timestamp of last synchronization
     */
    lastUpdated?: pulumi.Input<string>;
    /**
     * Name of the list filter
     */
    name?: pulumi.Input<string>;
    /**
     * Number of rules in the list filter
     */
    rulesCount?: pulumi.Input<number>;
    /**
     * Url of the list filter
     */
    url?: pulumi.Input<string>;
    /**
     * When `true`, will consider this list filter of type whitelist. Defaults to `false`
     */
    whitelist?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a ListFilter resource.
 */
export interface ListFilterArgs {
    /**
     * Whether this list filter is enabled. Defaults to `true`
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Name of the list filter
     */
    name?: pulumi.Input<string>;
    /**
     * Url of the list filter
     */
    url: pulumi.Input<string>;
    /**
     * When `true`, will consider this list filter of type whitelist. Defaults to `false`
     */
    whitelist?: pulumi.Input<boolean>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class Outpost extends pulumi.CustomResource {
    /**
     * Get an existing Outpost resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: OutpostState, opts?: pulumi.CustomResourceOptions): Outpost;
    /**
     * Returns true if the given object is an instance of Outpost.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Outpost;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Generated.
     */
    readonly config: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    readonly outpostId: pulumi.Output<string>;
    readonly protocolProviders: pulumi.Output<number[]>;
    readonly serviceConnection: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `proxy`
     *   - `ldap`
     *   - `radius`
     *   - `rac`
     *  Defaults to `proxy`.
     */
    readonly type: pulumi.Output<string | undefined>;
    /**
     * Create a Outpost resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: OutpostArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Outpost resources.
 */
export interface OutpostState {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Generated.
     */
    config?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    outpostId?: pulumi.Input<string>;
    protocolProviders?: pulumi.Input<pulumi.Input<number>[]>;
    serviceConnection?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `proxy`
     *   - `ldap`
     *   - `radius`
     *   - `rac`
     *  Defaults to `proxy`.
     */
    type?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Outpost resource.
 */
export interface OutpostArgs {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Generated.
     */
    config?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    outpostId?: pulumi.Input<string>;
    protocolProviders: pulumi.Input<pulumi.Input<number>[]>;
    serviceConnection?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `proxy`
     *   - `ldap`
     *   - `radius`
     *   - `rac`
     *  Defaults to `proxy`.
     */
    type?: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class FirewallGroup extends pulumi.CustomResource {
    /**
     * Get an existing FirewallGroup resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: FirewallGroupState, opts?: pulumi.CustomResourceOptions): FirewallGroup;
    /**
     * Returns true if the given object is an instance of FirewallGroup.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is FirewallGroup;
    /**
     * The members of the firewall group.
     */
    readonly members: pulumi.Output<string[]>;
    /**
     * The name of the firewall group.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The name of the site to associate the firewall group with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The type of the firewall group. Must be one of: `address-group`, `port-group`, or `ipv6-address-group`.
     */
    readonly type: pulumi.Output<string>;
    /**
     * Create a FirewallGroup resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: FirewallGroupArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering FirewallGroup resources.
 */
export interface FirewallGroupState {
    /**
     * The members of the firewall group.
     */
    members?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the firewall group.
     */
    name?: pulumi.Input<string>;
    /**
     * The name of the site to associate the firewall group with.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of the firewall group. Must be one of: `address-group`, `port-group`, or `ipv6-address-group`.
     */
    type?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a FirewallGroup resource.
 */
export interface FirewallGroupArgs {
    /**
     * The members of the firewall group.
     */
    members: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the firewall group.
     */
    name?: pulumi.Input<string>;
    /**
     * The name of the site to associate the firewall group with.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of the firewall group. Must be one of: `address-group`, `port-group`, or `ipv6-address-group`.
     */
    type: pulumi.Input<string>;
}

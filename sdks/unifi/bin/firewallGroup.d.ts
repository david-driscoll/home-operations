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
     * List of members in the group. The format depends on the group type:
     *   * For address-group: IPv4 addresses or CIDR notation (e.g., ['192.168.1.10', '10.0.0.0/8'])
     *   * For port-group: Port numbers or ranges (e.g., ['80', '443', '8000-8080'])
     *   * For ipv6-address-group: IPv6 addresses or CIDR notation
     */
    readonly members: pulumi.Output<string[]>;
    /**
     * A friendly name for the firewall group to help identify its purpose (e.g., 'Trusted IPs' or 'Web Server Ports'). Must be unique within the site.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The name of the UniFi site where the firewall group should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The type of firewall group. Valid values are:
     *   * `address-group` - Group of IPv4 addresses and/or networks (e.g., '192.168.1.10', '10.0.0.0/8')
     *   * `port-group` - Group of ports or port ranges (e.g., '80', '443', '8000-8080')
     *   * `ipv6-address-group` - Group of IPv6 addresses and/or networks
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
     * List of members in the group. The format depends on the group type:
     *   * For address-group: IPv4 addresses or CIDR notation (e.g., ['192.168.1.10', '10.0.0.0/8'])
     *   * For port-group: Port numbers or ranges (e.g., ['80', '443', '8000-8080'])
     *   * For ipv6-address-group: IPv6 addresses or CIDR notation
     */
    members?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * A friendly name for the firewall group to help identify its purpose (e.g., 'Trusted IPs' or 'Web Server Ports'). Must be unique within the site.
     */
    name?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the firewall group should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of firewall group. Valid values are:
     *   * `address-group` - Group of IPv4 addresses and/or networks (e.g., '192.168.1.10', '10.0.0.0/8')
     *   * `port-group` - Group of ports or port ranges (e.g., '80', '443', '8000-8080')
     *   * `ipv6-address-group` - Group of IPv6 addresses and/or networks
     */
    type?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a FirewallGroup resource.
 */
export interface FirewallGroupArgs {
    /**
     * List of members in the group. The format depends on the group type:
     *   * For address-group: IPv4 addresses or CIDR notation (e.g., ['192.168.1.10', '10.0.0.0/8'])
     *   * For port-group: Port numbers or ranges (e.g., ['80', '443', '8000-8080'])
     *   * For ipv6-address-group: IPv6 addresses or CIDR notation
     */
    members: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * A friendly name for the firewall group to help identify its purpose (e.g., 'Trusted IPs' or 'Web Server Ports'). Must be unique within the site.
     */
    name?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the firewall group should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of firewall group. Valid values are:
     *   * `address-group` - Group of IPv4 addresses and/or networks (e.g., '192.168.1.10', '10.0.0.0/8')
     *   * `port-group` - Group of ports or port ranges (e.g., '80', '443', '8000-8080')
     *   * `ipv6-address-group` - Group of IPv6 addresses and/or networks
     */
    type: pulumi.Input<string>;
}

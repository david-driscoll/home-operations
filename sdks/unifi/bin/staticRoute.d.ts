import * as pulumi from "@pulumi/pulumi";
export declare class StaticRoute extends pulumi.CustomResource {
    /**
     * Get an existing StaticRoute resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StaticRouteState, opts?: pulumi.CustomResourceOptions): StaticRoute;
    /**
     * Returns true if the given object is an instance of StaticRoute.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StaticRoute;
    /**
     * The administrative distance for this route. Lower values are preferred. Use this to control route selection when multiple routes to the same destination exist.
     */
    readonly distance: pulumi.Output<number>;
    /**
     * The outbound interface to use for this route. Only used when type is set to 'interface-route'. Can be:
     *   * `WAN1` - Primary WAN interface
     *   * `WAN2` - Secondary WAN interface
     *   * A network ID for internal networks
     */
    readonly interface: pulumi.Output<string | undefined>;
    /**
     * A friendly name for the static route to help identify its purpose (e.g., 'Backup DC Link' or 'Cloud VPN Route').
     */
    readonly name: pulumi.Output<string>;
    /**
     * The destination network in CIDR notation that this route will direct traffic to (e.g., '10.0.0.0/16' or '192.168.100.0/24').
     */
    readonly network: pulumi.Output<string>;
    /**
     * The IP address of the next hop router for this route. Only used when type is set to 'nexthop-route'. This should be an IP address that is directly reachable from your UniFi gateway.
     */
    readonly nextHop: pulumi.Output<string | undefined>;
    /**
     * The name of the UniFi site where the static route should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The type of static route. Valid values are:
     *   * `interface-route` - Route traffic through a specific interface
     *   * `nexthop-route` - Route traffic to a specific next-hop IP address
     *   * `blackhole` - Drop all traffic to this network
     */
    readonly type: pulumi.Output<string>;
    /**
     * Create a StaticRoute resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StaticRouteArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StaticRoute resources.
 */
export interface StaticRouteState {
    /**
     * The administrative distance for this route. Lower values are preferred. Use this to control route selection when multiple routes to the same destination exist.
     */
    distance?: pulumi.Input<number>;
    /**
     * The outbound interface to use for this route. Only used when type is set to 'interface-route'. Can be:
     *   * `WAN1` - Primary WAN interface
     *   * `WAN2` - Secondary WAN interface
     *   * A network ID for internal networks
     */
    interface?: pulumi.Input<string>;
    /**
     * A friendly name for the static route to help identify its purpose (e.g., 'Backup DC Link' or 'Cloud VPN Route').
     */
    name?: pulumi.Input<string>;
    /**
     * The destination network in CIDR notation that this route will direct traffic to (e.g., '10.0.0.0/16' or '192.168.100.0/24').
     */
    network?: pulumi.Input<string>;
    /**
     * The IP address of the next hop router for this route. Only used when type is set to 'nexthop-route'. This should be an IP address that is directly reachable from your UniFi gateway.
     */
    nextHop?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the static route should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of static route. Valid values are:
     *   * `interface-route` - Route traffic through a specific interface
     *   * `nexthop-route` - Route traffic to a specific next-hop IP address
     *   * `blackhole` - Drop all traffic to this network
     */
    type?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StaticRoute resource.
 */
export interface StaticRouteArgs {
    /**
     * The administrative distance for this route. Lower values are preferred. Use this to control route selection when multiple routes to the same destination exist.
     */
    distance: pulumi.Input<number>;
    /**
     * The outbound interface to use for this route. Only used when type is set to 'interface-route'. Can be:
     *   * `WAN1` - Primary WAN interface
     *   * `WAN2` - Secondary WAN interface
     *   * A network ID for internal networks
     */
    interface?: pulumi.Input<string>;
    /**
     * A friendly name for the static route to help identify its purpose (e.g., 'Backup DC Link' or 'Cloud VPN Route').
     */
    name?: pulumi.Input<string>;
    /**
     * The destination network in CIDR notation that this route will direct traffic to (e.g., '10.0.0.0/16' or '192.168.100.0/24').
     */
    network: pulumi.Input<string>;
    /**
     * The IP address of the next hop router for this route. Only used when type is set to 'nexthop-route'. This should be an IP address that is directly reachable from your UniFi gateway.
     */
    nextHop?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the static route should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of static route. Valid values are:
     *   * `interface-route` - Route traffic through a specific interface
     *   * `nexthop-route` - Route traffic to a specific next-hop IP address
     *   * `blackhole` - Drop all traffic to this network
     */
    type: pulumi.Input<string>;
}

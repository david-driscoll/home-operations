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
     * The distance of the static route.
     */
    readonly distance: pulumi.Output<number>;
    /**
     * The interface of the static route (only valid for `interface-route` type). This can be `WAN1`, `WAN2`, or a network ID.
     */
    readonly interface: pulumi.Output<string | undefined>;
    /**
     * The name of the static route.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The network subnet address.
     */
    readonly network: pulumi.Output<string>;
    /**
     * The next hop of the static route (only valid for `nexthop-route` type).
     */
    readonly nextHop: pulumi.Output<string | undefined>;
    /**
     * The name of the site to associate the static route with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The type of static route. Can be `interface-route`, `nexthop-route`, or `blackhole`.
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
     * The distance of the static route.
     */
    distance?: pulumi.Input<number>;
    /**
     * The interface of the static route (only valid for `interface-route` type). This can be `WAN1`, `WAN2`, or a network ID.
     */
    interface?: pulumi.Input<string>;
    /**
     * The name of the static route.
     */
    name?: pulumi.Input<string>;
    /**
     * The network subnet address.
     */
    network?: pulumi.Input<string>;
    /**
     * The next hop of the static route (only valid for `nexthop-route` type).
     */
    nextHop?: pulumi.Input<string>;
    /**
     * The name of the site to associate the static route with.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of static route. Can be `interface-route`, `nexthop-route`, or `blackhole`.
     */
    type?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StaticRoute resource.
 */
export interface StaticRouteArgs {
    /**
     * The distance of the static route.
     */
    distance: pulumi.Input<number>;
    /**
     * The interface of the static route (only valid for `interface-route` type). This can be `WAN1`, `WAN2`, or a network ID.
     */
    interface?: pulumi.Input<string>;
    /**
     * The name of the static route.
     */
    name?: pulumi.Input<string>;
    /**
     * The network subnet address.
     */
    network: pulumi.Input<string>;
    /**
     * The next hop of the static route (only valid for `nexthop-route` type).
     */
    nextHop?: pulumi.Input<string>;
    /**
     * The name of the site to associate the static route with.
     */
    site?: pulumi.Input<string>;
    /**
     * The type of static route. Can be `interface-route`, `nexthop-route`, or `blackhole`.
     */
    type: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * Whether the static route is enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * The MAC address of the gateway device, used when `gateway_type` is `switch`.
     */
    readonly gatewayDevice: pulumi.Output<string | undefined>;
    /**
     * The type of gateway for the static route. Can be `default` or `switch`.
     */
    readonly gatewayType: pulumi.Output<string>;
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
     * The next hop of the static route (only valid for `nexthop-route` type). Accepts IPv4 or IPv6 addresses.
     */
    readonly nextHop: pulumi.Output<string | undefined>;
    /**
     * The name of the site to associate the static route with.
     */
    readonly site: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.StaticRouteTimeouts | undefined>;
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
    distance?: pulumi.Input<number | undefined>;
    /**
     * Whether the static route is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The MAC address of the gateway device, used when `gateway_type` is `switch`.
     */
    gatewayDevice?: pulumi.Input<string | undefined>;
    /**
     * The type of gateway for the static route. Can be `default` or `switch`.
     */
    gatewayType?: pulumi.Input<string | undefined>;
    /**
     * The interface of the static route (only valid for `interface-route` type). This can be `WAN1`, `WAN2`, or a network ID.
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * The name of the static route.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The network subnet address.
     */
    network?: pulumi.Input<string | undefined>;
    /**
     * The next hop of the static route (only valid for `nexthop-route` type). Accepts IPv4 or IPv6 addresses.
     */
    nextHop?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the static route with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.StaticRouteTimeouts | undefined>;
    /**
     * The type of static route. Can be `interface-route`, `nexthop-route`, or `blackhole`.
     */
    type?: pulumi.Input<string | undefined>;
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
     * Whether the static route is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The MAC address of the gateway device, used when `gateway_type` is `switch`.
     */
    gatewayDevice?: pulumi.Input<string | undefined>;
    /**
     * The type of gateway for the static route. Can be `default` or `switch`.
     */
    gatewayType?: pulumi.Input<string | undefined>;
    /**
     * The interface of the static route (only valid for `interface-route` type). This can be `WAN1`, `WAN2`, or a network ID.
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * The name of the static route.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The network subnet address.
     */
    network: pulumi.Input<string>;
    /**
     * The next hop of the static route (only valid for `nexthop-route` type). Accepts IPv4 or IPv6 addresses.
     */
    nextHop?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the static route with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.StaticRouteTimeouts | undefined>;
    /**
     * The type of static route. Can be `interface-route`, `nexthop-route`, or `blackhole`.
     */
    type: pulumi.Input<string>;
}
//# sourceMappingURL=staticRoute.d.ts.map
import * as pulumi from "@pulumi/pulumi";
export declare class PortForward extends pulumi.CustomResource {
    /**
     * Get an existing PortForward resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PortForwardState, opts?: pulumi.CustomResourceOptions): PortForward;
    /**
     * Returns true if the given object is an instance of PortForward.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PortForward;
    /**
     * The destination port for the forwarding.
     */
    readonly dstPort: pulumi.Output<string | undefined>;
    /**
     * Specifies whether the port forwarding rule is enabled or not. Defaults to `true`. This will attribute will be removed in a future release. Instead of disabling a port forwarding rule you can remove it from your configuration.
     *
     * @deprecated Deprecated
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * The IPv4 address to forward traffic to.
     */
    readonly fwdIp: pulumi.Output<string | undefined>;
    /**
     * The port to forward traffic to.
     */
    readonly fwdPort: pulumi.Output<string | undefined>;
    /**
     * Specifies whether to log forwarded traffic or not. Defaults to `false`.
     */
    readonly log: pulumi.Output<boolean | undefined>;
    /**
     * The name of the port forwarding rule.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The port forwarding interface. Can be `wan`, `wan2`, or `both`.
     */
    readonly portForwardInterface: pulumi.Output<string | undefined>;
    /**
     * The protocol for the port forwarding rule. Can be `tcp`, `udp`, or `tcp_udp`. Defaults to `tcp_udp`.
     */
    readonly protocol: pulumi.Output<string | undefined>;
    /**
     * The name of the site to associate the port forwarding rule with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The source IPv4 address (or CIDR) of the port forwarding rule. For all traffic, specify `any`. Defaults to `any`.
     */
    readonly srcIp: pulumi.Output<string | undefined>;
    /**
     * Create a PortForward resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: PortForwardArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PortForward resources.
 */
export interface PortForwardState {
    /**
     * The destination port for the forwarding.
     */
    dstPort?: pulumi.Input<string>;
    /**
     * Specifies whether the port forwarding rule is enabled or not. Defaults to `true`. This will attribute will be removed in a future release. Instead of disabling a port forwarding rule you can remove it from your configuration.
     *
     * @deprecated Deprecated
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The IPv4 address to forward traffic to.
     */
    fwdIp?: pulumi.Input<string>;
    /**
     * The port to forward traffic to.
     */
    fwdPort?: pulumi.Input<string>;
    /**
     * Specifies whether to log forwarded traffic or not. Defaults to `false`.
     */
    log?: pulumi.Input<boolean>;
    /**
     * The name of the port forwarding rule.
     */
    name?: pulumi.Input<string>;
    /**
     * The port forwarding interface. Can be `wan`, `wan2`, or `both`.
     */
    portForwardInterface?: pulumi.Input<string>;
    /**
     * The protocol for the port forwarding rule. Can be `tcp`, `udp`, or `tcp_udp`. Defaults to `tcp_udp`.
     */
    protocol?: pulumi.Input<string>;
    /**
     * The name of the site to associate the port forwarding rule with.
     */
    site?: pulumi.Input<string>;
    /**
     * The source IPv4 address (or CIDR) of the port forwarding rule. For all traffic, specify `any`. Defaults to `any`.
     */
    srcIp?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PortForward resource.
 */
export interface PortForwardArgs {
    /**
     * The destination port for the forwarding.
     */
    dstPort?: pulumi.Input<string>;
    /**
     * Specifies whether the port forwarding rule is enabled or not. Defaults to `true`. This will attribute will be removed in a future release. Instead of disabling a port forwarding rule you can remove it from your configuration.
     *
     * @deprecated Deprecated
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The IPv4 address to forward traffic to.
     */
    fwdIp?: pulumi.Input<string>;
    /**
     * The port to forward traffic to.
     */
    fwdPort?: pulumi.Input<string>;
    /**
     * Specifies whether to log forwarded traffic or not. Defaults to `false`.
     */
    log?: pulumi.Input<boolean>;
    /**
     * The name of the port forwarding rule.
     */
    name?: pulumi.Input<string>;
    /**
     * The port forwarding interface. Can be `wan`, `wan2`, or `both`.
     */
    portForwardInterface?: pulumi.Input<string>;
    /**
     * The protocol for the port forwarding rule. Can be `tcp`, `udp`, or `tcp_udp`. Defaults to `tcp_udp`.
     */
    protocol?: pulumi.Input<string>;
    /**
     * The name of the site to associate the port forwarding rule with.
     */
    site?: pulumi.Input<string>;
    /**
     * The source IPv4 address (or CIDR) of the port forwarding rule. For all traffic, specify `any`. Defaults to `any`.
     */
    srcIp?: pulumi.Input<string>;
}

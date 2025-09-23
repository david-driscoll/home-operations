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
     * The external port(s) that will be forwarded. Can be a single port (e.g., '80') or a port range (e.g., '8080:8090').
     */
    readonly dstPort: pulumi.Output<string | undefined>;
    /**
     * Specifies whether the port forwarding rule is enabled or not. Defaults to `true`. This will attribute will be removed in a future release. Instead of disabling a port forwarding rule you can remove it from your configuration.
     *
     * @deprecated Deprecated
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * The internal IPv4 address of the device or service that will receive the forwarded traffic (e.g., '192.168.1.100').
     */
    readonly fwdIp: pulumi.Output<string | undefined>;
    /**
     * The internal port(s) that will receive the forwarded traffic. Can be a single port (e.g., '8080') or a port range (e.g., '8080:8090').
     */
    readonly fwdPort: pulumi.Output<string | undefined>;
    /**
     * Enable logging of traffic matching this port forwarding rule. Useful for monitoring and troubleshooting. Defaults to `false`.
     */
    readonly log: pulumi.Output<boolean | undefined>;
    /**
     * A friendly name for the port forwarding rule to help identify its purpose (e.g., 'Web Server' or 'Game Server').
     */
    readonly name: pulumi.Output<string>;
    /**
     * The WAN interface to apply the port forwarding rule to. Valid values are:
     *   * `wan` - Primary WAN interface
     *   * `wan2` - Secondary WAN interface
     *   * `both` - Both WAN interfaces
     */
    readonly portForwardInterface: pulumi.Output<string | undefined>;
    /**
     * The network protocol(s) this rule applies to. Valid values are:
     *   * `tcp_udp` - Both TCP and UDP (default)
     *   * `tcp` - TCP only
     *   * `udp` - UDP only Defaults to `tcp_udp`.
     */
    readonly protocol: pulumi.Output<string | undefined>;
    /**
     * The name of the UniFi site where the port forwarding rule should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The source IP address or network in CIDR notation that is allowed to use this port forward. Use 'any' to allow all source IPs. Examples: '203.0.113.1' for a single IP, '203.0.113.0/24' for a network, or 'any' for all IPs. Defaults to `any`.
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
     * The external port(s) that will be forwarded. Can be a single port (e.g., '80') or a port range (e.g., '8080:8090').
     */
    dstPort?: pulumi.Input<string>;
    /**
     * Specifies whether the port forwarding rule is enabled or not. Defaults to `true`. This will attribute will be removed in a future release. Instead of disabling a port forwarding rule you can remove it from your configuration.
     *
     * @deprecated Deprecated
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The internal IPv4 address of the device or service that will receive the forwarded traffic (e.g., '192.168.1.100').
     */
    fwdIp?: pulumi.Input<string>;
    /**
     * The internal port(s) that will receive the forwarded traffic. Can be a single port (e.g., '8080') or a port range (e.g., '8080:8090').
     */
    fwdPort?: pulumi.Input<string>;
    /**
     * Enable logging of traffic matching this port forwarding rule. Useful for monitoring and troubleshooting. Defaults to `false`.
     */
    log?: pulumi.Input<boolean>;
    /**
     * A friendly name for the port forwarding rule to help identify its purpose (e.g., 'Web Server' or 'Game Server').
     */
    name?: pulumi.Input<string>;
    /**
     * The WAN interface to apply the port forwarding rule to. Valid values are:
     *   * `wan` - Primary WAN interface
     *   * `wan2` - Secondary WAN interface
     *   * `both` - Both WAN interfaces
     */
    portForwardInterface?: pulumi.Input<string>;
    /**
     * The network protocol(s) this rule applies to. Valid values are:
     *   * `tcp_udp` - Both TCP and UDP (default)
     *   * `tcp` - TCP only
     *   * `udp` - UDP only Defaults to `tcp_udp`.
     */
    protocol?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the port forwarding rule should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The source IP address or network in CIDR notation that is allowed to use this port forward. Use 'any' to allow all source IPs. Examples: '203.0.113.1' for a single IP, '203.0.113.0/24' for a network, or 'any' for all IPs. Defaults to `any`.
     */
    srcIp?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PortForward resource.
 */
export interface PortForwardArgs {
    /**
     * The external port(s) that will be forwarded. Can be a single port (e.g., '80') or a port range (e.g., '8080:8090').
     */
    dstPort?: pulumi.Input<string>;
    /**
     * Specifies whether the port forwarding rule is enabled or not. Defaults to `true`. This will attribute will be removed in a future release. Instead of disabling a port forwarding rule you can remove it from your configuration.
     *
     * @deprecated Deprecated
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The internal IPv4 address of the device or service that will receive the forwarded traffic (e.g., '192.168.1.100').
     */
    fwdIp?: pulumi.Input<string>;
    /**
     * The internal port(s) that will receive the forwarded traffic. Can be a single port (e.g., '8080') or a port range (e.g., '8080:8090').
     */
    fwdPort?: pulumi.Input<string>;
    /**
     * Enable logging of traffic matching this port forwarding rule. Useful for monitoring and troubleshooting. Defaults to `false`.
     */
    log?: pulumi.Input<boolean>;
    /**
     * A friendly name for the port forwarding rule to help identify its purpose (e.g., 'Web Server' or 'Game Server').
     */
    name?: pulumi.Input<string>;
    /**
     * The WAN interface to apply the port forwarding rule to. Valid values are:
     *   * `wan` - Primary WAN interface
     *   * `wan2` - Secondary WAN interface
     *   * `both` - Both WAN interfaces
     */
    portForwardInterface?: pulumi.Input<string>;
    /**
     * The network protocol(s) this rule applies to. Valid values are:
     *   * `tcp_udp` - Both TCP and UDP (default)
     *   * `tcp` - TCP only
     *   * `udp` - UDP only Defaults to `tcp_udp`.
     */
    protocol?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the port forwarding rule should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The source IP address or network in CIDR notation that is allowed to use this port forward. Use 'any' to allow all source IPs. Examples: '203.0.113.1' for a single IP, '203.0.113.0/24' for a network, or 'any' for all IPs. Defaults to `any`.
     */
    srcIp?: pulumi.Input<string>;
}

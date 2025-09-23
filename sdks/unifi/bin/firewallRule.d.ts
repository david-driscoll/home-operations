import * as pulumi from "@pulumi/pulumi";
export declare class FirewallRule extends pulumi.CustomResource {
    /**
     * Get an existing FirewallRule resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: FirewallRuleState, opts?: pulumi.CustomResourceOptions): FirewallRule;
    /**
     * Returns true if the given object is an instance of FirewallRule.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is FirewallRule;
    /**
     * The action to take when traffic matches this rule. Valid values are:
     *   * `accept` - Allow the traffic
     *   * `drop` - Silently block the traffic
     *   * `reject` - Block the traffic and send an ICMP rejection message
     */
    readonly action: pulumi.Output<string>;
    /**
     * The destination IPv4 address or network in CIDR notation (e.g., '192.168.1.10' or '192.168.0.0/24'). The format must match dst_network_type - use a single IP for ADDRv4 or CIDR for NETv4.
     */
    readonly dstAddress: pulumi.Output<string | undefined>;
    /**
     * The destination IPv6 address or network in CIDR notation (e.g., '2001:db8::1' or '2001:db8::/64'). Used for IPv6 firewall rules.
     */
    readonly dstAddressIpv6: pulumi.Output<string | undefined>;
    /**
     * A list of firewall group IDs to use as destinations. Groups can contain IP addresses, networks, or port numbers. This allows you to create reusable sets of addresses/ports and reference them in multiple rules.
     */
    readonly dstFirewallGroupIds: pulumi.Output<string[] | undefined>;
    /**
     * The ID of the destination network this rule applies to. This can be found in the URL when viewing the network in the UniFi controller.
     */
    readonly dstNetworkId: pulumi.Output<string | undefined>;
    /**
     * The type of destination network address. Valid values are:
     *   * `ADDRv4` - Single IPv4 address
     *   * `NETv4` - IPv4 network in CIDR notation Defaults to `NETv4`.
     */
    readonly dstNetworkType: pulumi.Output<string | undefined>;
    /**
     * The destination port(s) for this rule. Can be:
     *   * A single port number (e.g., '80')
     *   * A port range (e.g., '8000:8080')
     *   * A list of ports/ranges separated by commas
     */
    readonly dstPort: pulumi.Output<string | undefined>;
    /**
     * Whether this firewall rule is active (true) or disabled (false). Defaults to true. Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * The ICMP type name when protocol is set to 'icmp'. Common values include:
     *   * `echo-request` - ICMP ping requests
     *   * `echo-reply` - ICMP ping replies
     *   * `destination-unreachable` - Host/network unreachable messages
     *   * `time-exceeded` - TTL exceeded messages (traceroute)
     */
    readonly icmpTypename: pulumi.Output<string | undefined>;
    /**
     * The ICMPv6 type name when protocol_v6 is set to 'ipv6-icmp'. Common values (not all are listed) include:
     *   * `echo-request` - IPv6 ping requests
     *   * `echo-reply` - IPv6 ping replies
     *   * `neighbor-solicitation` - IPv6 neighbor discovery
     *   * `neighbor-advertisement` - IPv6 neighbor announcements
     *   * `destination-unreachable` - Host/network unreachable messages
     *   * `packet-too-big` - Path MTU discovery messages
     */
    readonly icmpV6Typename: pulumi.Output<string | undefined>;
    /**
     * Specify whether the rule matches on IPsec packets. Can be one of `match-ipsec` or `match-none`.
     */
    readonly ipSec: pulumi.Output<string | undefined>;
    /**
     * Enable logging for the firewall rule.
     */
    readonly logging: pulumi.Output<boolean | undefined>;
    /**
     * A friendly name for the firewall rule. This helps identify the rule's purpose in the UniFi controller UI.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The IPv4 protocol this rule applies to. Common values (not all are listed) include:
     *   * `all` - Match all protocols
     *   * `tcp` - TCP traffic only (e.g., web, email)
     *   * `udp` - UDP traffic only (e.g., DNS, VoIP)
     *   * `tcp_udp` - Both TCP and UDP
     *   * `icmp` - ICMP traffic (ping, traceroute)
     *   * Protocol numbers (1-255) for other protocols
     *
     * Examples:
     *   * Use 'tcp' for web server rules (ports 80, 443)
     *   * Use 'udp' for VoIP or gaming traffic
     *   * Use 'all' for general network access rules
     */
    readonly protocol: pulumi.Output<string | undefined>;
    /**
     * The IPv6 protocol this rule applies to. Similar to 'protocol' but for IPv6 traffic. Common values (not all are listed) include:
     *   * `all` - Match all protocols
     *   * `tcp` - TCP traffic only
     *   * `udp` - UDP traffic only
     *   * `tcp_udp` - Both TCP and UDP traffic
     *   * `ipv6-icmp` - ICMPv6 traffic
     */
    readonly protocolV6: pulumi.Output<string | undefined>;
    /**
     * The processing order for this rule. Lower numbers are processed first. Custom rules should use:
     *   * 2000-2999 for rules processed before auto-generated rules
     *   * 4000-4999 for rules processed after auto-generated rules
     */
    readonly ruleIndex: pulumi.Output<number>;
    /**
     * Defines which traffic flow this rule applies to. The format is [NETWORK]_[DIRECTION], where:
     *   * NETWORK can be: WAN, LAN, GUEST (or their IPv6 variants WANv6, LANv6, GUESTv6)
     *   * DIRECTION can be:
     *     * IN - Traffic entering the network
     *     * OUT - Traffic leaving the network
     *     * LOCAL - Traffic destined for the USG/UDM itself
     *
     * Examples: WAN_IN (incoming WAN traffic), LAN_OUT (outgoing LAN traffic), GUEST_LOCAL (traffic to Controller from guest network)
     */
    readonly ruleset: pulumi.Output<string>;
    /**
     * The name of the UniFi site where the firewall rule should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The source IPv4 address for the firewall rule.
     */
    readonly srcAddress: pulumi.Output<string | undefined>;
    /**
     * The source IPv6 address or network in CIDR notation (e.g., '2001:db8::1' or '2001:db8::/64'). Used for IPv6 firewall rules.
     */
    readonly srcAddressIpv6: pulumi.Output<string | undefined>;
    /**
     * A list of firewall group IDs to use as sources. Groups can contain:
     *   * IP Address Groups - For matching specific IP addresses
     *   * Network Groups - For matching entire subnets
     *   * Port Groups - For matching specific port numbers
     *
     * Example uses:
     *   * Group of trusted admin IPs for remote access
     *   * Group of IoT device networks for isolation
     *   * Group of common service ports for allowing specific applications
     */
    readonly srcFirewallGroupIds: pulumi.Output<string[] | undefined>;
    /**
     * The source MAC address this rule applies to. Use this to create rules that match specific devices regardless of their IP address. Format: 'XX:XX:XX:XX:XX:XX'. MAC addresses are case-insensitive.
     */
    readonly srcMac: pulumi.Output<string | undefined>;
    /**
     * The ID of the source network this rule applies to. This can be found in the URL when viewing the network in the UniFi controller, or by using the network's name in the form `[site]/[network_name]`.
     */
    readonly srcNetworkId: pulumi.Output<string | undefined>;
    /**
     * The type of source network address. Valid values are:
     *   * `ADDRv4` - Single IPv4 address
     *   * `NETv4` - IPv4 network in CIDR notation Defaults to `NETv4`.
     */
    readonly srcNetworkType: pulumi.Output<string | undefined>;
    /**
     * The source port(s) for this rule. Can be:
     *   * A single port number (e.g., '80')
     *   * A port range (e.g., '8000:8080')
     *   * A list of ports/ranges separated by commas
     */
    readonly srcPort: pulumi.Output<string | undefined>;
    /**
     * Match established connections. When enabled:
     *   * Rule only applies to packets that are part of an existing connection
     *   * Useful for allowing return traffic without creating separate rules
     *   * Common in WAN_IN rules to allow responses to outbound connections
     *
     * Example: Allow established connections from WAN while blocking new incoming connections
     */
    readonly stateEstablished: pulumi.Output<boolean | undefined>;
    /**
     * Match where the state is invalid.
     */
    readonly stateInvalid: pulumi.Output<boolean | undefined>;
    /**
     * Match where the state is new.
     */
    readonly stateNew: pulumi.Output<boolean | undefined>;
    /**
     * Match where the state is related.
     */
    readonly stateRelated: pulumi.Output<boolean | undefined>;
    /**
     * Create a FirewallRule resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: FirewallRuleArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering FirewallRule resources.
 */
export interface FirewallRuleState {
    /**
     * The action to take when traffic matches this rule. Valid values are:
     *   * `accept` - Allow the traffic
     *   * `drop` - Silently block the traffic
     *   * `reject` - Block the traffic and send an ICMP rejection message
     */
    action?: pulumi.Input<string>;
    /**
     * The destination IPv4 address or network in CIDR notation (e.g., '192.168.1.10' or '192.168.0.0/24'). The format must match dst_network_type - use a single IP for ADDRv4 or CIDR for NETv4.
     */
    dstAddress?: pulumi.Input<string>;
    /**
     * The destination IPv6 address or network in CIDR notation (e.g., '2001:db8::1' or '2001:db8::/64'). Used for IPv6 firewall rules.
     */
    dstAddressIpv6?: pulumi.Input<string>;
    /**
     * A list of firewall group IDs to use as destinations. Groups can contain IP addresses, networks, or port numbers. This allows you to create reusable sets of addresses/ports and reference them in multiple rules.
     */
    dstFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The ID of the destination network this rule applies to. This can be found in the URL when viewing the network in the UniFi controller.
     */
    dstNetworkId?: pulumi.Input<string>;
    /**
     * The type of destination network address. Valid values are:
     *   * `ADDRv4` - Single IPv4 address
     *   * `NETv4` - IPv4 network in CIDR notation Defaults to `NETv4`.
     */
    dstNetworkType?: pulumi.Input<string>;
    /**
     * The destination port(s) for this rule. Can be:
     *   * A single port number (e.g., '80')
     *   * A port range (e.g., '8000:8080')
     *   * A list of ports/ranges separated by commas
     */
    dstPort?: pulumi.Input<string>;
    /**
     * Whether this firewall rule is active (true) or disabled (false). Defaults to true. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The ICMP type name when protocol is set to 'icmp'. Common values include:
     *   * `echo-request` - ICMP ping requests
     *   * `echo-reply` - ICMP ping replies
     *   * `destination-unreachable` - Host/network unreachable messages
     *   * `time-exceeded` - TTL exceeded messages (traceroute)
     */
    icmpTypename?: pulumi.Input<string>;
    /**
     * The ICMPv6 type name when protocol_v6 is set to 'ipv6-icmp'. Common values (not all are listed) include:
     *   * `echo-request` - IPv6 ping requests
     *   * `echo-reply` - IPv6 ping replies
     *   * `neighbor-solicitation` - IPv6 neighbor discovery
     *   * `neighbor-advertisement` - IPv6 neighbor announcements
     *   * `destination-unreachable` - Host/network unreachable messages
     *   * `packet-too-big` - Path MTU discovery messages
     */
    icmpV6Typename?: pulumi.Input<string>;
    /**
     * Specify whether the rule matches on IPsec packets. Can be one of `match-ipsec` or `match-none`.
     */
    ipSec?: pulumi.Input<string>;
    /**
     * Enable logging for the firewall rule.
     */
    logging?: pulumi.Input<boolean>;
    /**
     * A friendly name for the firewall rule. This helps identify the rule's purpose in the UniFi controller UI.
     */
    name?: pulumi.Input<string>;
    /**
     * The IPv4 protocol this rule applies to. Common values (not all are listed) include:
     *   * `all` - Match all protocols
     *   * `tcp` - TCP traffic only (e.g., web, email)
     *   * `udp` - UDP traffic only (e.g., DNS, VoIP)
     *   * `tcp_udp` - Both TCP and UDP
     *   * `icmp` - ICMP traffic (ping, traceroute)
     *   * Protocol numbers (1-255) for other protocols
     *
     * Examples:
     *   * Use 'tcp' for web server rules (ports 80, 443)
     *   * Use 'udp' for VoIP or gaming traffic
     *   * Use 'all' for general network access rules
     */
    protocol?: pulumi.Input<string>;
    /**
     * The IPv6 protocol this rule applies to. Similar to 'protocol' but for IPv6 traffic. Common values (not all are listed) include:
     *   * `all` - Match all protocols
     *   * `tcp` - TCP traffic only
     *   * `udp` - UDP traffic only
     *   * `tcp_udp` - Both TCP and UDP traffic
     *   * `ipv6-icmp` - ICMPv6 traffic
     */
    protocolV6?: pulumi.Input<string>;
    /**
     * The processing order for this rule. Lower numbers are processed first. Custom rules should use:
     *   * 2000-2999 for rules processed before auto-generated rules
     *   * 4000-4999 for rules processed after auto-generated rules
     */
    ruleIndex?: pulumi.Input<number>;
    /**
     * Defines which traffic flow this rule applies to. The format is [NETWORK]_[DIRECTION], where:
     *   * NETWORK can be: WAN, LAN, GUEST (or their IPv6 variants WANv6, LANv6, GUESTv6)
     *   * DIRECTION can be:
     *     * IN - Traffic entering the network
     *     * OUT - Traffic leaving the network
     *     * LOCAL - Traffic destined for the USG/UDM itself
     *
     * Examples: WAN_IN (incoming WAN traffic), LAN_OUT (outgoing LAN traffic), GUEST_LOCAL (traffic to Controller from guest network)
     */
    ruleset?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the firewall rule should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The source IPv4 address for the firewall rule.
     */
    srcAddress?: pulumi.Input<string>;
    /**
     * The source IPv6 address or network in CIDR notation (e.g., '2001:db8::1' or '2001:db8::/64'). Used for IPv6 firewall rules.
     */
    srcAddressIpv6?: pulumi.Input<string>;
    /**
     * A list of firewall group IDs to use as sources. Groups can contain:
     *   * IP Address Groups - For matching specific IP addresses
     *   * Network Groups - For matching entire subnets
     *   * Port Groups - For matching specific port numbers
     *
     * Example uses:
     *   * Group of trusted admin IPs for remote access
     *   * Group of IoT device networks for isolation
     *   * Group of common service ports for allowing specific applications
     */
    srcFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The source MAC address this rule applies to. Use this to create rules that match specific devices regardless of their IP address. Format: 'XX:XX:XX:XX:XX:XX'. MAC addresses are case-insensitive.
     */
    srcMac?: pulumi.Input<string>;
    /**
     * The ID of the source network this rule applies to. This can be found in the URL when viewing the network in the UniFi controller, or by using the network's name in the form `[site]/[network_name]`.
     */
    srcNetworkId?: pulumi.Input<string>;
    /**
     * The type of source network address. Valid values are:
     *   * `ADDRv4` - Single IPv4 address
     *   * `NETv4` - IPv4 network in CIDR notation Defaults to `NETv4`.
     */
    srcNetworkType?: pulumi.Input<string>;
    /**
     * The source port(s) for this rule. Can be:
     *   * A single port number (e.g., '80')
     *   * A port range (e.g., '8000:8080')
     *   * A list of ports/ranges separated by commas
     */
    srcPort?: pulumi.Input<string>;
    /**
     * Match established connections. When enabled:
     *   * Rule only applies to packets that are part of an existing connection
     *   * Useful for allowing return traffic without creating separate rules
     *   * Common in WAN_IN rules to allow responses to outbound connections
     *
     * Example: Allow established connections from WAN while blocking new incoming connections
     */
    stateEstablished?: pulumi.Input<boolean>;
    /**
     * Match where the state is invalid.
     */
    stateInvalid?: pulumi.Input<boolean>;
    /**
     * Match where the state is new.
     */
    stateNew?: pulumi.Input<boolean>;
    /**
     * Match where the state is related.
     */
    stateRelated?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a FirewallRule resource.
 */
export interface FirewallRuleArgs {
    /**
     * The action to take when traffic matches this rule. Valid values are:
     *   * `accept` - Allow the traffic
     *   * `drop` - Silently block the traffic
     *   * `reject` - Block the traffic and send an ICMP rejection message
     */
    action: pulumi.Input<string>;
    /**
     * The destination IPv4 address or network in CIDR notation (e.g., '192.168.1.10' or '192.168.0.0/24'). The format must match dst_network_type - use a single IP for ADDRv4 or CIDR for NETv4.
     */
    dstAddress?: pulumi.Input<string>;
    /**
     * The destination IPv6 address or network in CIDR notation (e.g., '2001:db8::1' or '2001:db8::/64'). Used for IPv6 firewall rules.
     */
    dstAddressIpv6?: pulumi.Input<string>;
    /**
     * A list of firewall group IDs to use as destinations. Groups can contain IP addresses, networks, or port numbers. This allows you to create reusable sets of addresses/ports and reference them in multiple rules.
     */
    dstFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The ID of the destination network this rule applies to. This can be found in the URL when viewing the network in the UniFi controller.
     */
    dstNetworkId?: pulumi.Input<string>;
    /**
     * The type of destination network address. Valid values are:
     *   * `ADDRv4` - Single IPv4 address
     *   * `NETv4` - IPv4 network in CIDR notation Defaults to `NETv4`.
     */
    dstNetworkType?: pulumi.Input<string>;
    /**
     * The destination port(s) for this rule. Can be:
     *   * A single port number (e.g., '80')
     *   * A port range (e.g., '8000:8080')
     *   * A list of ports/ranges separated by commas
     */
    dstPort?: pulumi.Input<string>;
    /**
     * Whether this firewall rule is active (true) or disabled (false). Defaults to true. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The ICMP type name when protocol is set to 'icmp'. Common values include:
     *   * `echo-request` - ICMP ping requests
     *   * `echo-reply` - ICMP ping replies
     *   * `destination-unreachable` - Host/network unreachable messages
     *   * `time-exceeded` - TTL exceeded messages (traceroute)
     */
    icmpTypename?: pulumi.Input<string>;
    /**
     * The ICMPv6 type name when protocol_v6 is set to 'ipv6-icmp'. Common values (not all are listed) include:
     *   * `echo-request` - IPv6 ping requests
     *   * `echo-reply` - IPv6 ping replies
     *   * `neighbor-solicitation` - IPv6 neighbor discovery
     *   * `neighbor-advertisement` - IPv6 neighbor announcements
     *   * `destination-unreachable` - Host/network unreachable messages
     *   * `packet-too-big` - Path MTU discovery messages
     */
    icmpV6Typename?: pulumi.Input<string>;
    /**
     * Specify whether the rule matches on IPsec packets. Can be one of `match-ipsec` or `match-none`.
     */
    ipSec?: pulumi.Input<string>;
    /**
     * Enable logging for the firewall rule.
     */
    logging?: pulumi.Input<boolean>;
    /**
     * A friendly name for the firewall rule. This helps identify the rule's purpose in the UniFi controller UI.
     */
    name?: pulumi.Input<string>;
    /**
     * The IPv4 protocol this rule applies to. Common values (not all are listed) include:
     *   * `all` - Match all protocols
     *   * `tcp` - TCP traffic only (e.g., web, email)
     *   * `udp` - UDP traffic only (e.g., DNS, VoIP)
     *   * `tcp_udp` - Both TCP and UDP
     *   * `icmp` - ICMP traffic (ping, traceroute)
     *   * Protocol numbers (1-255) for other protocols
     *
     * Examples:
     *   * Use 'tcp' for web server rules (ports 80, 443)
     *   * Use 'udp' for VoIP or gaming traffic
     *   * Use 'all' for general network access rules
     */
    protocol?: pulumi.Input<string>;
    /**
     * The IPv6 protocol this rule applies to. Similar to 'protocol' but for IPv6 traffic. Common values (not all are listed) include:
     *   * `all` - Match all protocols
     *   * `tcp` - TCP traffic only
     *   * `udp` - UDP traffic only
     *   * `tcp_udp` - Both TCP and UDP traffic
     *   * `ipv6-icmp` - ICMPv6 traffic
     */
    protocolV6?: pulumi.Input<string>;
    /**
     * The processing order for this rule. Lower numbers are processed first. Custom rules should use:
     *   * 2000-2999 for rules processed before auto-generated rules
     *   * 4000-4999 for rules processed after auto-generated rules
     */
    ruleIndex: pulumi.Input<number>;
    /**
     * Defines which traffic flow this rule applies to. The format is [NETWORK]_[DIRECTION], where:
     *   * NETWORK can be: WAN, LAN, GUEST (or their IPv6 variants WANv6, LANv6, GUESTv6)
     *   * DIRECTION can be:
     *     * IN - Traffic entering the network
     *     * OUT - Traffic leaving the network
     *     * LOCAL - Traffic destined for the USG/UDM itself
     *
     * Examples: WAN_IN (incoming WAN traffic), LAN_OUT (outgoing LAN traffic), GUEST_LOCAL (traffic to Controller from guest network)
     */
    ruleset: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the firewall rule should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The source IPv4 address for the firewall rule.
     */
    srcAddress?: pulumi.Input<string>;
    /**
     * The source IPv6 address or network in CIDR notation (e.g., '2001:db8::1' or '2001:db8::/64'). Used for IPv6 firewall rules.
     */
    srcAddressIpv6?: pulumi.Input<string>;
    /**
     * A list of firewall group IDs to use as sources. Groups can contain:
     *   * IP Address Groups - For matching specific IP addresses
     *   * Network Groups - For matching entire subnets
     *   * Port Groups - For matching specific port numbers
     *
     * Example uses:
     *   * Group of trusted admin IPs for remote access
     *   * Group of IoT device networks for isolation
     *   * Group of common service ports for allowing specific applications
     */
    srcFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The source MAC address this rule applies to. Use this to create rules that match specific devices regardless of their IP address. Format: 'XX:XX:XX:XX:XX:XX'. MAC addresses are case-insensitive.
     */
    srcMac?: pulumi.Input<string>;
    /**
     * The ID of the source network this rule applies to. This can be found in the URL when viewing the network in the UniFi controller, or by using the network's name in the form `[site]/[network_name]`.
     */
    srcNetworkId?: pulumi.Input<string>;
    /**
     * The type of source network address. Valid values are:
     *   * `ADDRv4` - Single IPv4 address
     *   * `NETv4` - IPv4 network in CIDR notation Defaults to `NETv4`.
     */
    srcNetworkType?: pulumi.Input<string>;
    /**
     * The source port(s) for this rule. Can be:
     *   * A single port number (e.g., '80')
     *   * A port range (e.g., '8000:8080')
     *   * A list of ports/ranges separated by commas
     */
    srcPort?: pulumi.Input<string>;
    /**
     * Match established connections. When enabled:
     *   * Rule only applies to packets that are part of an existing connection
     *   * Useful for allowing return traffic without creating separate rules
     *   * Common in WAN_IN rules to allow responses to outbound connections
     *
     * Example: Allow established connections from WAN while blocking new incoming connections
     */
    stateEstablished?: pulumi.Input<boolean>;
    /**
     * Match where the state is invalid.
     */
    stateInvalid?: pulumi.Input<boolean>;
    /**
     * Match where the state is new.
     */
    stateNew?: pulumi.Input<boolean>;
    /**
     * Match where the state is related.
     */
    stateRelated?: pulumi.Input<boolean>;
}

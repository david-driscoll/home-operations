import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * The action of the firewall rule. Must be one of `drop`, `accept`, or `reject`.
     */
    readonly action: pulumi.Output<string>;
    /**
     * The destination address of the firewall rule.
     */
    readonly dstAddress: pulumi.Output<string | undefined>;
    /**
     * The IPv6 destination address of the firewall rule.
     */
    readonly dstAddressIpv6: pulumi.Output<string | undefined>;
    /**
     * The destination firewall group IDs of the firewall rule.
     */
    readonly dstFirewallGroupIds: pulumi.Output<string[] | undefined>;
    /**
     * The destination network ID of the firewall rule.
     */
    readonly dstNetworkId: pulumi.Output<string | undefined>;
    /**
     * The destination network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    readonly dstNetworkType: pulumi.Output<string>;
    /**
     * The destination port of the firewall rule.
     */
    readonly dstPort: pulumi.Output<string | undefined>;
    /**
     * Specifies whether the rule should be enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * ICMP type name.
     */
    readonly icmpTypename: pulumi.Output<string | undefined>;
    /**
     * ICMPv6 type name.
     */
    readonly icmpV6Typename: pulumi.Output<string | undefined>;
    /**
     * Specify whether the rule matches on IPsec packets. Can be one of `match-ipset` or `match-none`.
     */
    readonly ipSec: pulumi.Output<string | undefined>;
    /**
     * Enable logging for the firewall rule.
     */
    readonly logging: pulumi.Output<boolean>;
    /**
     * The name of the firewall rule.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The protocol of the rule.
     */
    readonly protocol: pulumi.Output<string | undefined>;
    /**
     * Match packets that do NOT match the specified protocol (protocol negation).
     */
    readonly protocolMatchExcepted: pulumi.Output<boolean>;
    /**
     * The IPv6 protocol of the rule.
     */
    readonly protocolV6: pulumi.Output<string | undefined>;
    /**
     * The index of the rule. Must be in one of the interface-specific blocks: `2000-2999` (LAN), `3000-3999` (WAN), `4000-4999` (GUEST), or their high-range equivalents `20000-29999`, `30000-39999`, `40000-49999` used by newer UniFi OS versions.
     */
    readonly ruleIndex: pulumi.Output<number>;
    /**
     * The ruleset for the rule. This is from the perspective of the security gateway.
     */
    readonly ruleset: pulumi.Output<string>;
    /**
     * Whether the rule is managed automatically by the controller or manually. Can be one of `auto` or `manual`.
     */
    readonly settingPreference: pulumi.Output<string>;
    /**
     * The name of the site to associate the firewall rule with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The source address for the firewall rule.
     */
    readonly srcAddress: pulumi.Output<string | undefined>;
    /**
     * The IPv6 source address for the firewall rule.
     */
    readonly srcAddressIpv6: pulumi.Output<string | undefined>;
    /**
     * The source firewall group IDs for the firewall rule.
     */
    readonly srcFirewallGroupIds: pulumi.Output<string[] | undefined>;
    /**
     * The source MAC address of the firewall rule.
     */
    readonly srcMac: pulumi.Output<string | undefined>;
    /**
     * The source network ID for the firewall rule.
     */
    readonly srcNetworkId: pulumi.Output<string | undefined>;
    /**
     * The source network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    readonly srcNetworkType: pulumi.Output<string>;
    /**
     * The source port of the firewall rule.
     */
    readonly srcPort: pulumi.Output<string | undefined>;
    /**
     * Match where the state is established.
     */
    readonly stateEstablished: pulumi.Output<boolean>;
    /**
     * Match where the state is invalid.
     */
    readonly stateInvalid: pulumi.Output<boolean>;
    /**
     * Match where the state is new.
     */
    readonly stateNew: pulumi.Output<boolean>;
    /**
     * Match where the state is related.
     */
    readonly stateRelated: pulumi.Output<boolean>;
    readonly timeouts: pulumi.Output<outputs.FirewallRuleTimeouts | undefined>;
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
     * The action of the firewall rule. Must be one of `drop`, `accept`, or `reject`.
     */
    action?: pulumi.Input<string | undefined>;
    /**
     * The destination address of the firewall rule.
     */
    dstAddress?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 destination address of the firewall rule.
     */
    dstAddressIpv6?: pulumi.Input<string | undefined>;
    /**
     * The destination firewall group IDs of the firewall rule.
     */
    dstFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The destination network ID of the firewall rule.
     */
    dstNetworkId?: pulumi.Input<string | undefined>;
    /**
     * The destination network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    dstNetworkType?: pulumi.Input<string | undefined>;
    /**
     * The destination port of the firewall rule.
     */
    dstPort?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether the rule should be enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * ICMP type name.
     */
    icmpTypename?: pulumi.Input<string | undefined>;
    /**
     * ICMPv6 type name.
     */
    icmpV6Typename?: pulumi.Input<string | undefined>;
    /**
     * Specify whether the rule matches on IPsec packets. Can be one of `match-ipset` or `match-none`.
     */
    ipSec?: pulumi.Input<string | undefined>;
    /**
     * Enable logging for the firewall rule.
     */
    logging?: pulumi.Input<boolean | undefined>;
    /**
     * The name of the firewall rule.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The protocol of the rule.
     */
    protocol?: pulumi.Input<string | undefined>;
    /**
     * Match packets that do NOT match the specified protocol (protocol negation).
     */
    protocolMatchExcepted?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 protocol of the rule.
     */
    protocolV6?: pulumi.Input<string | undefined>;
    /**
     * The index of the rule. Must be in one of the interface-specific blocks: `2000-2999` (LAN), `3000-3999` (WAN), `4000-4999` (GUEST), or their high-range equivalents `20000-29999`, `30000-39999`, `40000-49999` used by newer UniFi OS versions.
     */
    ruleIndex?: pulumi.Input<number | undefined>;
    /**
     * The ruleset for the rule. This is from the perspective of the security gateway.
     */
    ruleset?: pulumi.Input<string | undefined>;
    /**
     * Whether the rule is managed automatically by the controller or manually. Can be one of `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the firewall rule with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * The source address for the firewall rule.
     */
    srcAddress?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 source address for the firewall rule.
     */
    srcAddressIpv6?: pulumi.Input<string | undefined>;
    /**
     * The source firewall group IDs for the firewall rule.
     */
    srcFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The source MAC address of the firewall rule.
     */
    srcMac?: pulumi.Input<string | undefined>;
    /**
     * The source network ID for the firewall rule.
     */
    srcNetworkId?: pulumi.Input<string | undefined>;
    /**
     * The source network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    srcNetworkType?: pulumi.Input<string | undefined>;
    /**
     * The source port of the firewall rule.
     */
    srcPort?: pulumi.Input<string | undefined>;
    /**
     * Match where the state is established.
     */
    stateEstablished?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is invalid.
     */
    stateInvalid?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is new.
     */
    stateNew?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is related.
     */
    stateRelated?: pulumi.Input<boolean | undefined>;
    timeouts?: pulumi.Input<inputs.FirewallRuleTimeouts | undefined>;
}
/**
 * The set of arguments for constructing a FirewallRule resource.
 */
export interface FirewallRuleArgs {
    /**
     * The action of the firewall rule. Must be one of `drop`, `accept`, or `reject`.
     */
    action: pulumi.Input<string>;
    /**
     * The destination address of the firewall rule.
     */
    dstAddress?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 destination address of the firewall rule.
     */
    dstAddressIpv6?: pulumi.Input<string | undefined>;
    /**
     * The destination firewall group IDs of the firewall rule.
     */
    dstFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The destination network ID of the firewall rule.
     */
    dstNetworkId?: pulumi.Input<string | undefined>;
    /**
     * The destination network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    dstNetworkType?: pulumi.Input<string | undefined>;
    /**
     * The destination port of the firewall rule.
     */
    dstPort?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether the rule should be enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * ICMP type name.
     */
    icmpTypename?: pulumi.Input<string | undefined>;
    /**
     * ICMPv6 type name.
     */
    icmpV6Typename?: pulumi.Input<string | undefined>;
    /**
     * Specify whether the rule matches on IPsec packets. Can be one of `match-ipset` or `match-none`.
     */
    ipSec?: pulumi.Input<string | undefined>;
    /**
     * Enable logging for the firewall rule.
     */
    logging?: pulumi.Input<boolean | undefined>;
    /**
     * The name of the firewall rule.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The protocol of the rule.
     */
    protocol?: pulumi.Input<string | undefined>;
    /**
     * Match packets that do NOT match the specified protocol (protocol negation).
     */
    protocolMatchExcepted?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 protocol of the rule.
     */
    protocolV6?: pulumi.Input<string | undefined>;
    /**
     * The index of the rule. Must be in one of the interface-specific blocks: `2000-2999` (LAN), `3000-3999` (WAN), `4000-4999` (GUEST), or their high-range equivalents `20000-29999`, `30000-39999`, `40000-49999` used by newer UniFi OS versions.
     */
    ruleIndex: pulumi.Input<number>;
    /**
     * The ruleset for the rule. This is from the perspective of the security gateway.
     */
    ruleset: pulumi.Input<string>;
    /**
     * Whether the rule is managed automatically by the controller or manually. Can be one of `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the firewall rule with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * The source address for the firewall rule.
     */
    srcAddress?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 source address for the firewall rule.
     */
    srcAddressIpv6?: pulumi.Input<string | undefined>;
    /**
     * The source firewall group IDs for the firewall rule.
     */
    srcFirewallGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The source MAC address of the firewall rule.
     */
    srcMac?: pulumi.Input<string | undefined>;
    /**
     * The source network ID for the firewall rule.
     */
    srcNetworkId?: pulumi.Input<string | undefined>;
    /**
     * The source network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    srcNetworkType?: pulumi.Input<string | undefined>;
    /**
     * The source port of the firewall rule.
     */
    srcPort?: pulumi.Input<string | undefined>;
    /**
     * Match where the state is established.
     */
    stateEstablished?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is invalid.
     */
    stateInvalid?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is new.
     */
    stateNew?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is related.
     */
    stateRelated?: pulumi.Input<boolean | undefined>;
    timeouts?: pulumi.Input<inputs.FirewallRuleTimeouts | undefined>;
}
//# sourceMappingURL=firewallRule.d.ts.map
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
     * The destination match criteria of the firewall rule.
     */
    readonly destination: pulumi.Output<outputs.FirewallRuleDestination>;
    /**
     * Specifies whether the rule should be enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * ICMP type matching for the firewall rule.
     */
    readonly icmp: pulumi.Output<outputs.FirewallRuleIcmp | undefined>;
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
     * The source match criteria of the firewall rule.
     */
    readonly source: pulumi.Output<outputs.FirewallRuleSource>;
    /**
     * Connection state matching for the firewall rule.
     */
    readonly state: pulumi.Output<outputs.FirewallRuleState>;
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
     * The destination match criteria of the firewall rule.
     */
    destination?: pulumi.Input<inputs.FirewallRuleDestination | undefined>;
    /**
     * Specifies whether the rule should be enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * ICMP type matching for the firewall rule.
     */
    icmp?: pulumi.Input<inputs.FirewallRuleIcmp | undefined>;
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
     * The source match criteria of the firewall rule.
     */
    source?: pulumi.Input<inputs.FirewallRuleSource | undefined>;
    /**
     * Connection state matching for the firewall rule.
     */
    state?: pulumi.Input<inputs.FirewallRuleState | undefined>;
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
     * The destination match criteria of the firewall rule.
     */
    destination?: pulumi.Input<inputs.FirewallRuleDestination | undefined>;
    /**
     * Specifies whether the rule should be enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * ICMP type matching for the firewall rule.
     */
    icmp?: pulumi.Input<inputs.FirewallRuleIcmp | undefined>;
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
     * The source match criteria of the firewall rule.
     */
    source?: pulumi.Input<inputs.FirewallRuleSource | undefined>;
    /**
     * Connection state matching for the firewall rule.
     */
    state?: pulumi.Input<inputs.FirewallRuleState | undefined>;
    timeouts?: pulumi.Input<inputs.FirewallRuleTimeouts | undefined>;
}
//# sourceMappingURL=firewallRule.d.ts.map
import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class FirewallZonePolicy extends pulumi.CustomResource {
    /**
     * Get an existing FirewallZonePolicy resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: FirewallZonePolicyState, opts?: pulumi.CustomResourceOptions): FirewallZonePolicy;
    /**
     * Returns true if the given object is an instance of FirewallZonePolicy.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is FirewallZonePolicy;
    /**
     * Determines which action to take on matching traffic. Must be one of `BLOCK`, `ALLOW`, or `REJECT`.
     */
    readonly action: pulumi.Output<string>;
    /**
     * Creates a built-in policy for the opposite Zone Pair to automatically allow the return traffic. If disabled, return traffic must be manually allowed
     */
    readonly autoAllowReturnTraffic: pulumi.Output<boolean>;
    /**
     * Optionally match on a firewall connection state such as traffic associated with an already existing connection. Valid values are `ALL`, `RESPOND_ONLY`, or `CUSTOM`.
     */
    readonly connectionStateType: pulumi.Output<string>;
    /**
     * Connection states to match when `connection_state_type` is `CUSTOM`. Valid values include `ESTABLISHED`, `NEW`, `RELATED`, and `INVALID`.
     */
    readonly connectionStates: pulumi.Output<string[] | undefined>;
    /**
     * Description of the firewall zone policy.
     */
    readonly description: pulumi.Output<string | undefined>;
    /**
     * The zone matching the destination of the traffic. Optionally match on a specific destination inside the zone.
     */
    readonly destination: pulumi.Output<outputs.FirewallZonePolicyDestination>;
    /**
     * Enable the policy
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * Priority index for the policy.
     */
    readonly index: pulumi.Output<number>;
    /**
     * Optionally match on only IPv4 or IPv6. Valid values are `BOTH`, `IPV4`, or `IPV6`.
     */
    readonly ipVersion: pulumi.Output<string>;
    /**
     * Enable to generate syslog entries when traffic is matched.
     */
    readonly logging: pulumi.Output<boolean>;
    /**
     * Optionally match on traffic encrypted by IPsec. This is typically used for Ipsec Policy-Based VPNs. Valid values are `MATCH_IP_SEC` or `MATCH_NON_IP_SEC`.
     */
    readonly matchIpSecType: pulumi.Output<string | undefined>;
    /**
     * Whether to match the opposite protocol.
     */
    readonly matchOppositeProtocol: pulumi.Output<boolean>;
    /**
     * The name of the firewall zone policy.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Optionally match a specific protocol. Valid values include: `all`, `tcp_udp`, `tcp`, `udp`, etc.
     */
    readonly protocol: pulumi.Output<string>;
    /**
     * Enforce this policy at specific times.
     */
    readonly schedule: pulumi.Output<outputs.FirewallZonePolicySchedule>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The zone matching the source of the traffic. Optionally match on a specific source inside the zone.
     */
    readonly source: pulumi.Output<outputs.FirewallZonePolicySource>;
    /**
     * Create a FirewallZonePolicy resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: FirewallZonePolicyArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering FirewallZonePolicy resources.
 */
export interface FirewallZonePolicyState {
    /**
     * Determines which action to take on matching traffic. Must be one of `BLOCK`, `ALLOW`, or `REJECT`.
     */
    action?: pulumi.Input<string>;
    /**
     * Creates a built-in policy for the opposite Zone Pair to automatically allow the return traffic. If disabled, return traffic must be manually allowed
     */
    autoAllowReturnTraffic?: pulumi.Input<boolean>;
    /**
     * Optionally match on a firewall connection state such as traffic associated with an already existing connection. Valid values are `ALL`, `RESPOND_ONLY`, or `CUSTOM`.
     */
    connectionStateType?: pulumi.Input<string>;
    /**
     * Connection states to match when `connection_state_type` is `CUSTOM`. Valid values include `ESTABLISHED`, `NEW`, `RELATED`, and `INVALID`.
     */
    connectionStates?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Description of the firewall zone policy.
     */
    description?: pulumi.Input<string>;
    /**
     * The zone matching the destination of the traffic. Optionally match on a specific destination inside the zone.
     */
    destination?: pulumi.Input<inputs.FirewallZonePolicyDestination>;
    /**
     * Enable the policy
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Priority index for the policy.
     */
    index?: pulumi.Input<number>;
    /**
     * Optionally match on only IPv4 or IPv6. Valid values are `BOTH`, `IPV4`, or `IPV6`.
     */
    ipVersion?: pulumi.Input<string>;
    /**
     * Enable to generate syslog entries when traffic is matched.
     */
    logging?: pulumi.Input<boolean>;
    /**
     * Optionally match on traffic encrypted by IPsec. This is typically used for Ipsec Policy-Based VPNs. Valid values are `MATCH_IP_SEC` or `MATCH_NON_IP_SEC`.
     */
    matchIpSecType?: pulumi.Input<string>;
    /**
     * Whether to match the opposite protocol.
     */
    matchOppositeProtocol?: pulumi.Input<boolean>;
    /**
     * The name of the firewall zone policy.
     */
    name?: pulumi.Input<string>;
    /**
     * Optionally match a specific protocol. Valid values include: `all`, `tcp_udp`, `tcp`, `udp`, etc.
     */
    protocol?: pulumi.Input<string>;
    /**
     * Enforce this policy at specific times.
     */
    schedule?: pulumi.Input<inputs.FirewallZonePolicySchedule>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The zone matching the source of the traffic. Optionally match on a specific source inside the zone.
     */
    source?: pulumi.Input<inputs.FirewallZonePolicySource>;
}
/**
 * The set of arguments for constructing a FirewallZonePolicy resource.
 */
export interface FirewallZonePolicyArgs {
    /**
     * Determines which action to take on matching traffic. Must be one of `BLOCK`, `ALLOW`, or `REJECT`.
     */
    action: pulumi.Input<string>;
    /**
     * Creates a built-in policy for the opposite Zone Pair to automatically allow the return traffic. If disabled, return traffic must be manually allowed
     */
    autoAllowReturnTraffic?: pulumi.Input<boolean>;
    /**
     * Optionally match on a firewall connection state such as traffic associated with an already existing connection. Valid values are `ALL`, `RESPOND_ONLY`, or `CUSTOM`.
     */
    connectionStateType?: pulumi.Input<string>;
    /**
     * Connection states to match when `connection_state_type` is `CUSTOM`. Valid values include `ESTABLISHED`, `NEW`, `RELATED`, and `INVALID`.
     */
    connectionStates?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Description of the firewall zone policy.
     */
    description?: pulumi.Input<string>;
    /**
     * The zone matching the destination of the traffic. Optionally match on a specific destination inside the zone.
     */
    destination: pulumi.Input<inputs.FirewallZonePolicyDestination>;
    /**
     * Enable the policy
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Priority index for the policy.
     */
    index?: pulumi.Input<number>;
    /**
     * Optionally match on only IPv4 or IPv6. Valid values are `BOTH`, `IPV4`, or `IPV6`.
     */
    ipVersion?: pulumi.Input<string>;
    /**
     * Enable to generate syslog entries when traffic is matched.
     */
    logging?: pulumi.Input<boolean>;
    /**
     * Optionally match on traffic encrypted by IPsec. This is typically used for Ipsec Policy-Based VPNs. Valid values are `MATCH_IP_SEC` or `MATCH_NON_IP_SEC`.
     */
    matchIpSecType?: pulumi.Input<string>;
    /**
     * Whether to match the opposite protocol.
     */
    matchOppositeProtocol?: pulumi.Input<boolean>;
    /**
     * The name of the firewall zone policy.
     */
    name?: pulumi.Input<string>;
    /**
     * Optionally match a specific protocol. Valid values include: `all`, `tcp_udp`, `tcp`, `udp`, etc.
     */
    protocol?: pulumi.Input<string>;
    /**
     * Enforce this policy at specific times.
     */
    schedule?: pulumi.Input<inputs.FirewallZonePolicySchedule>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The zone matching the source of the traffic. Optionally match on a specific source inside the zone.
     */
    source: pulumi.Input<inputs.FirewallZonePolicySource>;
}

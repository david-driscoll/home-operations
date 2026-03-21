import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * Specifies whether the port forwarding rule is enabled or not.
     *
     * @deprecated Deprecated
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * Forward destination configuration.
     */
    readonly forward: pulumi.Output<outputs.PortForwardForward | undefined>;
    /**
     * Specifies whether to enable syslog logging for forwarded traffic.
     */
    readonly logging: pulumi.Output<boolean>;
    /**
     * The name of the port forwarding rule.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The protocol for the port forwarding rule. Can be `tcp`, `udp`, or `tcp_udp`.
     */
    readonly protocol: pulumi.Output<string>;
    /**
     * The name of the site to associate the port forwarding rule with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Source limiting configuration for the port forwarding rule.
     */
    readonly sourceLimiting: pulumi.Output<outputs.PortForwardSourceLimiting | undefined>;
    /**
     * WAN configuration for the port forwarding rule.
     */
    readonly wan: pulumi.Output<outputs.PortForwardWan | undefined>;
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
     * Specifies whether the port forwarding rule is enabled or not.
     *
     * @deprecated Deprecated
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Forward destination configuration.
     */
    forward?: pulumi.Input<inputs.PortForwardForward>;
    /**
     * Specifies whether to enable syslog logging for forwarded traffic.
     */
    logging?: pulumi.Input<boolean>;
    /**
     * The name of the port forwarding rule.
     */
    name?: pulumi.Input<string>;
    /**
     * The protocol for the port forwarding rule. Can be `tcp`, `udp`, or `tcp_udp`.
     */
    protocol?: pulumi.Input<string>;
    /**
     * The name of the site to associate the port forwarding rule with.
     */
    site?: pulumi.Input<string>;
    /**
     * Source limiting configuration for the port forwarding rule.
     */
    sourceLimiting?: pulumi.Input<inputs.PortForwardSourceLimiting>;
    /**
     * WAN configuration for the port forwarding rule.
     */
    wan?: pulumi.Input<inputs.PortForwardWan>;
}
/**
 * The set of arguments for constructing a PortForward resource.
 */
export interface PortForwardArgs {
    /**
     * Specifies whether the port forwarding rule is enabled or not.
     *
     * @deprecated Deprecated
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Forward destination configuration.
     */
    forward?: pulumi.Input<inputs.PortForwardForward>;
    /**
     * Specifies whether to enable syslog logging for forwarded traffic.
     */
    logging?: pulumi.Input<boolean>;
    /**
     * The name of the port forwarding rule.
     */
    name?: pulumi.Input<string>;
    /**
     * The protocol for the port forwarding rule. Can be `tcp`, `udp`, or `tcp_udp`.
     */
    protocol?: pulumi.Input<string>;
    /**
     * The name of the site to associate the port forwarding rule with.
     */
    site?: pulumi.Input<string>;
    /**
     * Source limiting configuration for the port forwarding rule.
     */
    sourceLimiting?: pulumi.Input<inputs.PortForwardSourceLimiting>;
    /**
     * WAN configuration for the port forwarding rule.
     */
    wan?: pulumi.Input<inputs.PortForwardWan>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class PortProfile extends pulumi.CustomResource {
    /**
     * Get an existing PortProfile resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PortProfileState, opts?: pulumi.CustomResourceOptions): PortProfile;
    /**
     * Returns true if the given object is an instance of PortProfile.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PortProfile;
    /**
     * Enable link auto negotiation for the port profile. When set to `true` this overrides `speed`.
     */
    readonly autoneg: pulumi.Output<boolean>;
    /**
     * The type of 802.1X control to use. Can be `auto`, `force_authorized`, `force_unauthorized`, `mac_based` or `multi_host`.
     */
    readonly dot1xCtrl: pulumi.Output<string>;
    /**
     * The timeout, in seconds, to use when using the MAC Based 802.1X control. Can be between 0 and 65535
     */
    readonly dot1xIdleTimeout: pulumi.Output<number>;
    /**
     * The egress rate limit, in kpbs, for the port profile. Can be between `64` and `9999999`.
     */
    readonly egressRateLimitKbps: pulumi.Output<number | undefined>;
    /**
     * Enable egress rate limiting for the port profile.
     */
    readonly egressRateLimitKbpsEnabled: pulumi.Output<boolean>;
    /**
     * The type forwarding to use for the port profile. Can be `all`, `native`, `customize` or `disabled`.
     */
    readonly forward: pulumi.Output<string>;
    /**
     * Enable full duplex for the port profile.
     */
    readonly fullDuplex: pulumi.Output<boolean>;
    /**
     * Enable port isolation for the port profile.
     */
    readonly isolation: pulumi.Output<boolean>;
    /**
     * Enable LLDP-MED for the port profile.
     */
    readonly lldpmedEnabled: pulumi.Output<boolean>;
    /**
     * Enable LLDP-MED topology change notifications for the port profile.
     */
    readonly lldpmedNotifyEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The name of the port profile.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The ID of network to use as the main network on the port profile.
     */
    readonly nativeNetworkconfId: pulumi.Output<string | undefined>;
    /**
     * The operation mode for the port profile. Can only be `switch`
     */
    readonly opMode: pulumi.Output<string>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    readonly poeMode: pulumi.Output<string | undefined>;
    /**
     * Enable port security for the port profile.
     */
    readonly portSecurityEnabled: pulumi.Output<boolean>;
    /**
     * The MAC addresses associated with the port security for the port profile.
     */
    readonly portSecurityMacAddresses: pulumi.Output<string[] | undefined>;
    /**
     * The priority queue 1 level for the port profile. Can be between 0 and 100.
     */
    readonly priorityQueue1Level: pulumi.Output<number | undefined>;
    /**
     * The priority queue 2 level for the port profile. Can be between 0 and 100.
     */
    readonly priorityQueue2Level: pulumi.Output<number | undefined>;
    /**
     * The priority queue 3 level for the port profile. Can be between 0 and 100.
     */
    readonly priorityQueue3Level: pulumi.Output<number | undefined>;
    /**
     * The priority queue 4 level for the port profile. Can be between 0 and 100.
     */
    readonly priorityQueue4Level: pulumi.Output<number | undefined>;
    /**
     * The name of the site to associate the port profile with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The link speed to set for the port profile. Can be one of `10`, `100`, `1000`, `2500`, `5000`, `10000`, `20000`, `25000`, `40000`, `50000` or `100000`
     */
    readonly speed: pulumi.Output<number | undefined>;
    /**
     * Enable broadcast Storm Control for the port profile.
     */
    readonly stormctrlBcastEnabled: pulumi.Output<boolean>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    readonly stormctrlBcastLevel: pulumi.Output<number | undefined>;
    /**
     * The broadcast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    readonly stormctrlBcastRate: pulumi.Output<number | undefined>;
    /**
     * Enable multicast Storm Control for the port profile.
     */
    readonly stormctrlMcastEnabled: pulumi.Output<boolean>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    readonly stormctrlMcastLevel: pulumi.Output<number | undefined>;
    /**
     * The multicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    readonly stormctrlMcastRate: pulumi.Output<number | undefined>;
    /**
     * The type of Storm Control to use for the port profile. Can be `level` or `rate`.
     */
    readonly stormctrlType: pulumi.Output<string | undefined>;
    /**
     * Enable unknown unicast Storm Control for the port profile.
     */
    readonly stormctrlUcastEnabled: pulumi.Output<boolean>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    readonly stormctrlUcastLevel: pulumi.Output<number | undefined>;
    /**
     * The unknown unicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    readonly stormctrlUcastRate: pulumi.Output<number | undefined>;
    /**
     * Enable Spanning Tree Protocol (STP) for the port profile.
     */
    readonly stpPortMode: pulumi.Output<boolean | undefined>;
    /**
     * The IDs of networks to tag traffic with for the port profile.
     */
    readonly taggedNetworkconfIds: pulumi.Output<string[] | undefined>;
    /**
     * The ID of network to use for voice traffic for the port profile.
     */
    readonly voiceNetworkconfId: pulumi.Output<string | undefined>;
    /**
     * Create a PortProfile resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: PortProfileArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PortProfile resources.
 */
export interface PortProfileState {
    /**
     * Enable link auto negotiation for the port profile. When set to `true` this overrides `speed`.
     */
    autoneg?: pulumi.Input<boolean>;
    /**
     * The type of 802.1X control to use. Can be `auto`, `force_authorized`, `force_unauthorized`, `mac_based` or `multi_host`.
     */
    dot1xCtrl?: pulumi.Input<string>;
    /**
     * The timeout, in seconds, to use when using the MAC Based 802.1X control. Can be between 0 and 65535
     */
    dot1xIdleTimeout?: pulumi.Input<number>;
    /**
     * The egress rate limit, in kpbs, for the port profile. Can be between `64` and `9999999`.
     */
    egressRateLimitKbps?: pulumi.Input<number>;
    /**
     * Enable egress rate limiting for the port profile.
     */
    egressRateLimitKbpsEnabled?: pulumi.Input<boolean>;
    /**
     * The type forwarding to use for the port profile. Can be `all`, `native`, `customize` or `disabled`.
     */
    forward?: pulumi.Input<string>;
    /**
     * Enable full duplex for the port profile.
     */
    fullDuplex?: pulumi.Input<boolean>;
    /**
     * Enable port isolation for the port profile.
     */
    isolation?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED for the port profile.
     */
    lldpmedEnabled?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED topology change notifications for the port profile.
     */
    lldpmedNotifyEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the port profile.
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of network to use as the main network on the port profile.
     */
    nativeNetworkconfId?: pulumi.Input<string>;
    /**
     * The operation mode for the port profile. Can only be `switch`
     */
    opMode?: pulumi.Input<string>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Enable port security for the port profile.
     */
    portSecurityEnabled?: pulumi.Input<boolean>;
    /**
     * The MAC addresses associated with the port security for the port profile.
     */
    portSecurityMacAddresses?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The priority queue 1 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue1Level?: pulumi.Input<number>;
    /**
     * The priority queue 2 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue2Level?: pulumi.Input<number>;
    /**
     * The priority queue 3 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue3Level?: pulumi.Input<number>;
    /**
     * The priority queue 4 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue4Level?: pulumi.Input<number>;
    /**
     * The name of the site to associate the port profile with.
     */
    site?: pulumi.Input<string>;
    /**
     * The link speed to set for the port profile. Can be one of `10`, `100`, `1000`, `2500`, `5000`, `10000`, `20000`, `25000`, `40000`, `50000` or `100000`
     */
    speed?: pulumi.Input<number>;
    /**
     * Enable broadcast Storm Control for the port profile.
     */
    stormctrlBcastEnabled?: pulumi.Input<boolean>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlBcastLevel?: pulumi.Input<number>;
    /**
     * The broadcast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    stormctrlBcastRate?: pulumi.Input<number>;
    /**
     * Enable multicast Storm Control for the port profile.
     */
    stormctrlMcastEnabled?: pulumi.Input<boolean>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlMcastLevel?: pulumi.Input<number>;
    /**
     * The multicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    stormctrlMcastRate?: pulumi.Input<number>;
    /**
     * The type of Storm Control to use for the port profile. Can be `level` or `rate`.
     */
    stormctrlType?: pulumi.Input<string>;
    /**
     * Enable unknown unicast Storm Control for the port profile.
     */
    stormctrlUcastEnabled?: pulumi.Input<boolean>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlUcastLevel?: pulumi.Input<number>;
    /**
     * The unknown unicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    stormctrlUcastRate?: pulumi.Input<number>;
    /**
     * Enable Spanning Tree Protocol (STP) for the port profile.
     */
    stpPortMode?: pulumi.Input<boolean>;
    /**
     * The IDs of networks to tag traffic with for the port profile.
     */
    taggedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The ID of network to use for voice traffic for the port profile.
     */
    voiceNetworkconfId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PortProfile resource.
 */
export interface PortProfileArgs {
    /**
     * Enable link auto negotiation for the port profile. When set to `true` this overrides `speed`.
     */
    autoneg?: pulumi.Input<boolean>;
    /**
     * The type of 802.1X control to use. Can be `auto`, `force_authorized`, `force_unauthorized`, `mac_based` or `multi_host`.
     */
    dot1xCtrl?: pulumi.Input<string>;
    /**
     * The timeout, in seconds, to use when using the MAC Based 802.1X control. Can be between 0 and 65535
     */
    dot1xIdleTimeout?: pulumi.Input<number>;
    /**
     * The egress rate limit, in kpbs, for the port profile. Can be between `64` and `9999999`.
     */
    egressRateLimitKbps?: pulumi.Input<number>;
    /**
     * Enable egress rate limiting for the port profile.
     */
    egressRateLimitKbpsEnabled?: pulumi.Input<boolean>;
    /**
     * The type forwarding to use for the port profile. Can be `all`, `native`, `customize` or `disabled`.
     */
    forward?: pulumi.Input<string>;
    /**
     * Enable full duplex for the port profile.
     */
    fullDuplex?: pulumi.Input<boolean>;
    /**
     * Enable port isolation for the port profile.
     */
    isolation?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED for the port profile.
     */
    lldpmedEnabled?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED topology change notifications for the port profile.
     */
    lldpmedNotifyEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the port profile.
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of network to use as the main network on the port profile.
     */
    nativeNetworkconfId?: pulumi.Input<string>;
    /**
     * The operation mode for the port profile. Can only be `switch`
     */
    opMode?: pulumi.Input<string>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Enable port security for the port profile.
     */
    portSecurityEnabled?: pulumi.Input<boolean>;
    /**
     * The MAC addresses associated with the port security for the port profile.
     */
    portSecurityMacAddresses?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The priority queue 1 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue1Level?: pulumi.Input<number>;
    /**
     * The priority queue 2 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue2Level?: pulumi.Input<number>;
    /**
     * The priority queue 3 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue3Level?: pulumi.Input<number>;
    /**
     * The priority queue 4 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue4Level?: pulumi.Input<number>;
    /**
     * The name of the site to associate the port profile with.
     */
    site?: pulumi.Input<string>;
    /**
     * The link speed to set for the port profile. Can be one of `10`, `100`, `1000`, `2500`, `5000`, `10000`, `20000`, `25000`, `40000`, `50000` or `100000`
     */
    speed?: pulumi.Input<number>;
    /**
     * Enable broadcast Storm Control for the port profile.
     */
    stormctrlBcastEnabled?: pulumi.Input<boolean>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlBcastLevel?: pulumi.Input<number>;
    /**
     * The broadcast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    stormctrlBcastRate?: pulumi.Input<number>;
    /**
     * Enable multicast Storm Control for the port profile.
     */
    stormctrlMcastEnabled?: pulumi.Input<boolean>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlMcastLevel?: pulumi.Input<number>;
    /**
     * The multicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    stormctrlMcastRate?: pulumi.Input<number>;
    /**
     * The type of Storm Control to use for the port profile. Can be `level` or `rate`.
     */
    stormctrlType?: pulumi.Input<string>;
    /**
     * Enable unknown unicast Storm Control for the port profile.
     */
    stormctrlUcastEnabled?: pulumi.Input<boolean>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlUcastLevel?: pulumi.Input<number>;
    /**
     * The unknown unicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    stormctrlUcastRate?: pulumi.Input<number>;
    /**
     * Enable Spanning Tree Protocol (STP) for the port profile.
     */
    stpPortMode?: pulumi.Input<boolean>;
    /**
     * The IDs of networks to tag traffic with for the port profile.
     */
    taggedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The ID of network to use for voice traffic for the port profile.
     */
    voiceNetworkconfId?: pulumi.Input<string>;
}

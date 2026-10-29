import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * 802.1X port authentication settings for the port profile.
     */
    readonly dot1x: pulumi.Output<outputs.PortProfileDot1x>;
    /**
     * Egress rate limiting for the port profile. Computed from the controller when not set; disable with `enabled = false` rather than by removing the block.
     */
    readonly egressRateLimit: pulumi.Output<outputs.PortProfileEgressRateLimit>;
    /**
     * The IDs of networks excluded from the port profile (used when `tagged_vlan_mgmt` is `custom`). Computed from the controller when not set.
     */
    readonly excludedNetworkconfIds: pulumi.Output<string[]>;
    /**
     * Forward Error Correction mode. Can be `rs-fec`, `fc-fec`, `default`, or `disabled`.
     */
    readonly fecMode: pulumi.Output<string | undefined>;
    /**
     * The type forwarding to use for the port profile. Can be `all`, `native`, `customize` or `disabled`. `customize` requires a native network that carries a VLAN id: the controller silently stores `all` for a profile whose native network is untagged, which the provider rejects at plan time rather than letting the apply leave the resource tainted.
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
     * LLDP-MED settings for the port profile.
     */
    readonly lldpmed: pulumi.Output<outputs.PortProfileLldpmed>;
    /**
     * The IDs of networks designated as multicast routers for the port profile.
     */
    readonly multicastRouterNetworkconfIds: pulumi.Output<string[] | undefined>;
    /**
     * The name of the port profile.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The ID of network to use as the main (native/untagged) network on the port profile. Assigned by the controller if not set.
     */
    readonly nativeNetworkconfId: pulumi.Output<string>;
    /**
     * The operation mode for the port profile. Can only be `switch`
     */
    readonly opMode: pulumi.Output<string>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    readonly poeMode: pulumi.Output<string | undefined>;
    /**
     * Enable port keepalive for the port profile.
     */
    readonly portKeepaliveEnabled: pulumi.Output<boolean>;
    /**
     * Port security (MAC allow-list) settings for the port profile. Computed from the controller when not set; disable with `enabled = false` rather than by removing the block.
     */
    readonly portSecurity: pulumi.Output<outputs.PortProfilePortSecurity>;
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
     * Whether the port profile settings are managed automatically or manually. Can be `auto` or `manual`.
     */
    readonly settingPreference: pulumi.Output<string>;
    /**
     * The name of the site to associate the port profile with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The link speed to set for the port profile. Can be one of `10`, `100`, `1000`, `2500`, `5000`, `10000`, `20000`, `25000`, `40000`, `50000` or `100000`
     */
    readonly speed: pulumi.Output<number | undefined>;
    /**
     * Storm Control settings for the port profile. Computed from the controller when not set; disable a class with `enabled = false` rather than by removing the block.
     */
    readonly stormctrl: pulumi.Output<outputs.PortProfileStormctrl>;
    /**
     * Enable Spanning Tree Protocol (STP) for the port profile. Computed from the controller when not set.
     */
    readonly stpPortMode: pulumi.Output<boolean>;
    /**
     * The IDs of networks to tag traffic with for the port profile.
     */
    readonly taggedNetworkconfIds: pulumi.Output<string[] | undefined>;
    /**
     * How tagged VLANs are managed on the port. Can be `auto`, `block_all`, or `custom`.
     */
    readonly taggedVlanMgmt: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.PortProfileTimeouts | undefined>;
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
    autoneg?: pulumi.Input<boolean | undefined>;
    /**
     * 802.1X port authentication settings for the port profile.
     */
    dot1x?: pulumi.Input<inputs.PortProfileDot1x | undefined>;
    /**
     * Egress rate limiting for the port profile. Computed from the controller when not set; disable with `enabled = false` rather than by removing the block.
     */
    egressRateLimit?: pulumi.Input<inputs.PortProfileEgressRateLimit | undefined>;
    /**
     * The IDs of networks excluded from the port profile (used when `tagged_vlan_mgmt` is `custom`). Computed from the controller when not set.
     */
    excludedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Forward Error Correction mode. Can be `rs-fec`, `fc-fec`, `default`, or `disabled`.
     */
    fecMode?: pulumi.Input<string | undefined>;
    /**
     * The type forwarding to use for the port profile. Can be `all`, `native`, `customize` or `disabled`. `customize` requires a native network that carries a VLAN id: the controller silently stores `all` for a profile whose native network is untagged, which the provider rejects at plan time rather than letting the apply leave the resource tainted.
     */
    forward?: pulumi.Input<string | undefined>;
    /**
     * Enable full duplex for the port profile.
     */
    fullDuplex?: pulumi.Input<boolean | undefined>;
    /**
     * Enable port isolation for the port profile.
     */
    isolation?: pulumi.Input<boolean | undefined>;
    /**
     * LLDP-MED settings for the port profile.
     */
    lldpmed?: pulumi.Input<inputs.PortProfileLldpmed | undefined>;
    /**
     * The IDs of networks designated as multicast routers for the port profile.
     */
    multicastRouterNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The name of the port profile.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The ID of network to use as the main (native/untagged) network on the port profile. Assigned by the controller if not set.
     */
    nativeNetworkconfId?: pulumi.Input<string | undefined>;
    /**
     * The operation mode for the port profile. Can only be `switch`
     */
    opMode?: pulumi.Input<string | undefined>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    poeMode?: pulumi.Input<string | undefined>;
    /**
     * Enable port keepalive for the port profile.
     */
    portKeepaliveEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Port security (MAC allow-list) settings for the port profile. Computed from the controller when not set; disable with `enabled = false` rather than by removing the block.
     */
    portSecurity?: pulumi.Input<inputs.PortProfilePortSecurity | undefined>;
    /**
     * The priority queue 1 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue1Level?: pulumi.Input<number | undefined>;
    /**
     * The priority queue 2 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue2Level?: pulumi.Input<number | undefined>;
    /**
     * The priority queue 3 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue3Level?: pulumi.Input<number | undefined>;
    /**
     * The priority queue 4 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue4Level?: pulumi.Input<number | undefined>;
    /**
     * Whether the port profile settings are managed automatically or manually. Can be `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the port profile with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * The link speed to set for the port profile. Can be one of `10`, `100`, `1000`, `2500`, `5000`, `10000`, `20000`, `25000`, `40000`, `50000` or `100000`
     */
    speed?: pulumi.Input<number | undefined>;
    /**
     * Storm Control settings for the port profile. Computed from the controller when not set; disable a class with `enabled = false` rather than by removing the block.
     */
    stormctrl?: pulumi.Input<inputs.PortProfileStormctrl | undefined>;
    /**
     * Enable Spanning Tree Protocol (STP) for the port profile. Computed from the controller when not set.
     */
    stpPortMode?: pulumi.Input<boolean | undefined>;
    /**
     * The IDs of networks to tag traffic with for the port profile.
     */
    taggedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * How tagged VLANs are managed on the port. Can be `auto`, `block_all`, or `custom`.
     */
    taggedVlanMgmt?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.PortProfileTimeouts | undefined>;
    /**
     * The ID of network to use for voice traffic for the port profile.
     */
    voiceNetworkconfId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a PortProfile resource.
 */
export interface PortProfileArgs {
    /**
     * Enable link auto negotiation for the port profile. When set to `true` this overrides `speed`.
     */
    autoneg?: pulumi.Input<boolean | undefined>;
    /**
     * 802.1X port authentication settings for the port profile.
     */
    dot1x?: pulumi.Input<inputs.PortProfileDot1x | undefined>;
    /**
     * Egress rate limiting for the port profile. Computed from the controller when not set; disable with `enabled = false` rather than by removing the block.
     */
    egressRateLimit?: pulumi.Input<inputs.PortProfileEgressRateLimit | undefined>;
    /**
     * The IDs of networks excluded from the port profile (used when `tagged_vlan_mgmt` is `custom`). Computed from the controller when not set.
     */
    excludedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Forward Error Correction mode. Can be `rs-fec`, `fc-fec`, `default`, or `disabled`.
     */
    fecMode?: pulumi.Input<string | undefined>;
    /**
     * The type forwarding to use for the port profile. Can be `all`, `native`, `customize` or `disabled`. `customize` requires a native network that carries a VLAN id: the controller silently stores `all` for a profile whose native network is untagged, which the provider rejects at plan time rather than letting the apply leave the resource tainted.
     */
    forward?: pulumi.Input<string | undefined>;
    /**
     * Enable full duplex for the port profile.
     */
    fullDuplex?: pulumi.Input<boolean | undefined>;
    /**
     * Enable port isolation for the port profile.
     */
    isolation?: pulumi.Input<boolean | undefined>;
    /**
     * LLDP-MED settings for the port profile.
     */
    lldpmed?: pulumi.Input<inputs.PortProfileLldpmed | undefined>;
    /**
     * The IDs of networks designated as multicast routers for the port profile.
     */
    multicastRouterNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The name of the port profile.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The ID of network to use as the main (native/untagged) network on the port profile. Assigned by the controller if not set.
     */
    nativeNetworkconfId?: pulumi.Input<string | undefined>;
    /**
     * The operation mode for the port profile. Can only be `switch`
     */
    opMode?: pulumi.Input<string | undefined>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    poeMode?: pulumi.Input<string | undefined>;
    /**
     * Enable port keepalive for the port profile.
     */
    portKeepaliveEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Port security (MAC allow-list) settings for the port profile. Computed from the controller when not set; disable with `enabled = false` rather than by removing the block.
     */
    portSecurity?: pulumi.Input<inputs.PortProfilePortSecurity | undefined>;
    /**
     * The priority queue 1 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue1Level?: pulumi.Input<number | undefined>;
    /**
     * The priority queue 2 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue2Level?: pulumi.Input<number | undefined>;
    /**
     * The priority queue 3 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue3Level?: pulumi.Input<number | undefined>;
    /**
     * The priority queue 4 level for the port profile. Can be between 0 and 100.
     */
    priorityQueue4Level?: pulumi.Input<number | undefined>;
    /**
     * Whether the port profile settings are managed automatically or manually. Can be `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the port profile with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * The link speed to set for the port profile. Can be one of `10`, `100`, `1000`, `2500`, `5000`, `10000`, `20000`, `25000`, `40000`, `50000` or `100000`
     */
    speed?: pulumi.Input<number | undefined>;
    /**
     * Storm Control settings for the port profile. Computed from the controller when not set; disable a class with `enabled = false` rather than by removing the block.
     */
    stormctrl?: pulumi.Input<inputs.PortProfileStormctrl | undefined>;
    /**
     * Enable Spanning Tree Protocol (STP) for the port profile. Computed from the controller when not set.
     */
    stpPortMode?: pulumi.Input<boolean | undefined>;
    /**
     * The IDs of networks to tag traffic with for the port profile.
     */
    taggedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * How tagged VLANs are managed on the port. Can be `auto`, `block_all`, or `custom`.
     */
    taggedVlanMgmt?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.PortProfileTimeouts | undefined>;
    /**
     * The ID of network to use for voice traffic for the port profile.
     */
    voiceNetworkconfId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=portProfile.d.ts.map
import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class Wlan extends pulumi.CustomResource {
    /**
     * Get an existing Wlan resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: WlanState, opts?: pulumi.CustomResourceOptions): Wlan;
    /**
     * Returns true if the given object is an instance of Wlan.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Wlan;
    /**
     * List of AP group IDs to apply this WLAN to.
     */
    readonly apGroupIds: pulumi.Output<string[] | undefined>;
    /**
     * Access point group mode.
     */
    readonly apGroupMode: pulumi.Output<string>;
    /**
     * Improves client roaming by providing connection details of nearby APs.
     */
    readonly bssTransition: pulumi.Output<boolean>;
    /**
     * Enable or disable the WLAN.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * Enable fast roaming, aka 802.11r.
     */
    readonly fastRoamingEnabled: pulumi.Output<boolean>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    readonly hideSsid: pulumi.Output<boolean>;
    /**
     * Indicates that this is a guest WLAN and should use guest behaviors.
     */
    readonly isGuest: pulumi.Output<boolean>;
    /**
     * Isolates stations on layer 2 (ethernet) level.
     */
    readonly l2Isolation: pulumi.Output<boolean>;
    /**
     * MAC address filtering configuration.
     */
    readonly macFilter: pulumi.Output<outputs.WlanMacFilter>;
    /**
     * Minimum data rate for 2G clients in Kbps.
     */
    readonly minimumDataRate2gKbps: pulumi.Output<number>;
    /**
     * Minimum data rate for 5G clients in Kbps.
     */
    readonly minimumDataRate5gKbps: pulumi.Output<number>;
    /**
     * Minimum rate setting preference.
     */
    readonly minrateSettingPreference: pulumi.Output<string>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    readonly multicastEnhance: pulumi.Output<boolean>;
    /**
     * The SSID of the network.
     */
    readonly name: pulumi.Output<string>;
    /**
     * NAS identifier type for RADIUS.
     */
    readonly nasIdentifierType: pulumi.Output<string>;
    /**
     * ID of the network for this WLAN.
     */
    readonly networkId: pulumi.Output<string | undefined>;
    /**
     * Connect high performance clients to 5 GHz only.
     */
    readonly no2ghzOui: pulumi.Output<boolean>;
    /**
     * The passphrase for the network, this is only required if `security` is not set to `open`.
     */
    readonly passphrase: pulumi.Output<string | undefined>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3.
     */
    readonly pmfMode: pulumi.Output<string>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast.
     */
    readonly proxyArp: pulumi.Output<boolean>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`.
     */
    readonly radiusProfileId: pulumi.Output<string | undefined>;
    /**
     * Start and stop schedules for the WLAN
     */
    readonly schedules: pulumi.Output<outputs.WlanSchedule[] | undefined>;
    /**
     * The type of WiFi security for this network.
     */
    readonly security: pulumi.Output<string>;
    /**
     * The name of the site to associate the WLAN with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery.
     */
    readonly uapsd: pulumi.Output<boolean>;
    /**
     * ID of the user group to use for this network.
     */
    readonly userGroupId: pulumi.Output<string>;
    /**
     * VLAN ID.
     */
    readonly vlan: pulumi.Output<number | undefined>;
    /**
     * Enable VLAN tagging.
     */
    readonly vlanEnabled: pulumi.Output<boolean>;
    /**
     * WLAN band.
     */
    readonly wlanBand: pulumi.Output<string>;
    /**
     * List of WLAN bands.
     */
    readonly wlanBands: pulumi.Output<string[]>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    readonly wpa3Support: pulumi.Output<boolean>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    readonly wpa3Transition: pulumi.Output<boolean>;
    /**
     * Create a Wlan resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: WlanArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Wlan resources.
 */
export interface WlanState {
    /**
     * List of AP group IDs to apply this WLAN to.
     */
    apGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Access point group mode.
     */
    apGroupMode?: pulumi.Input<string>;
    /**
     * Improves client roaming by providing connection details of nearby APs.
     */
    bssTransition?: pulumi.Input<boolean>;
    /**
     * Enable or disable the WLAN.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Enable fast roaming, aka 802.11r.
     */
    fastRoamingEnabled?: pulumi.Input<boolean>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    hideSsid?: pulumi.Input<boolean>;
    /**
     * Indicates that this is a guest WLAN and should use guest behaviors.
     */
    isGuest?: pulumi.Input<boolean>;
    /**
     * Isolates stations on layer 2 (ethernet) level.
     */
    l2Isolation?: pulumi.Input<boolean>;
    /**
     * MAC address filtering configuration.
     */
    macFilter?: pulumi.Input<inputs.WlanMacFilter>;
    /**
     * Minimum data rate for 2G clients in Kbps.
     */
    minimumDataRate2gKbps?: pulumi.Input<number>;
    /**
     * Minimum data rate for 5G clients in Kbps.
     */
    minimumDataRate5gKbps?: pulumi.Input<number>;
    /**
     * Minimum rate setting preference.
     */
    minrateSettingPreference?: pulumi.Input<string>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    multicastEnhance?: pulumi.Input<boolean>;
    /**
     * The SSID of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * NAS identifier type for RADIUS.
     */
    nasIdentifierType?: pulumi.Input<string>;
    /**
     * ID of the network for this WLAN.
     */
    networkId?: pulumi.Input<string>;
    /**
     * Connect high performance clients to 5 GHz only.
     */
    no2ghzOui?: pulumi.Input<boolean>;
    /**
     * The passphrase for the network, this is only required if `security` is not set to `open`.
     */
    passphrase?: pulumi.Input<string>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3.
     */
    pmfMode?: pulumi.Input<string>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast.
     */
    proxyArp?: pulumi.Input<boolean>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`.
     */
    radiusProfileId?: pulumi.Input<string>;
    /**
     * Start and stop schedules for the WLAN
     */
    schedules?: pulumi.Input<pulumi.Input<inputs.WlanSchedule>[]>;
    /**
     * The type of WiFi security for this network.
     */
    security?: pulumi.Input<string>;
    /**
     * The name of the site to associate the WLAN with.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery.
     */
    uapsd?: pulumi.Input<boolean>;
    /**
     * ID of the user group to use for this network.
     */
    userGroupId?: pulumi.Input<string>;
    /**
     * VLAN ID.
     */
    vlan?: pulumi.Input<number>;
    /**
     * Enable VLAN tagging.
     */
    vlanEnabled?: pulumi.Input<boolean>;
    /**
     * WLAN band.
     */
    wlanBand?: pulumi.Input<string>;
    /**
     * List of WLAN bands.
     */
    wlanBands?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    wpa3Support?: pulumi.Input<boolean>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    wpa3Transition?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a Wlan resource.
 */
export interface WlanArgs {
    /**
     * List of AP group IDs to apply this WLAN to.
     */
    apGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Access point group mode.
     */
    apGroupMode?: pulumi.Input<string>;
    /**
     * Improves client roaming by providing connection details of nearby APs.
     */
    bssTransition?: pulumi.Input<boolean>;
    /**
     * Enable or disable the WLAN.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Enable fast roaming, aka 802.11r.
     */
    fastRoamingEnabled?: pulumi.Input<boolean>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    hideSsid?: pulumi.Input<boolean>;
    /**
     * Indicates that this is a guest WLAN and should use guest behaviors.
     */
    isGuest?: pulumi.Input<boolean>;
    /**
     * Isolates stations on layer 2 (ethernet) level.
     */
    l2Isolation?: pulumi.Input<boolean>;
    /**
     * MAC address filtering configuration.
     */
    macFilter?: pulumi.Input<inputs.WlanMacFilter>;
    /**
     * Minimum data rate for 2G clients in Kbps.
     */
    minimumDataRate2gKbps?: pulumi.Input<number>;
    /**
     * Minimum data rate for 5G clients in Kbps.
     */
    minimumDataRate5gKbps?: pulumi.Input<number>;
    /**
     * Minimum rate setting preference.
     */
    minrateSettingPreference?: pulumi.Input<string>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    multicastEnhance?: pulumi.Input<boolean>;
    /**
     * The SSID of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * NAS identifier type for RADIUS.
     */
    nasIdentifierType?: pulumi.Input<string>;
    /**
     * ID of the network for this WLAN.
     */
    networkId?: pulumi.Input<string>;
    /**
     * Connect high performance clients to 5 GHz only.
     */
    no2ghzOui?: pulumi.Input<boolean>;
    /**
     * The passphrase for the network, this is only required if `security` is not set to `open`.
     */
    passphrase?: pulumi.Input<string>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3.
     */
    pmfMode?: pulumi.Input<string>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast.
     */
    proxyArp?: pulumi.Input<boolean>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`.
     */
    radiusProfileId?: pulumi.Input<string>;
    /**
     * Start and stop schedules for the WLAN
     */
    schedules?: pulumi.Input<pulumi.Input<inputs.WlanSchedule>[]>;
    /**
     * The type of WiFi security for this network.
     */
    security: pulumi.Input<string>;
    /**
     * The name of the site to associate the WLAN with.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery.
     */
    uapsd?: pulumi.Input<boolean>;
    /**
     * ID of the user group to use for this network.
     */
    userGroupId: pulumi.Input<string>;
    /**
     * VLAN ID.
     */
    vlan?: pulumi.Input<number>;
    /**
     * Enable VLAN tagging.
     */
    vlanEnabled?: pulumi.Input<boolean>;
    /**
     * WLAN band.
     */
    wlanBand?: pulumi.Input<string>;
    /**
     * List of WLAN bands.
     */
    wlanBands?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    wpa3Support?: pulumi.Input<boolean>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    wpa3Transition?: pulumi.Input<boolean>;
}

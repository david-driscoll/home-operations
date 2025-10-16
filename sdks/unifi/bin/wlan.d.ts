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
     * IDs of the AP groups to use for this network.
     */
    readonly apGroupIds: pulumi.Output<string[] | undefined>;
    /**
     * Improves client transitions between APs when they have a weak signal. Defaults to `true`.
     */
    readonly bssTransition: pulumi.Output<boolean | undefined>;
    /**
     * Enables 802.11r fast roaming. Defaults to `false`.
     */
    readonly fastRoamingEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    readonly hideSsid: pulumi.Output<boolean | undefined>;
    /**
     * Indicates that this is a guest WLAN and should use guest behaviors.
     */
    readonly isGuest: pulumi.Output<boolean | undefined>;
    /**
     * Isolates stations on layer 2 (ethernet) level. Defaults to `false`.
     */
    readonly l2Isolation: pulumi.Output<boolean | undefined>;
    /**
     * Indicates whether or not the MAC filter is turned of for the network.
     */
    readonly macFilterEnabled: pulumi.Output<boolean | undefined>;
    /**
     * List of MAC addresses to filter (only valid if `mac_filter_enabled` is `true`).
     */
    readonly macFilterLists: pulumi.Output<string[] | undefined>;
    /**
     * MAC address filter policy (only valid if `mac_filter_enabled` is `true`). Defaults to `deny`.
     */
    readonly macFilterPolicy: pulumi.Output<string | undefined>;
    /**
     * Set minimum data rate control for 2G devices, in Kbps. Use `0` to disable minimum data rates. Valid values are: `1000`, `2000`, `5500`, `6000`, `9000`, `11000`, `12000`, `18000`, `24000`, `36000`, `48000`,  and `54000`.
     */
    readonly minimumDataRate2gKbps: pulumi.Output<number | undefined>;
    /**
     * Set minimum data rate control for 5G devices, in Kbps. Use `0` to disable minimum data rates. Valid values are: `6000`, `9000`, `12000`, `18000`, `24000`, `36000`, `48000`,  and `54000`.
     */
    readonly minimumDataRate5gKbps: pulumi.Output<number | undefined>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    readonly multicastEnhance: pulumi.Output<boolean | undefined>;
    /**
     * The SSID of the network.
     */
    readonly name: pulumi.Output<string>;
    /**
     * ID of the network for this SSID
     */
    readonly networkId: pulumi.Output<string | undefined>;
    /**
     * Connect high performance clients to 5 GHz only. Defaults to `true`.
     */
    readonly no2ghzOui: pulumi.Output<boolean | undefined>;
    /**
     * The passphrase for the network, this is only required if `security` is not set to `open`.
     */
    readonly passphrase: pulumi.Output<string | undefined>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3. Valid values are `required`, `optional` and `disabled`. Defaults to `disabled`.
     */
    readonly pmfMode: pulumi.Output<string | undefined>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast. Defaults to `false`.
     */
    readonly proxyArp: pulumi.Output<boolean | undefined>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. You can query this via the `unifi.RadiusProfile` data source.
     */
    readonly radiusProfileId: pulumi.Output<string | undefined>;
    /**
     * Start and stop schedules for the WLAN
     */
    readonly schedules: pulumi.Output<outputs.WlanSchedule[] | undefined>;
    /**
     * The type of WiFi security for this network. Valid values are: `wpapsk`, `wpaeap`, and `open`.
     */
    readonly security: pulumi.Output<string>;
    /**
     * The name of the site to associate the wlan with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery. Defaults to `false`.
     */
    readonly uapsd: pulumi.Output<boolean | undefined>;
    /**
     * ID of the user group to use for this network.
     */
    readonly userGroupId: pulumi.Output<string>;
    /**
     * Radio band your WiFi network will use. Defaults to `both`.
     */
    readonly wlanBand: pulumi.Output<string | undefined>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    readonly wpa3Support: pulumi.Output<boolean | undefined>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    readonly wpa3Transition: pulumi.Output<boolean | undefined>;
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
     * IDs of the AP groups to use for this network.
     */
    apGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Improves client transitions between APs when they have a weak signal. Defaults to `true`.
     */
    bssTransition?: pulumi.Input<boolean>;
    /**
     * Enables 802.11r fast roaming. Defaults to `false`.
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
     * Isolates stations on layer 2 (ethernet) level. Defaults to `false`.
     */
    l2Isolation?: pulumi.Input<boolean>;
    /**
     * Indicates whether or not the MAC filter is turned of for the network.
     */
    macFilterEnabled?: pulumi.Input<boolean>;
    /**
     * List of MAC addresses to filter (only valid if `mac_filter_enabled` is `true`).
     */
    macFilterLists?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * MAC address filter policy (only valid if `mac_filter_enabled` is `true`). Defaults to `deny`.
     */
    macFilterPolicy?: pulumi.Input<string>;
    /**
     * Set minimum data rate control for 2G devices, in Kbps. Use `0` to disable minimum data rates. Valid values are: `1000`, `2000`, `5500`, `6000`, `9000`, `11000`, `12000`, `18000`, `24000`, `36000`, `48000`,  and `54000`.
     */
    minimumDataRate2gKbps?: pulumi.Input<number>;
    /**
     * Set minimum data rate control for 5G devices, in Kbps. Use `0` to disable minimum data rates. Valid values are: `6000`, `9000`, `12000`, `18000`, `24000`, `36000`, `48000`,  and `54000`.
     */
    minimumDataRate5gKbps?: pulumi.Input<number>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    multicastEnhance?: pulumi.Input<boolean>;
    /**
     * The SSID of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * ID of the network for this SSID
     */
    networkId?: pulumi.Input<string>;
    /**
     * Connect high performance clients to 5 GHz only. Defaults to `true`.
     */
    no2ghzOui?: pulumi.Input<boolean>;
    /**
     * The passphrase for the network, this is only required if `security` is not set to `open`.
     */
    passphrase?: pulumi.Input<string>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3. Valid values are `required`, `optional` and `disabled`. Defaults to `disabled`.
     */
    pmfMode?: pulumi.Input<string>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast. Defaults to `false`.
     */
    proxyArp?: pulumi.Input<boolean>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. You can query this via the `unifi.RadiusProfile` data source.
     */
    radiusProfileId?: pulumi.Input<string>;
    /**
     * Start and stop schedules for the WLAN
     */
    schedules?: pulumi.Input<pulumi.Input<inputs.WlanSchedule>[]>;
    /**
     * The type of WiFi security for this network. Valid values are: `wpapsk`, `wpaeap`, and `open`.
     */
    security?: pulumi.Input<string>;
    /**
     * The name of the site to associate the wlan with.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery. Defaults to `false`.
     */
    uapsd?: pulumi.Input<boolean>;
    /**
     * ID of the user group to use for this network.
     */
    userGroupId?: pulumi.Input<string>;
    /**
     * Radio band your WiFi network will use. Defaults to `both`.
     */
    wlanBand?: pulumi.Input<string>;
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
     * IDs of the AP groups to use for this network.
     */
    apGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Improves client transitions between APs when they have a weak signal. Defaults to `true`.
     */
    bssTransition?: pulumi.Input<boolean>;
    /**
     * Enables 802.11r fast roaming. Defaults to `false`.
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
     * Isolates stations on layer 2 (ethernet) level. Defaults to `false`.
     */
    l2Isolation?: pulumi.Input<boolean>;
    /**
     * Indicates whether or not the MAC filter is turned of for the network.
     */
    macFilterEnabled?: pulumi.Input<boolean>;
    /**
     * List of MAC addresses to filter (only valid if `mac_filter_enabled` is `true`).
     */
    macFilterLists?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * MAC address filter policy (only valid if `mac_filter_enabled` is `true`). Defaults to `deny`.
     */
    macFilterPolicy?: pulumi.Input<string>;
    /**
     * Set minimum data rate control for 2G devices, in Kbps. Use `0` to disable minimum data rates. Valid values are: `1000`, `2000`, `5500`, `6000`, `9000`, `11000`, `12000`, `18000`, `24000`, `36000`, `48000`,  and `54000`.
     */
    minimumDataRate2gKbps?: pulumi.Input<number>;
    /**
     * Set minimum data rate control for 5G devices, in Kbps. Use `0` to disable minimum data rates. Valid values are: `6000`, `9000`, `12000`, `18000`, `24000`, `36000`, `48000`,  and `54000`.
     */
    minimumDataRate5gKbps?: pulumi.Input<number>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    multicastEnhance?: pulumi.Input<boolean>;
    /**
     * The SSID of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * ID of the network for this SSID
     */
    networkId?: pulumi.Input<string>;
    /**
     * Connect high performance clients to 5 GHz only. Defaults to `true`.
     */
    no2ghzOui?: pulumi.Input<boolean>;
    /**
     * The passphrase for the network, this is only required if `security` is not set to `open`.
     */
    passphrase?: pulumi.Input<string>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3. Valid values are `required`, `optional` and `disabled`. Defaults to `disabled`.
     */
    pmfMode?: pulumi.Input<string>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast. Defaults to `false`.
     */
    proxyArp?: pulumi.Input<boolean>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. You can query this via the `unifi.RadiusProfile` data source.
     */
    radiusProfileId?: pulumi.Input<string>;
    /**
     * Start and stop schedules for the WLAN
     */
    schedules?: pulumi.Input<pulumi.Input<inputs.WlanSchedule>[]>;
    /**
     * The type of WiFi security for this network. Valid values are: `wpapsk`, `wpaeap`, and `open`.
     */
    security: pulumi.Input<string>;
    /**
     * The name of the site to associate the wlan with.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery. Defaults to `false`.
     */
    uapsd?: pulumi.Input<boolean>;
    /**
     * ID of the user group to use for this network.
     */
    userGroupId: pulumi.Input<string>;
    /**
     * Radio band your WiFi network will use. Defaults to `both`.
     */
    wlanBand?: pulumi.Input<string>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    wpa3Support?: pulumi.Input<boolean>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    wpa3Transition?: pulumi.Input<boolean>;
}

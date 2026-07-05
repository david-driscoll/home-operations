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
     * List of MAC addresses for the broadcast filter. The controller may populate this on its own, so it is computed when unset.
     */
    readonly bcFilterLists: pulumi.Output<string[]>;
    /**
     * Improves client roaming by providing connection details of nearby APs.
     */
    readonly bssTransition: pulumi.Output<boolean>;
    /**
     * DTIM period for the 6 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    readonly dtim6e: pulumi.Output<number>;
    /**
     * DTIM mode. Can be one of `default` or `custom`. Use `custom` together with `dtim_ng`/`dtim_na`/`dtim_6e`.
     */
    readonly dtimMode: pulumi.Output<string>;
    /**
     * DTIM period for the 5 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    readonly dtimNa: pulumi.Output<number>;
    /**
     * DTIM period for the 2.4 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    readonly dtimNg: pulumi.Output<number>;
    /**
     * Enable or disable the WLAN.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * Enable enhanced IoT connectivity. When `true`, the controller forces `iapp_enabled = true`, `wpa3_support = false`, `wpa3_transition = false`, `pmf_mode = "disabled"` and `dtim_ng = 1`; the provider pins those fields to match, so any conflicting values you set for them are ignored (this disables WPA3 on the SSID).
     */
    readonly enhancedIot: pulumi.Output<boolean>;
    /**
     * Enable fast roaming, aka 802.11r.
     */
    readonly fastRoamingEnabled: pulumi.Output<boolean>;
    /**
     * Group rekey interval in seconds (0 to disable).
     */
    readonly groupRekey: pulumi.Output<number>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    readonly hideSsid: pulumi.Output<boolean>;
    /**
     * Enable Hotspot 2.0 configuration.
     */
    readonly hotspot2confEnabled: pulumi.Output<boolean>;
    /**
     * Enable Inter-Access Point Protocol (802.11f) for faster roaming. Computed from the controller when not set.
     */
    readonly iappEnabled: pulumi.Output<boolean>;
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
     * Minimum data rate for 2G clients in Kbps. When unset, the controller assigns a value (e.g. `1000` in `auto` mode), so this is computed rather than defaulted to `0`.
     */
    readonly minimumDataRate2gKbps: pulumi.Output<number>;
    /**
     * Minimum data rate for 5G clients in Kbps. When unset, the controller assigns a value (e.g. `6000` in `auto` mode), so this is computed rather than defaulted to `0`.
     */
    readonly minimumDataRate5gKbps: pulumi.Output<number>;
    /**
     * Minimum rate setting preference.
     */
    readonly minrateSettingPreference: pulumi.Output<string>;
    /**
     * Enable Multi-Link Operation (6 GHz).
     */
    readonly mloEnabled: pulumi.Output<boolean>;
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
     * The passphrase for the network, only required if `security` is not `open`. Stored in state — use `passphrase_wo` to avoid persisting the secret.
     */
    readonly passphrase: pulumi.Output<string | undefined>;
    readonly passphraseWo: pulumi.Output<string | undefined>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3.
     */
    readonly pmfMode: pulumi.Output<string>;
    /**
     * Private pre-shared keys (PPSK): a list of per-key passphrases, each optionally bound to its own network/VLAN. Only valid when `private_preshared_keys_enabled` is `true`.
     */
    readonly privatePresharedKeys: pulumi.Output<outputs.WlanPrivatePresharedKey[] | undefined>;
    /**
     * Whether per-key (PPSK) passphrases are enabled for this WLAN. Requires `security = wpapsk`.
     */
    readonly privatePresharedKeysEnabled: pulumi.Output<boolean>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast.
     */
    readonly proxyArp: pulumi.Output<boolean>;
    /**
     * Enable RADIUS MAC authentication.
     */
    readonly radiusMacAuthEnabled: pulumi.Output<boolean>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. The controller may assign a default profile, so this is computed when unset.
     */
    readonly radiusProfileId: pulumi.Output<string>;
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
    readonly timeouts: pulumi.Output<outputs.WlanTimeouts | undefined>;
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
     * Enable WPA3 Enterprise 192-bit mode.
     */
    readonly wpa3Enhanced192: pulumi.Output<boolean>;
    /**
     * Enable WPA3 fast roaming (802.11r).
     */
    readonly wpa3FastRoaming: pulumi.Output<boolean>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    readonly wpa3Support: pulumi.Output<boolean>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    readonly wpa3Transition: pulumi.Output<boolean>;
    /**
     * WPA encryption. Can be one of `auto`, `ccmp`, `gcmp`, `ccmp-256`, or `gcmp-256`.
     */
    readonly wpaEnc: pulumi.Output<string>;
    /**
     * WPA mode. Can be one of `auto`, `wpa1`, or `wpa2`.
     */
    readonly wpaMode: pulumi.Output<string>;
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
    apGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Access point group mode.
     */
    apGroupMode?: pulumi.Input<string | undefined>;
    /**
     * List of MAC addresses for the broadcast filter. The controller may populate this on its own, so it is computed when unset.
     */
    bcFilterLists?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Improves client roaming by providing connection details of nearby APs.
     */
    bssTransition?: pulumi.Input<boolean | undefined>;
    /**
     * DTIM period for the 6 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    dtim6e?: pulumi.Input<number | undefined>;
    /**
     * DTIM mode. Can be one of `default` or `custom`. Use `custom` together with `dtim_ng`/`dtim_na`/`dtim_6e`.
     */
    dtimMode?: pulumi.Input<string | undefined>;
    /**
     * DTIM period for the 5 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    dtimNa?: pulumi.Input<number | undefined>;
    /**
     * DTIM period for the 2.4 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    dtimNg?: pulumi.Input<number | undefined>;
    /**
     * Enable or disable the WLAN.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable enhanced IoT connectivity. When `true`, the controller forces `iapp_enabled = true`, `wpa3_support = false`, `wpa3_transition = false`, `pmf_mode = "disabled"` and `dtim_ng = 1`; the provider pins those fields to match, so any conflicting values you set for them are ignored (this disables WPA3 on the SSID).
     */
    enhancedIot?: pulumi.Input<boolean | undefined>;
    /**
     * Enable fast roaming, aka 802.11r.
     */
    fastRoamingEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Group rekey interval in seconds (0 to disable).
     */
    groupRekey?: pulumi.Input<number | undefined>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    hideSsid?: pulumi.Input<boolean | undefined>;
    /**
     * Enable Hotspot 2.0 configuration.
     */
    hotspot2confEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable Inter-Access Point Protocol (802.11f) for faster roaming. Computed from the controller when not set.
     */
    iappEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Indicates that this is a guest WLAN and should use guest behaviors.
     */
    isGuest?: pulumi.Input<boolean | undefined>;
    /**
     * Isolates stations on layer 2 (ethernet) level.
     */
    l2Isolation?: pulumi.Input<boolean | undefined>;
    /**
     * MAC address filtering configuration.
     */
    macFilter?: pulumi.Input<inputs.WlanMacFilter | undefined>;
    /**
     * Minimum data rate for 2G clients in Kbps. When unset, the controller assigns a value (e.g. `1000` in `auto` mode), so this is computed rather than defaulted to `0`.
     */
    minimumDataRate2gKbps?: pulumi.Input<number | undefined>;
    /**
     * Minimum data rate for 5G clients in Kbps. When unset, the controller assigns a value (e.g. `6000` in `auto` mode), so this is computed rather than defaulted to `0`.
     */
    minimumDataRate5gKbps?: pulumi.Input<number | undefined>;
    /**
     * Minimum rate setting preference.
     */
    minrateSettingPreference?: pulumi.Input<string | undefined>;
    /**
     * Enable Multi-Link Operation (6 GHz).
     */
    mloEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    multicastEnhance?: pulumi.Input<boolean | undefined>;
    /**
     * The SSID of the network.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * NAS identifier type for RADIUS.
     */
    nasIdentifierType?: pulumi.Input<string | undefined>;
    /**
     * ID of the network for this WLAN.
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * Connect high performance clients to 5 GHz only.
     */
    no2ghzOui?: pulumi.Input<boolean | undefined>;
    /**
     * The passphrase for the network, only required if `security` is not `open`. Stored in state — use `passphrase_wo` to avoid persisting the secret.
     */
    passphrase?: pulumi.Input<string | undefined>;
    passphraseWo?: pulumi.Input<string | undefined>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3.
     */
    pmfMode?: pulumi.Input<string | undefined>;
    /**
     * Private pre-shared keys (PPSK): a list of per-key passphrases, each optionally bound to its own network/VLAN. Only valid when `private_preshared_keys_enabled` is `true`.
     */
    privatePresharedKeys?: pulumi.Input<pulumi.Input<inputs.WlanPrivatePresharedKey>[] | undefined>;
    /**
     * Whether per-key (PPSK) passphrases are enabled for this WLAN. Requires `security = wpapsk`.
     */
    privatePresharedKeysEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast.
     */
    proxyArp?: pulumi.Input<boolean | undefined>;
    /**
     * Enable RADIUS MAC authentication.
     */
    radiusMacAuthEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. The controller may assign a default profile, so this is computed when unset.
     */
    radiusProfileId?: pulumi.Input<string | undefined>;
    /**
     * Start and stop schedules for the WLAN
     */
    schedules?: pulumi.Input<pulumi.Input<inputs.WlanSchedule>[] | undefined>;
    /**
     * The type of WiFi security for this network.
     */
    security?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the WLAN with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.WlanTimeouts | undefined>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery.
     */
    uapsd?: pulumi.Input<boolean | undefined>;
    /**
     * ID of the user group to use for this network.
     */
    userGroupId?: pulumi.Input<string | undefined>;
    /**
     * VLAN ID.
     */
    vlan?: pulumi.Input<number | undefined>;
    /**
     * Enable VLAN tagging.
     */
    vlanEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * WLAN band.
     */
    wlanBand?: pulumi.Input<string | undefined>;
    /**
     * List of WLAN bands.
     */
    wlanBands?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Enable WPA3 Enterprise 192-bit mode.
     */
    wpa3Enhanced192?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA3 fast roaming (802.11r).
     */
    wpa3FastRoaming?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    wpa3Support?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    wpa3Transition?: pulumi.Input<boolean | undefined>;
    /**
     * WPA encryption. Can be one of `auto`, `ccmp`, `gcmp`, `ccmp-256`, or `gcmp-256`.
     */
    wpaEnc?: pulumi.Input<string | undefined>;
    /**
     * WPA mode. Can be one of `auto`, `wpa1`, or `wpa2`.
     */
    wpaMode?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a Wlan resource.
 */
export interface WlanArgs {
    /**
     * List of AP group IDs to apply this WLAN to.
     */
    apGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Access point group mode.
     */
    apGroupMode?: pulumi.Input<string | undefined>;
    /**
     * List of MAC addresses for the broadcast filter. The controller may populate this on its own, so it is computed when unset.
     */
    bcFilterLists?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Improves client roaming by providing connection details of nearby APs.
     */
    bssTransition?: pulumi.Input<boolean | undefined>;
    /**
     * DTIM period for the 6 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    dtim6e?: pulumi.Input<number | undefined>;
    /**
     * DTIM mode. Can be one of `default` or `custom`. Use `custom` together with `dtim_ng`/`dtim_na`/`dtim_6e`.
     */
    dtimMode?: pulumi.Input<string | undefined>;
    /**
     * DTIM period for the 5 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    dtimNa?: pulumi.Input<number | undefined>;
    /**
     * DTIM period for the 2.4 GHz band (1-255). Only used when `dtim_mode` is `custom`. Computed from the controller when not set.
     */
    dtimNg?: pulumi.Input<number | undefined>;
    /**
     * Enable or disable the WLAN.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable enhanced IoT connectivity. When `true`, the controller forces `iapp_enabled = true`, `wpa3_support = false`, `wpa3_transition = false`, `pmf_mode = "disabled"` and `dtim_ng = 1`; the provider pins those fields to match, so any conflicting values you set for them are ignored (this disables WPA3 on the SSID).
     */
    enhancedIot?: pulumi.Input<boolean | undefined>;
    /**
     * Enable fast roaming, aka 802.11r.
     */
    fastRoamingEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Group rekey interval in seconds (0 to disable).
     */
    groupRekey?: pulumi.Input<number | undefined>;
    /**
     * Indicates whether or not to hide the SSID from broadcast.
     */
    hideSsid?: pulumi.Input<boolean | undefined>;
    /**
     * Enable Hotspot 2.0 configuration.
     */
    hotspot2confEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable Inter-Access Point Protocol (802.11f) for faster roaming. Computed from the controller when not set.
     */
    iappEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Indicates that this is a guest WLAN and should use guest behaviors.
     */
    isGuest?: pulumi.Input<boolean | undefined>;
    /**
     * Isolates stations on layer 2 (ethernet) level.
     */
    l2Isolation?: pulumi.Input<boolean | undefined>;
    /**
     * MAC address filtering configuration.
     */
    macFilter?: pulumi.Input<inputs.WlanMacFilter | undefined>;
    /**
     * Minimum data rate for 2G clients in Kbps. When unset, the controller assigns a value (e.g. `1000` in `auto` mode), so this is computed rather than defaulted to `0`.
     */
    minimumDataRate2gKbps?: pulumi.Input<number | undefined>;
    /**
     * Minimum data rate for 5G clients in Kbps. When unset, the controller assigns a value (e.g. `6000` in `auto` mode), so this is computed rather than defaulted to `0`.
     */
    minimumDataRate5gKbps?: pulumi.Input<number | undefined>;
    /**
     * Minimum rate setting preference.
     */
    minrateSettingPreference?: pulumi.Input<string | undefined>;
    /**
     * Enable Multi-Link Operation (6 GHz).
     */
    mloEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Indicates whether or not Multicast Enhance is turned of for the network.
     */
    multicastEnhance?: pulumi.Input<boolean | undefined>;
    /**
     * The SSID of the network.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * NAS identifier type for RADIUS.
     */
    nasIdentifierType?: pulumi.Input<string | undefined>;
    /**
     * ID of the network for this WLAN.
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * Connect high performance clients to 5 GHz only.
     */
    no2ghzOui?: pulumi.Input<boolean | undefined>;
    /**
     * The passphrase for the network, only required if `security` is not `open`. Stored in state — use `passphrase_wo` to avoid persisting the secret.
     */
    passphrase?: pulumi.Input<string | undefined>;
    passphraseWo?: pulumi.Input<string | undefined>;
    /**
     * Enable Protected Management Frames. This cannot be disabled if using WPA 3.
     */
    pmfMode?: pulumi.Input<string | undefined>;
    /**
     * Private pre-shared keys (PPSK): a list of per-key passphrases, each optionally bound to its own network/VLAN. Only valid when `private_preshared_keys_enabled` is `true`.
     */
    privatePresharedKeys?: pulumi.Input<pulumi.Input<inputs.WlanPrivatePresharedKey>[] | undefined>;
    /**
     * Whether per-key (PPSK) passphrases are enabled for this WLAN. Requires `security = wpapsk`.
     */
    privatePresharedKeysEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Reduces airtime usage by allowing APs to "proxy" common broadcast frames as unicast.
     */
    proxyArp?: pulumi.Input<boolean | undefined>;
    /**
     * Enable RADIUS MAC authentication.
     */
    radiusMacAuthEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. The controller may assign a default profile, so this is computed when unset.
     */
    radiusProfileId?: pulumi.Input<string | undefined>;
    /**
     * Start and stop schedules for the WLAN
     */
    schedules?: pulumi.Input<pulumi.Input<inputs.WlanSchedule>[] | undefined>;
    /**
     * The type of WiFi security for this network.
     */
    security: pulumi.Input<string>;
    /**
     * The name of the site to associate the WLAN with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.WlanTimeouts | undefined>;
    /**
     * Enable Unscheduled Automatic Power Save Delivery.
     */
    uapsd?: pulumi.Input<boolean | undefined>;
    /**
     * ID of the user group to use for this network.
     */
    userGroupId: pulumi.Input<string>;
    /**
     * VLAN ID.
     */
    vlan?: pulumi.Input<number | undefined>;
    /**
     * Enable VLAN tagging.
     */
    vlanEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * WLAN band.
     */
    wlanBand?: pulumi.Input<string | undefined>;
    /**
     * List of WLAN bands.
     */
    wlanBands?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Enable WPA3 Enterprise 192-bit mode.
     */
    wpa3Enhanced192?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA3 fast roaming (802.11r).
     */
    wpa3FastRoaming?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    wpa3Support?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3_support` must be true).
     */
    wpa3Transition?: pulumi.Input<boolean | undefined>;
    /**
     * WPA encryption. Can be one of `auto`, `ccmp`, `gcmp`, `ccmp-256`, or `gcmp-256`.
     */
    wpaEnc?: pulumi.Input<string | undefined>;
    /**
     * WPA mode. Can be one of `auto`, `wpa1`, or `wpa2`.
     */
    wpaMode?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=wlan.d.ts.map
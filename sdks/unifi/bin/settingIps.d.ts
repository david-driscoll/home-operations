import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class SettingIps extends pulumi.CustomResource {
    /**
     * Get an existing SettingIps resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingIpsState, opts?: pulumi.CustomResourceOptions): SettingIps;
    /**
     * Returns true if the given object is an instance of SettingIps.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingIps;
    /**
     * List of network IDs to enable ad blocking for. If any networks are configured, ad blocking will be automatically enabled. Each entry should be a valid network ID from your UniFi configuration. Leave empty to disable ad blocking.
     */
    readonly adBlockedNetworks: pulumi.Output<string[]>;
    /**
     * The advanced filtering preference for IPS. Valid values are:
     *   * `disabled` - Advanced filtering is disabled
     *   * `manual` - Advanced filtering is enabled and manually configured
     */
    readonly advancedFilteringPreference: pulumi.Output<string>;
    /**
     * DNS filters configuration. If any filters are configured, DNS filtering will be automatically enabled. Each filter can be applied to a specific network and provides content filtering capabilities.
     */
    readonly dnsFilters: pulumi.Output<outputs.SettingIpsDnsFilter[]>;
    /**
     * List of enabled IPS threat categories. Each entry enables detection and prevention for a specific type of threat. The list of valid categories includes common threats like malware, exploits, scanning, and policy violations. See the validator for the complete list of available categories.
     */
    readonly enabledCategories: pulumi.Output<string[]>;
    /**
     * List of network IDs to enable IPS protection for. Each entry should be a valid network ID from your UniFi configuration. IPS will only monitor and protect traffic on these networks.
     */
    readonly enabledNetworks: pulumi.Output<string[]>;
    /**
     * Honeypots configuration. Honeypots are decoy systems designed to detect, deflect, or study hacking attempts. They appear as legitimate parts of the network but are isolated and monitored.
     */
    readonly honeypots: pulumi.Output<outputs.SettingIpsHoneypot[]>;
    /**
     * The IPS operation mode. Valid values are:
     *   * `ids` - Intrusion Detection System mode (detect and log threats only)
     *   * `ips` - Intrusion Prevention System mode (detect and block threats)
     *   * `ipsInline` - Inline Intrusion Prevention System mode (more aggressive blocking)
     *   * `disabled` - IPS functionality is completely disabled
     */
    readonly ipsMode: pulumi.Output<string>;
    /**
     * Whether memory optimization is enabled for IPS. When set to `true`, the system will use less memory at the cost of potentially reduced detection capabilities. Useful for devices with limited resources. Defaults to `false`. Requires controller version 9.0 or later.
     */
    readonly memoryOptimized: pulumi.Output<boolean>;
    /**
     * Whether to restrict BitTorrent and other peer-to-peer file sharing traffic. When set to `true`, the system will block P2P traffic across the network. Defaults to `false`.
     */
    readonly restrictTorrents: pulumi.Output<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Suppression configuration for IPS. This allows you to customize which alerts are suppressed or tracked, and define whitelisted traffic that should never trigger IPS alerts.
     */
    readonly suppression: pulumi.Output<outputs.SettingIpsSuppression>;
    /**
     * Create a SettingIps resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingIpsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingIps resources.
 */
export interface SettingIpsState {
    /**
     * List of network IDs to enable ad blocking for. If any networks are configured, ad blocking will be automatically enabled. Each entry should be a valid network ID from your UniFi configuration. Leave empty to disable ad blocking.
     */
    adBlockedNetworks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The advanced filtering preference for IPS. Valid values are:
     *   * `disabled` - Advanced filtering is disabled
     *   * `manual` - Advanced filtering is enabled and manually configured
     */
    advancedFilteringPreference?: pulumi.Input<string>;
    /**
     * DNS filters configuration. If any filters are configured, DNS filtering will be automatically enabled. Each filter can be applied to a specific network and provides content filtering capabilities.
     */
    dnsFilters?: pulumi.Input<pulumi.Input<inputs.SettingIpsDnsFilter>[]>;
    /**
     * List of enabled IPS threat categories. Each entry enables detection and prevention for a specific type of threat. The list of valid categories includes common threats like malware, exploits, scanning, and policy violations. See the validator for the complete list of available categories.
     */
    enabledCategories?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * List of network IDs to enable IPS protection for. Each entry should be a valid network ID from your UniFi configuration. IPS will only monitor and protect traffic on these networks.
     */
    enabledNetworks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Honeypots configuration. Honeypots are decoy systems designed to detect, deflect, or study hacking attempts. They appear as legitimate parts of the network but are isolated and monitored.
     */
    honeypots?: pulumi.Input<pulumi.Input<inputs.SettingIpsHoneypot>[]>;
    /**
     * The IPS operation mode. Valid values are:
     *   * `ids` - Intrusion Detection System mode (detect and log threats only)
     *   * `ips` - Intrusion Prevention System mode (detect and block threats)
     *   * `ipsInline` - Inline Intrusion Prevention System mode (more aggressive blocking)
     *   * `disabled` - IPS functionality is completely disabled
     */
    ipsMode?: pulumi.Input<string>;
    /**
     * Whether memory optimization is enabled for IPS. When set to `true`, the system will use less memory at the cost of potentially reduced detection capabilities. Useful for devices with limited resources. Defaults to `false`. Requires controller version 9.0 or later.
     */
    memoryOptimized?: pulumi.Input<boolean>;
    /**
     * Whether to restrict BitTorrent and other peer-to-peer file sharing traffic. When set to `true`, the system will block P2P traffic across the network. Defaults to `false`.
     */
    restrictTorrents?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Suppression configuration for IPS. This allows you to customize which alerts are suppressed or tracked, and define whitelisted traffic that should never trigger IPS alerts.
     */
    suppression?: pulumi.Input<inputs.SettingIpsSuppression>;
}
/**
 * The set of arguments for constructing a SettingIps resource.
 */
export interface SettingIpsArgs {
    /**
     * List of network IDs to enable ad blocking for. If any networks are configured, ad blocking will be automatically enabled. Each entry should be a valid network ID from your UniFi configuration. Leave empty to disable ad blocking.
     */
    adBlockedNetworks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The advanced filtering preference for IPS. Valid values are:
     *   * `disabled` - Advanced filtering is disabled
     *   * `manual` - Advanced filtering is enabled and manually configured
     */
    advancedFilteringPreference?: pulumi.Input<string>;
    /**
     * DNS filters configuration. If any filters are configured, DNS filtering will be automatically enabled. Each filter can be applied to a specific network and provides content filtering capabilities.
     */
    dnsFilters?: pulumi.Input<pulumi.Input<inputs.SettingIpsDnsFilter>[]>;
    /**
     * List of enabled IPS threat categories. Each entry enables detection and prevention for a specific type of threat. The list of valid categories includes common threats like malware, exploits, scanning, and policy violations. See the validator for the complete list of available categories.
     */
    enabledCategories?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * List of network IDs to enable IPS protection for. Each entry should be a valid network ID from your UniFi configuration. IPS will only monitor and protect traffic on these networks.
     */
    enabledNetworks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Honeypots configuration. Honeypots are decoy systems designed to detect, deflect, or study hacking attempts. They appear as legitimate parts of the network but are isolated and monitored.
     */
    honeypots?: pulumi.Input<pulumi.Input<inputs.SettingIpsHoneypot>[]>;
    /**
     * The IPS operation mode. Valid values are:
     *   * `ids` - Intrusion Detection System mode (detect and log threats only)
     *   * `ips` - Intrusion Prevention System mode (detect and block threats)
     *   * `ipsInline` - Inline Intrusion Prevention System mode (more aggressive blocking)
     *   * `disabled` - IPS functionality is completely disabled
     */
    ipsMode?: pulumi.Input<string>;
    /**
     * Whether memory optimization is enabled for IPS. When set to `true`, the system will use less memory at the cost of potentially reduced detection capabilities. Useful for devices with limited resources. Defaults to `false`. Requires controller version 9.0 or later.
     */
    memoryOptimized?: pulumi.Input<boolean>;
    /**
     * Whether to restrict BitTorrent and other peer-to-peer file sharing traffic. When set to `true`, the system will block P2P traffic across the network. Defaults to `false`.
     */
    restrictTorrents?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Suppression configuration for IPS. This allows you to customize which alerts are suppressed or tracked, and define whitelisted traffic that should never trigger IPS alerts.
     */
    suppression?: pulumi.Input<inputs.SettingIpsSuppression>;
}

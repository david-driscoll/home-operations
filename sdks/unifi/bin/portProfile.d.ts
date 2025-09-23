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
     * Enable automatic negotiation of port speed and duplex settings. When enabled, this overrides manual speed and duplex settings. Recommended for most use cases. Defaults to `true`.
     */
    readonly autoneg: pulumi.Output<boolean | undefined>;
    /**
     * 802.1X port-based network access control (PNAC) mode. Valid values are:
     *   * `force_authorized` - Port allows all traffic, no authentication required (default)
     *   * `force_unauthorized` - Port blocks all traffic regardless of authentication
     *   * `auto` - Standard 802.1X authentication required before port access is granted
     *   * `mac_based` - Authentication based on client MAC address, useful for devices that don't support 802.1X
     *   * `multi_host` - Allows multiple devices after first successful authentication, common in VoIP phone setups
     *
     * Use 'auto' for highest security, 'mac_based' for legacy devices, and 'multi_host' when daisy-chaining devices. Defaults to `force_authorized`.
     */
    readonly dot1xCtrl: pulumi.Output<string | undefined>;
    /**
     * The number of seconds before an inactive authenticated MAC address is removed when using MAC-based 802.1X control. Range: 0-65535 seconds. Defaults to `300`.
     */
    readonly dot1xIdleTimeout: pulumi.Output<number | undefined>;
    /**
     * The maximum outbound bandwidth allowed on the port in kilobits per second. Range: 64-9999999 kbps. Only applied when egress_rate_limit_kbps_enabled is true.
     */
    readonly egressRateLimitKbps: pulumi.Output<number | undefined>;
    /**
     * Enable outbound bandwidth rate limiting on the port. When enabled, traffic will be limited to the rate specified in egress_rate_limit_kbps. Defaults to `false`.
     */
    readonly egressRateLimitKbpsEnabled: pulumi.Output<boolean | undefined>;
    /**
     * List of network IDs to exclude when forward is set to 'customize'. This allows you to prevent specific networks from being accessible on ports using this profile.
     */
    readonly excludedNetworkIds: pulumi.Output<string[] | undefined>;
    /**
     * VLAN forwarding mode for the port. Valid values are:
     *   * `all` - Forward all VLANs (trunk port)
     *   * `native` - Only forward untagged traffic (access port)
     *   * `customize` - Forward selected VLANs (use with `excluded_network_ids`)
     *   * `disabled` - Disable VLAN forwarding
     *
     * Examples:
     *   * Use 'all' for uplink ports or connections to VLAN-aware devices
     *   * Use 'native' for end-user devices or simple network connections
     *   * Use 'customize' to create a selective trunk port (e.g., for a server needing access to specific VLANs) Defaults to `native`.
     */
    readonly forward: pulumi.Output<string | undefined>;
    /**
     * Enable full-duplex mode when auto-negotiation is disabled. Full duplex allows simultaneous two-way communication. Defaults to `false`.
     */
    readonly fullDuplex: pulumi.Output<boolean | undefined>;
    /**
     * Enable port isolation. When enabled, devices connected to ports with this profile cannot communicate with each other, providing enhanced security. Defaults to `false`.
     */
    readonly isolation: pulumi.Output<boolean | undefined>;
    /**
     * Enable Link Layer Discovery Protocol-Media Endpoint Discovery (LLDP-MED). This allows for automatic discovery and configuration of devices like VoIP phones. Defaults to `true`.
     */
    readonly lldpmedEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Enable LLDP-MED topology change notifications. When enabled:
     * * Network devices will be notified of topology changes
     * * Useful for VoIP phones and other LLDP-MED capable devices
     * * Helps maintain accurate network topology information
     * * Facilitates faster device configuration and provisioning
     */
    readonly lldpmedNotifyEnabled: pulumi.Output<boolean | undefined>;
    /**
     * A descriptive name for the port profile. Examples:
     * * 'AP-Trunk-Port' - For access point uplinks
     * * 'VoIP-Phone-Port' - For VoIP phone connections
     * * 'User-Access-Port' - For standard user connections
     * * 'IoT-Device-Port' - For IoT device connections
     */
    readonly name: pulumi.Output<string>;
    /**
     * The ID of the network to use as the native (untagged) network on ports using this profile. This is typically used for:
     * * Access ports where devices need untagged access
     * * Trunk ports to specify the native VLAN
     * * Management networks for network devices
     */
    readonly nativeNetworkconfId: pulumi.Output<string | undefined>;
    /**
     * The operation mode for the port profile. Can only be `switch` Defaults to `switch`.
     */
    readonly opMode: pulumi.Output<string | undefined>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    readonly poeMode: pulumi.Output<string | undefined>;
    /**
     * Enable MAC address-based port security. When enabled:
     * * Only devices with specified MAC addresses can connect
     * * Unauthorized devices will be blocked
     * * Provides protection against unauthorized network access
     * * Must be used with port_security_mac_address list Defaults to `false`.
     */
    readonly portSecurityEnabled: pulumi.Output<boolean | undefined>;
    /**
     * List of allowed MAC addresses when port security is enabled. Each address should be:
     * * In standard format (e.g., 'aa:bb:cc:dd:ee:ff')
     * * Unique per device
     * * Verified to belong to authorized devices
     * Only effective when port_security_enabled is true
     */
    readonly portSecurityMacAddresses: pulumi.Output<string[] | undefined>;
    /**
     * Priority queue 1 level (0-100) for Quality of Service (QoS). Used for:
     * * Low-priority background traffic
     * * Bulk data transfers
     * * Non-time-sensitive applications
     * Higher values give more bandwidth to this queue
     */
    readonly priorityQueue1Level: pulumi.Output<number | undefined>;
    /**
     * Priority queue 2 level (0-100) for Quality of Service (QoS). Used for:
     * * Standard user traffic
     * * Web browsing and email
     * * General business applications
     * Higher values give more bandwidth to this queue
     */
    readonly priorityQueue2Level: pulumi.Output<number | undefined>;
    /**
     * Priority queue 3 level (0-100) for Quality of Service (QoS). Used for:
     * * High-priority traffic
     * * Voice and video conferencing
     * * Time-sensitive applications
     * Higher values give more bandwidth to this queue
     */
    readonly priorityQueue3Level: pulumi.Output<number | undefined>;
    /**
     * Priority queue 4 level (0-100) for Quality of Service (QoS). Used for:
     * * Highest priority traffic
     * * Critical real-time applications
     * * Emergency communications
     * Higher values give more bandwidth to this queue
     */
    readonly priorityQueue4Level: pulumi.Output<number | undefined>;
    /**
     * The name of the UniFi site where the port profile should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Port speed in Mbps when auto-negotiation is disabled. Common values:
     * * 10 - 10 Mbps (legacy devices)
     * * 100 - 100 Mbps (Fast Ethernet)
     * * 1000 - 1 Gbps (Gigabit Ethernet)
     * * 2500 - 2.5 Gbps (Multi-Gigabit)
     * * 5000 - 5 Gbps (Multi-Gigabit)
     * * 10000 - 10 Gbps (10 Gigabit)
     * Only used when autoneg is false
     */
    readonly speed: pulumi.Output<number | undefined>;
    /**
     * Enable broadcast storm control. When enabled:
     * * Limits broadcast traffic to prevent network flooding
     * * Protects against broadcast storms
     * * Helps maintain network stability
     * Use with stormctrl_bcast_rate to set threshold Defaults to `false`.
     */
    readonly stormctrlBcastEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    readonly stormctrlBcastLevel: pulumi.Output<number | undefined>;
    /**
     * Maximum broadcast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control broadcast traffic levels
     * * Prevent network congestion
     * * Balance between necessary broadcasts and network protection
     * Only effective when `stormctrl_bcast_enabled` is true
     */
    readonly stormctrlBcastRate: pulumi.Output<number | undefined>;
    /**
     * Enable multicast storm control. When enabled:
     * * Limits multicast traffic to prevent network flooding
     * * Important for networks with multicast applications
     * * Helps maintain quality of service
     * Use with `stormctrl_mcast_rate` to set threshold Defaults to `false`.
     */
    readonly stormctrlMcastEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    readonly stormctrlMcastLevel: pulumi.Output<number | undefined>;
    /**
     * Maximum multicast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control multicast traffic levels
     * * Ensure bandwidth for critical multicast services
     * * Prevent multicast traffic from overwhelming the network
     * Only effective when stormctrl_mcast_enabled is true
     */
    readonly stormctrlMcastRate: pulumi.Output<number | undefined>;
    /**
     * The type of Storm Control to use for the port profile. Can be one of `level` or `rate`.
     */
    readonly stormctrlType: pulumi.Output<string | undefined>;
    /**
     * Enable unknown unicast storm control. When enabled:
     * * Limits unknown unicast traffic to prevent flooding
     * * Protects against MAC spoofing attacks
     * * Helps maintain network performance
     * Use with stormctrl_ucast_rate to set threshold Defaults to `false`.
     */
    readonly stormctrlUcastEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    readonly stormctrlUcastLevel: pulumi.Output<number | undefined>;
    /**
     * Maximum unknown unicast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control unknown unicast traffic levels
     * * Prevent network saturation from unknown destinations
     * * Balance security with network usability
     * Only effective when stormctrl_ucast_enabled is true
     */
    readonly stormctrlUcastRate: pulumi.Output<number | undefined>;
    /**
     * Spanning Tree Protocol (STP) configuration for the port. When enabled:
     * * Prevents network loops in switch-to-switch connections
     * * Provides automatic failover in redundant topologies
     * * Helps maintain network stability
     *
     * Best practices:
     * * Enable on switch uplink ports
     * * Enable on ports connecting to other switches
     * * Can be disabled on end-device ports for faster initialization Defaults to `true`.
     */
    readonly stpPortMode: pulumi.Output<boolean | undefined>;
    /**
     * VLAN tagging behavior for the port. Valid values are:
     * * `auto` - Automatically handle VLAN tags (recommended)
     *     - Intelligently manages tagged and untagged traffic
     *     - Best for most deployments
     * * `block_all` - Block all VLAN tagged traffic
     *     - Use for security-sensitive ports
     *     - Prevents VLAN hopping attacks
     * * `custom` - Custom VLAN configuration
     *     - Manual control over VLAN behavior
     *     - For specific VLAN requirements
     */
    readonly taggedVlanMgmt: pulumi.Output<string | undefined>;
    /**
     * The ID of the network to use for Voice over IP (VoIP) traffic. Used for:
     * * Automatic VoIP VLAN configuration
     * * Voice traffic prioritization
     * * QoS settings for voice packets
     *
     * Common scenarios:
     * * IP phone deployments with separate voice VLAN
     * * Unified communications systems
     * * Converged voice/data networks
     *
     * Works in conjunction with LLDP-MED for automatic phone provisioning.
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
     * Enable automatic negotiation of port speed and duplex settings. When enabled, this overrides manual speed and duplex settings. Recommended for most use cases. Defaults to `true`.
     */
    autoneg?: pulumi.Input<boolean>;
    /**
     * 802.1X port-based network access control (PNAC) mode. Valid values are:
     *   * `force_authorized` - Port allows all traffic, no authentication required (default)
     *   * `force_unauthorized` - Port blocks all traffic regardless of authentication
     *   * `auto` - Standard 802.1X authentication required before port access is granted
     *   * `mac_based` - Authentication based on client MAC address, useful for devices that don't support 802.1X
     *   * `multi_host` - Allows multiple devices after first successful authentication, common in VoIP phone setups
     *
     * Use 'auto' for highest security, 'mac_based' for legacy devices, and 'multi_host' when daisy-chaining devices. Defaults to `force_authorized`.
     */
    dot1xCtrl?: pulumi.Input<string>;
    /**
     * The number of seconds before an inactive authenticated MAC address is removed when using MAC-based 802.1X control. Range: 0-65535 seconds. Defaults to `300`.
     */
    dot1xIdleTimeout?: pulumi.Input<number>;
    /**
     * The maximum outbound bandwidth allowed on the port in kilobits per second. Range: 64-9999999 kbps. Only applied when egress_rate_limit_kbps_enabled is true.
     */
    egressRateLimitKbps?: pulumi.Input<number>;
    /**
     * Enable outbound bandwidth rate limiting on the port. When enabled, traffic will be limited to the rate specified in egress_rate_limit_kbps. Defaults to `false`.
     */
    egressRateLimitKbpsEnabled?: pulumi.Input<boolean>;
    /**
     * List of network IDs to exclude when forward is set to 'customize'. This allows you to prevent specific networks from being accessible on ports using this profile.
     */
    excludedNetworkIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * VLAN forwarding mode for the port. Valid values are:
     *   * `all` - Forward all VLANs (trunk port)
     *   * `native` - Only forward untagged traffic (access port)
     *   * `customize` - Forward selected VLANs (use with `excluded_network_ids`)
     *   * `disabled` - Disable VLAN forwarding
     *
     * Examples:
     *   * Use 'all' for uplink ports or connections to VLAN-aware devices
     *   * Use 'native' for end-user devices or simple network connections
     *   * Use 'customize' to create a selective trunk port (e.g., for a server needing access to specific VLANs) Defaults to `native`.
     */
    forward?: pulumi.Input<string>;
    /**
     * Enable full-duplex mode when auto-negotiation is disabled. Full duplex allows simultaneous two-way communication. Defaults to `false`.
     */
    fullDuplex?: pulumi.Input<boolean>;
    /**
     * Enable port isolation. When enabled, devices connected to ports with this profile cannot communicate with each other, providing enhanced security. Defaults to `false`.
     */
    isolation?: pulumi.Input<boolean>;
    /**
     * Enable Link Layer Discovery Protocol-Media Endpoint Discovery (LLDP-MED). This allows for automatic discovery and configuration of devices like VoIP phones. Defaults to `true`.
     */
    lldpmedEnabled?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED topology change notifications. When enabled:
     * * Network devices will be notified of topology changes
     * * Useful for VoIP phones and other LLDP-MED capable devices
     * * Helps maintain accurate network topology information
     * * Facilitates faster device configuration and provisioning
     */
    lldpmedNotifyEnabled?: pulumi.Input<boolean>;
    /**
     * A descriptive name for the port profile. Examples:
     * * 'AP-Trunk-Port' - For access point uplinks
     * * 'VoIP-Phone-Port' - For VoIP phone connections
     * * 'User-Access-Port' - For standard user connections
     * * 'IoT-Device-Port' - For IoT device connections
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of the network to use as the native (untagged) network on ports using this profile. This is typically used for:
     * * Access ports where devices need untagged access
     * * Trunk ports to specify the native VLAN
     * * Management networks for network devices
     */
    nativeNetworkconfId?: pulumi.Input<string>;
    /**
     * The operation mode for the port profile. Can only be `switch` Defaults to `switch`.
     */
    opMode?: pulumi.Input<string>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Enable MAC address-based port security. When enabled:
     * * Only devices with specified MAC addresses can connect
     * * Unauthorized devices will be blocked
     * * Provides protection against unauthorized network access
     * * Must be used with port_security_mac_address list Defaults to `false`.
     */
    portSecurityEnabled?: pulumi.Input<boolean>;
    /**
     * List of allowed MAC addresses when port security is enabled. Each address should be:
     * * In standard format (e.g., 'aa:bb:cc:dd:ee:ff')
     * * Unique per device
     * * Verified to belong to authorized devices
     * Only effective when port_security_enabled is true
     */
    portSecurityMacAddresses?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Priority queue 1 level (0-100) for Quality of Service (QoS). Used for:
     * * Low-priority background traffic
     * * Bulk data transfers
     * * Non-time-sensitive applications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue1Level?: pulumi.Input<number>;
    /**
     * Priority queue 2 level (0-100) for Quality of Service (QoS). Used for:
     * * Standard user traffic
     * * Web browsing and email
     * * General business applications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue2Level?: pulumi.Input<number>;
    /**
     * Priority queue 3 level (0-100) for Quality of Service (QoS). Used for:
     * * High-priority traffic
     * * Voice and video conferencing
     * * Time-sensitive applications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue3Level?: pulumi.Input<number>;
    /**
     * Priority queue 4 level (0-100) for Quality of Service (QoS). Used for:
     * * Highest priority traffic
     * * Critical real-time applications
     * * Emergency communications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue4Level?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where the port profile should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Port speed in Mbps when auto-negotiation is disabled. Common values:
     * * 10 - 10 Mbps (legacy devices)
     * * 100 - 100 Mbps (Fast Ethernet)
     * * 1000 - 1 Gbps (Gigabit Ethernet)
     * * 2500 - 2.5 Gbps (Multi-Gigabit)
     * * 5000 - 5 Gbps (Multi-Gigabit)
     * * 10000 - 10 Gbps (10 Gigabit)
     * Only used when autoneg is false
     */
    speed?: pulumi.Input<number>;
    /**
     * Enable broadcast storm control. When enabled:
     * * Limits broadcast traffic to prevent network flooding
     * * Protects against broadcast storms
     * * Helps maintain network stability
     * Use with stormctrl_bcast_rate to set threshold Defaults to `false`.
     */
    stormctrlBcastEnabled?: pulumi.Input<boolean>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlBcastLevel?: pulumi.Input<number>;
    /**
     * Maximum broadcast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control broadcast traffic levels
     * * Prevent network congestion
     * * Balance between necessary broadcasts and network protection
     * Only effective when `stormctrl_bcast_enabled` is true
     */
    stormctrlBcastRate?: pulumi.Input<number>;
    /**
     * Enable multicast storm control. When enabled:
     * * Limits multicast traffic to prevent network flooding
     * * Important for networks with multicast applications
     * * Helps maintain quality of service
     * Use with `stormctrl_mcast_rate` to set threshold Defaults to `false`.
     */
    stormctrlMcastEnabled?: pulumi.Input<boolean>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlMcastLevel?: pulumi.Input<number>;
    /**
     * Maximum multicast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control multicast traffic levels
     * * Ensure bandwidth for critical multicast services
     * * Prevent multicast traffic from overwhelming the network
     * Only effective when stormctrl_mcast_enabled is true
     */
    stormctrlMcastRate?: pulumi.Input<number>;
    /**
     * The type of Storm Control to use for the port profile. Can be one of `level` or `rate`.
     */
    stormctrlType?: pulumi.Input<string>;
    /**
     * Enable unknown unicast storm control. When enabled:
     * * Limits unknown unicast traffic to prevent flooding
     * * Protects against MAC spoofing attacks
     * * Helps maintain network performance
     * Use with stormctrl_ucast_rate to set threshold Defaults to `false`.
     */
    stormctrlUcastEnabled?: pulumi.Input<boolean>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlUcastLevel?: pulumi.Input<number>;
    /**
     * Maximum unknown unicast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control unknown unicast traffic levels
     * * Prevent network saturation from unknown destinations
     * * Balance security with network usability
     * Only effective when stormctrl_ucast_enabled is true
     */
    stormctrlUcastRate?: pulumi.Input<number>;
    /**
     * Spanning Tree Protocol (STP) configuration for the port. When enabled:
     * * Prevents network loops in switch-to-switch connections
     * * Provides automatic failover in redundant topologies
     * * Helps maintain network stability
     *
     * Best practices:
     * * Enable on switch uplink ports
     * * Enable on ports connecting to other switches
     * * Can be disabled on end-device ports for faster initialization Defaults to `true`.
     */
    stpPortMode?: pulumi.Input<boolean>;
    /**
     * VLAN tagging behavior for the port. Valid values are:
     * * `auto` - Automatically handle VLAN tags (recommended)
     *     - Intelligently manages tagged and untagged traffic
     *     - Best for most deployments
     * * `block_all` - Block all VLAN tagged traffic
     *     - Use for security-sensitive ports
     *     - Prevents VLAN hopping attacks
     * * `custom` - Custom VLAN configuration
     *     - Manual control over VLAN behavior
     *     - For specific VLAN requirements
     */
    taggedVlanMgmt?: pulumi.Input<string>;
    /**
     * The ID of the network to use for Voice over IP (VoIP) traffic. Used for:
     * * Automatic VoIP VLAN configuration
     * * Voice traffic prioritization
     * * QoS settings for voice packets
     *
     * Common scenarios:
     * * IP phone deployments with separate voice VLAN
     * * Unified communications systems
     * * Converged voice/data networks
     *
     * Works in conjunction with LLDP-MED for automatic phone provisioning.
     */
    voiceNetworkconfId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PortProfile resource.
 */
export interface PortProfileArgs {
    /**
     * Enable automatic negotiation of port speed and duplex settings. When enabled, this overrides manual speed and duplex settings. Recommended for most use cases. Defaults to `true`.
     */
    autoneg?: pulumi.Input<boolean>;
    /**
     * 802.1X port-based network access control (PNAC) mode. Valid values are:
     *   * `force_authorized` - Port allows all traffic, no authentication required (default)
     *   * `force_unauthorized` - Port blocks all traffic regardless of authentication
     *   * `auto` - Standard 802.1X authentication required before port access is granted
     *   * `mac_based` - Authentication based on client MAC address, useful for devices that don't support 802.1X
     *   * `multi_host` - Allows multiple devices after first successful authentication, common in VoIP phone setups
     *
     * Use 'auto' for highest security, 'mac_based' for legacy devices, and 'multi_host' when daisy-chaining devices. Defaults to `force_authorized`.
     */
    dot1xCtrl?: pulumi.Input<string>;
    /**
     * The number of seconds before an inactive authenticated MAC address is removed when using MAC-based 802.1X control. Range: 0-65535 seconds. Defaults to `300`.
     */
    dot1xIdleTimeout?: pulumi.Input<number>;
    /**
     * The maximum outbound bandwidth allowed on the port in kilobits per second. Range: 64-9999999 kbps. Only applied when egress_rate_limit_kbps_enabled is true.
     */
    egressRateLimitKbps?: pulumi.Input<number>;
    /**
     * Enable outbound bandwidth rate limiting on the port. When enabled, traffic will be limited to the rate specified in egress_rate_limit_kbps. Defaults to `false`.
     */
    egressRateLimitKbpsEnabled?: pulumi.Input<boolean>;
    /**
     * List of network IDs to exclude when forward is set to 'customize'. This allows you to prevent specific networks from being accessible on ports using this profile.
     */
    excludedNetworkIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * VLAN forwarding mode for the port. Valid values are:
     *   * `all` - Forward all VLANs (trunk port)
     *   * `native` - Only forward untagged traffic (access port)
     *   * `customize` - Forward selected VLANs (use with `excluded_network_ids`)
     *   * `disabled` - Disable VLAN forwarding
     *
     * Examples:
     *   * Use 'all' for uplink ports or connections to VLAN-aware devices
     *   * Use 'native' for end-user devices or simple network connections
     *   * Use 'customize' to create a selective trunk port (e.g., for a server needing access to specific VLANs) Defaults to `native`.
     */
    forward?: pulumi.Input<string>;
    /**
     * Enable full-duplex mode when auto-negotiation is disabled. Full duplex allows simultaneous two-way communication. Defaults to `false`.
     */
    fullDuplex?: pulumi.Input<boolean>;
    /**
     * Enable port isolation. When enabled, devices connected to ports with this profile cannot communicate with each other, providing enhanced security. Defaults to `false`.
     */
    isolation?: pulumi.Input<boolean>;
    /**
     * Enable Link Layer Discovery Protocol-Media Endpoint Discovery (LLDP-MED). This allows for automatic discovery and configuration of devices like VoIP phones. Defaults to `true`.
     */
    lldpmedEnabled?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED topology change notifications. When enabled:
     * * Network devices will be notified of topology changes
     * * Useful for VoIP phones and other LLDP-MED capable devices
     * * Helps maintain accurate network topology information
     * * Facilitates faster device configuration and provisioning
     */
    lldpmedNotifyEnabled?: pulumi.Input<boolean>;
    /**
     * A descriptive name for the port profile. Examples:
     * * 'AP-Trunk-Port' - For access point uplinks
     * * 'VoIP-Phone-Port' - For VoIP phone connections
     * * 'User-Access-Port' - For standard user connections
     * * 'IoT-Device-Port' - For IoT device connections
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of the network to use as the native (untagged) network on ports using this profile. This is typically used for:
     * * Access ports where devices need untagged access
     * * Trunk ports to specify the native VLAN
     * * Management networks for network devices
     */
    nativeNetworkconfId?: pulumi.Input<string>;
    /**
     * The operation mode for the port profile. Can only be `switch` Defaults to `switch`.
     */
    opMode?: pulumi.Input<string>;
    /**
     * The POE mode for the port profile. Can be one of `auto`, `passv24`, `passthrough` or `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Enable MAC address-based port security. When enabled:
     * * Only devices with specified MAC addresses can connect
     * * Unauthorized devices will be blocked
     * * Provides protection against unauthorized network access
     * * Must be used with port_security_mac_address list Defaults to `false`.
     */
    portSecurityEnabled?: pulumi.Input<boolean>;
    /**
     * List of allowed MAC addresses when port security is enabled. Each address should be:
     * * In standard format (e.g., 'aa:bb:cc:dd:ee:ff')
     * * Unique per device
     * * Verified to belong to authorized devices
     * Only effective when port_security_enabled is true
     */
    portSecurityMacAddresses?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Priority queue 1 level (0-100) for Quality of Service (QoS). Used for:
     * * Low-priority background traffic
     * * Bulk data transfers
     * * Non-time-sensitive applications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue1Level?: pulumi.Input<number>;
    /**
     * Priority queue 2 level (0-100) for Quality of Service (QoS). Used for:
     * * Standard user traffic
     * * Web browsing and email
     * * General business applications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue2Level?: pulumi.Input<number>;
    /**
     * Priority queue 3 level (0-100) for Quality of Service (QoS). Used for:
     * * High-priority traffic
     * * Voice and video conferencing
     * * Time-sensitive applications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue3Level?: pulumi.Input<number>;
    /**
     * Priority queue 4 level (0-100) for Quality of Service (QoS). Used for:
     * * Highest priority traffic
     * * Critical real-time applications
     * * Emergency communications
     * Higher values give more bandwidth to this queue
     */
    priorityQueue4Level?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where the port profile should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Port speed in Mbps when auto-negotiation is disabled. Common values:
     * * 10 - 10 Mbps (legacy devices)
     * * 100 - 100 Mbps (Fast Ethernet)
     * * 1000 - 1 Gbps (Gigabit Ethernet)
     * * 2500 - 2.5 Gbps (Multi-Gigabit)
     * * 5000 - 5 Gbps (Multi-Gigabit)
     * * 10000 - 10 Gbps (10 Gigabit)
     * Only used when autoneg is false
     */
    speed?: pulumi.Input<number>;
    /**
     * Enable broadcast storm control. When enabled:
     * * Limits broadcast traffic to prevent network flooding
     * * Protects against broadcast storms
     * * Helps maintain network stability
     * Use with stormctrl_bcast_rate to set threshold Defaults to `false`.
     */
    stormctrlBcastEnabled?: pulumi.Input<boolean>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlBcastLevel?: pulumi.Input<number>;
    /**
     * Maximum broadcast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control broadcast traffic levels
     * * Prevent network congestion
     * * Balance between necessary broadcasts and network protection
     * Only effective when `stormctrl_bcast_enabled` is true
     */
    stormctrlBcastRate?: pulumi.Input<number>;
    /**
     * Enable multicast storm control. When enabled:
     * * Limits multicast traffic to prevent network flooding
     * * Important for networks with multicast applications
     * * Helps maintain quality of service
     * Use with `stormctrl_mcast_rate` to set threshold Defaults to `false`.
     */
    stormctrlMcastEnabled?: pulumi.Input<boolean>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlMcastLevel?: pulumi.Input<number>;
    /**
     * Maximum multicast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control multicast traffic levels
     * * Ensure bandwidth for critical multicast services
     * * Prevent multicast traffic from overwhelming the network
     * Only effective when stormctrl_mcast_enabled is true
     */
    stormctrlMcastRate?: pulumi.Input<number>;
    /**
     * The type of Storm Control to use for the port profile. Can be one of `level` or `rate`.
     */
    stormctrlType?: pulumi.Input<string>;
    /**
     * Enable unknown unicast storm control. When enabled:
     * * Limits unknown unicast traffic to prevent flooding
     * * Protects against MAC spoofing attacks
     * * Helps maintain network performance
     * Use with stormctrl_ucast_rate to set threshold Defaults to `false`.
     */
    stormctrlUcastEnabled?: pulumi.Input<boolean>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    stormctrlUcastLevel?: pulumi.Input<number>;
    /**
     * Maximum unknown unicast traffic rate in packets per second (0 - 14880000). Used to:
     * * Control unknown unicast traffic levels
     * * Prevent network saturation from unknown destinations
     * * Balance security with network usability
     * Only effective when stormctrl_ucast_enabled is true
     */
    stormctrlUcastRate?: pulumi.Input<number>;
    /**
     * Spanning Tree Protocol (STP) configuration for the port. When enabled:
     * * Prevents network loops in switch-to-switch connections
     * * Provides automatic failover in redundant topologies
     * * Helps maintain network stability
     *
     * Best practices:
     * * Enable on switch uplink ports
     * * Enable on ports connecting to other switches
     * * Can be disabled on end-device ports for faster initialization Defaults to `true`.
     */
    stpPortMode?: pulumi.Input<boolean>;
    /**
     * VLAN tagging behavior for the port. Valid values are:
     * * `auto` - Automatically handle VLAN tags (recommended)
     *     - Intelligently manages tagged and untagged traffic
     *     - Best for most deployments
     * * `block_all` - Block all VLAN tagged traffic
     *     - Use for security-sensitive ports
     *     - Prevents VLAN hopping attacks
     * * `custom` - Custom VLAN configuration
     *     - Manual control over VLAN behavior
     *     - For specific VLAN requirements
     */
    taggedVlanMgmt?: pulumi.Input<string>;
    /**
     * The ID of the network to use for Voice over IP (VoIP) traffic. Used for:
     * * Automatic VoIP VLAN configuration
     * * Voice traffic prioritization
     * * QoS settings for voice packets
     *
     * Common scenarios:
     * * IP phone deployments with separate voice VLAN
     * * Unified communications systems
     * * Converged voice/data networks
     *
     * Works in conjunction with LLDP-MED for automatic phone provisioning.
     */
    voiceNetworkconfId?: pulumi.Input<string>;
}

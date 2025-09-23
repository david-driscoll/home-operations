import * as pulumi from "@pulumi/pulumi";
export declare class Network extends pulumi.CustomResource {
    /**
     * Get an existing Network resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: NetworkState, opts?: pulumi.CustomResourceOptions): Network;
    /**
     * Returns true if the given object is an instance of Network.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Network;
    /**
     * List of IPv4 DNS server addresses to be provided to DHCP clients. Examples:
     * * Use ['8.8.8.8', '8.8.4.4'] for Google DNS
     * * Use ['1.1.1.1', '1.0.0.1'] for Cloudflare DNS
     * * Use internal DNS servers for corporate networks
     * Maximum 4 servers can be specified.
     */
    readonly dhcpDns: pulumi.Output<string[] | undefined>;
    /**
     * Controls whether DHCP server is enabled for this network. When enabled:
     * * The network will automatically assign IP addresses to clients
     * * DHCP options (DNS, lease time) will be provided to clients
     * * Static IP assignments can still be made outside the DHCP range
     */
    readonly dhcpEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The DHCP lease time in seconds. Common values:
     * * 86400 (1 day) - Default, suitable for most networks
     * * 3600 (1 hour) - For testing or temporary networks
     * * 604800 (1 week) - For stable networks with static clients
     * * 2592000 (30 days) - For very stable networks Defaults to `86400`.
     */
    readonly dhcpLease: pulumi.Output<number | undefined>;
    /**
     * Enables DHCP relay for this network. When enabled:
     * * DHCP requests are forwarded to an external DHCP server
     * * Local DHCP server is disabled
     * * Useful for centralized DHCP management
     */
    readonly dhcpRelayEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The starting IPv4 address of the DHCP range. Examples:
     * * For subnet 192.168.1.0/24, typical start: '192.168.1.100'
     * * For subnet 10.0.0.0/24, typical start: '10.0.0.100'
     * Ensure this address is within the network's subnet.
     */
    readonly dhcpStart: pulumi.Output<string | undefined>;
    /**
     * The ending IPv4 address of the DHCP range. Examples:
     * * For subnet 192.168.1.0/24, typical stop: '192.168.1.254'
     * * For subnet 10.0.0.0/24, typical stop: '10.0.0.254'
     * Must be greater than dhcp_start and within the network's subnet.
     */
    readonly dhcpStop: pulumi.Output<string | undefined>;
    /**
     * List of IPv6 DNS server addresses for DHCPv6 clients. Examples:
     * * Use ['2001:4860:4860::8888', '2001:4860:4860::8844'] for Google DNS
     * * Use ['2606:4700:4700::1111', '2606:4700:4700::1001'] for Cloudflare DNS
     * Only used when dhcp_v6_dns_auto is false. Maximum of 4 addresses are allowed.
     */
    readonly dhcpV6Dns: pulumi.Output<string[] | undefined>;
    /**
     * Controls DNS server source for DHCPv6 clients:
     * * true - Use upstream DNS servers (recommended)
     * * false - Use manually specified servers from dhcp_v6_dns
     * Default is true for easier management. Defaults to `true`.
     */
    readonly dhcpV6DnsAuto: pulumi.Output<boolean | undefined>;
    /**
     * Enables stateful DHCPv6 for IPv6 address assignment. When enabled:
     * * Provides IPv6 addresses to clients
     * * Works alongside SLAAC if configured
     * * Allows for more controlled IPv6 addressing
     */
    readonly dhcpV6Enabled: pulumi.Output<boolean | undefined>;
    /**
     * The DHCPv6 lease time in seconds. Common values:
     * * 86400 (1 day) - Default setting
     * * 3600 (1 hour) - For testing
     * * 604800 (1 week) - For stable networks
     * Typically longer than IPv4 DHCP leases. Defaults to `86400`.
     */
    readonly dhcpV6Lease: pulumi.Output<number | undefined>;
    /**
     * The starting IPv6 address for the DHCPv6 range. Used in static DHCPv6 configuration.
     * Must be a valid IPv6 address within your allocated IPv6 subnet.
     */
    readonly dhcpV6Start: pulumi.Output<string | undefined>;
    /**
     * The ending IPv6 address for the DHCPv6 range. Used in static DHCPv6 configuration.
     * Must be after dhcp_v6_start in the IPv6 address space.
     */
    readonly dhcpV6Stop: pulumi.Output<string | undefined>;
    /**
     * Enables DHCP boot options for PXE boot or network boot configurations. When enabled:
     * * Allows network devices to boot from a TFTP server
     * * Requires dhcpd_boot_server and dhcpd_boot_filename to be set
     * * Commonly used for diskless workstations or network installations
     */
    readonly dhcpdBootEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The boot filename to be loaded from the TFTP server. Examples:
     * * 'pxelinux.0' - Standard PXE boot loader
     * * 'undionly.kpxe' - iPXE boot loader
     * * Custom paths for specific boot images
     */
    readonly dhcpdBootFilename: pulumi.Output<string | undefined>;
    /**
     * The IPv4 address of the TFTP server for network boot. This setting:
     * * Is required when dhcpd_boot_enabled is true
     * * Should be a reliable, always-on server
     * * Must be accessible to all clients that need to boot
     */
    readonly dhcpdBootServer: pulumi.Output<string | undefined>;
    /**
     * The domain name for this network. Examples:
     * * 'corp.example.com' - For corporate networks
     * * 'guest.example.com' - For guest networks
     * * 'iot.example.com' - For IoT networks
     * Used for internal DNS resolution and DHCP options.
     */
    readonly domainName: pulumi.Output<string | undefined>;
    /**
     * Controls whether this network is active. When disabled:
     * * Network will not be available to clients
     * * DHCP services will be stopped
     * * Existing clients will be disconnected
     * Useful for temporary network maintenance or security measures. Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * Enables IGMP (Internet Group Management Protocol) snooping. When enabled:
     * * Optimizes multicast traffic flow
     * * Reduces network congestion
     * * Improves performance for multicast applications (e.g., IPTV)
     * Recommended for networks with multicast traffic.
     */
    readonly igmpSnooping: pulumi.Output<boolean | undefined>;
    /**
     * Controls internet access for this network. When disabled:
     * * Clients cannot access external networks
     * * Internal network access remains available
     * * Useful for creating isolated or secure networks Defaults to `true`.
     */
    readonly internetAccessEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies the IPv6 connection type. Must be one of:
     * * `none` - IPv6 disabled (default)
     * * `static` - Static IPv6 addressing
     * * `pd` - Prefix Delegation from upstream
     *
     * Choose based on your IPv6 deployment strategy and ISP capabilities. Defaults to `none`.
     */
    readonly ipv6InterfaceType: pulumi.Output<string | undefined>;
    /**
     * The WAN interface to use for IPv6 Prefix Delegation. Options:
     * * `wan` - Primary WAN interface
     * * `wan2` - Secondary WAN interface
     * Only applicable when `ipv6_interface_type` is 'pd'.
     */
    readonly ipv6PdInterface: pulumi.Output<string | undefined>;
    /**
     * The IPv6 Prefix ID for Prefix Delegation. Used to:
     * * Differentiate multiple delegated prefixes
     * * Create unique subnets from the delegated prefix
     * Typically a hexadecimal value (e.g., '0', '1', 'a1').
     */
    readonly ipv6PdPrefixid: pulumi.Output<string | undefined>;
    /**
     * The starting IPv6 address for Prefix Delegation range.
     * Only used when `ipv6_interface_type` is 'pd'.
     * Must be within the delegated prefix range.
     */
    readonly ipv6PdStart: pulumi.Output<string | undefined>;
    /**
     * The ending IPv6 address for Prefix Delegation range.
     * Only used when `ipv6_interface_type` is 'pd'.
     * Must be after `ipv6_pd_start` within the delegated prefix.
     */
    readonly ipv6PdStop: pulumi.Output<string | undefined>;
    /**
     * Enables IPv6 Router Advertisements (RA). When enabled:
     * * Announces IPv6 prefix information to clients
     * * Enables SLAAC address configuration
     * * Required for most IPv6 deployments
     */
    readonly ipv6RaEnable: pulumi.Output<boolean | undefined>;
    /**
     * The preferred lifetime (in seconds) for IPv6 addresses in Router Advertisements.
     * * Must be less than or equal to `ipv6_ra_valid_lifetime`
     * * Default: 14400 (4 hours)
     * * After this time, addresses become deprecated but still usable Defaults to `14400`.
     */
    readonly ipv6RaPreferredLifetime: pulumi.Output<number | undefined>;
    /**
     * Sets the priority for IPv6 Router Advertisements. Options:
     * * `high` - Preferred for primary networks
     * * `medium` - Standard priority
     * * `low` - For backup or secondary networks
     * Affects router selection when multiple IPv6 routers exist.
     */
    readonly ipv6RaPriority: pulumi.Output<string | undefined>;
    /**
     * The valid lifetime (in seconds) for IPv6 addresses in Router Advertisements.
     * * Must be greater than or equal to `ipv6_ra_preferred_lifetime`
     * * Default: 86400 (24 hours)
     * * After this time, addresses become invalid Defaults to `86400`.
     */
    readonly ipv6RaValidLifetime: pulumi.Output<number | undefined>;
    /**
     * The static IPv6 subnet in CIDR notation (e.g., '2001:db8::/64') when using static IPv6.
     * Only applicable when `ipv6_interface_type` is 'static'.
     * Must be a valid IPv6 subnet allocated to your organization.
     */
    readonly ipv6StaticSubnet: pulumi.Output<string | undefined>;
    /**
     * Enables Multicast DNS (mDNS/Bonjour/Avahi) on the network. When enabled:
     * * Allows device discovery (e.g., printers, Chromecasts)
     * * Supports zero-configuration networking
     * * Available on Controller version 7 and later
     */
    readonly multicastDns: pulumi.Output<boolean | undefined>;
    /**
     * The name of the network. This should be a descriptive name that helps identify the network's purpose, such as 'Corporate-Main', 'Guest-Network', or 'IoT-VLAN'.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The network group for this network. Default is 'LAN'. For WAN networks, use 'WAN' or 'WAN2'. Network groups help organize and apply policies to multiple networks. Defaults to `LAN`.
     */
    readonly networkGroup: pulumi.Output<string | undefined>;
    /**
     * Enables network isolation. When enabled:
     * * Prevents communication between clients on this network
     * * Each client can only communicate with the gateway
     * * Commonly used for guest networks or IoT devices Defaults to `false`.
     */
    readonly networkIsolationEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The purpose/type of the network. Must be one of:
     * * `corporate` - Standard network for corporate use with full access
     * * `guest` - Isolated network for guest access with limited permissions
     * * `wan` - External network connection (WAN uplink)
     * * `vlan-only` - VLAN network without DHCP services
     */
    readonly purpose: pulumi.Output<string>;
    /**
     * The name of the site to associate the network with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The IPv4 subnet for this network in CIDR notation (e.g., '192.168.1.0/24'). This defines the network's address space and determines the range of IP addresses available for DHCP.
     */
    readonly subnet: pulumi.Output<string | undefined>;
    /**
     * The VLAN ID for this network. Valid range is 0-4096. Common uses:
     * * 1-4094: Standard VLAN range for network segmentation
     * * 0: Untagged/native VLAN
     * * >4094: Reserved for special purposes
     */
    readonly vlanId: pulumi.Output<number | undefined>;
    /**
     * The IPv6 prefix size to request from ISP. Must be between 48 and 64.
     * Only applicable when `wan_type_v6` is 'dhcpv6'.
     */
    readonly wanDhcpV6PdSize: pulumi.Output<number | undefined>;
    /**
     * List of IPv4 DNS servers for WAN interface. Examples:
     * * ISP provided DNS servers
     * * Public DNS services (e.g., 8.8.8.8, 1.1.1.1)
     * * Maximum 4 servers can be specified
     */
    readonly wanDns: pulumi.Output<string[] | undefined>;
    /**
     * Quality of Service (QoS) priority for WAN egress traffic (0-7).
     * * 0 (default) - Best effort
     * * 1-4 - Increasing priority
     * * 5-7 - Highest priority, use sparingly
     * Higher values get preferential treatment. Defaults to `0`.
     */
    readonly wanEgressQos: pulumi.Output<number | undefined>;
    /**
     * The IPv4 gateway address for WAN interface.
     * Required when `wan_type` is 'static'.
     * Typically the ISP's router IP address.
     */
    readonly wanGateway: pulumi.Output<string | undefined>;
    /**
     * The IPv6 gateway address for WAN interface.
     * Required when `wan_type_v6` is 'static'.
     * Typically the ISP's router IPv6 address.
     */
    readonly wanGatewayV6: pulumi.Output<string | undefined>;
    /**
     * The static IPv4 address for WAN interface.
     * Required when `wan_type` is 'static'.
     * Must be a valid public IP address assigned by your ISP.
     */
    readonly wanIp: pulumi.Output<string | undefined>;
    /**
     * The static IPv6 address for WAN interface.
     * Required when `wan_type_v6` is 'static'.
     * Must be a valid public IPv6 address assigned by your ISP.
     */
    readonly wanIpv6: pulumi.Output<string | undefined>;
    /**
     * The IPv4 netmask for WAN interface (e.g., '255.255.255.0').
     * Required when `wan_type` is 'static'.
     * Must match the subnet mask provided by your ISP.
     */
    readonly wanNetmask: pulumi.Output<string | undefined>;
    /**
     * The WAN interface group assignment. Options:
     * * `WAN` - Primary WAN interface
     * * `WAN2` - Secondary WAN interface
     * * `WAN_LTE_FAILOVER` - LTE backup connection
     * Used for dual WAN and failover configurations.
     */
    readonly wanNetworkgroup: pulumi.Output<string | undefined>;
    /**
     * The IPv6 prefix length for WAN interface. Must be between 1 and 128.
     * Only applicable when `wan_type_v6` is 'static'.
     */
    readonly wanPrefixlen: pulumi.Output<number | undefined>;
    /**
     * The IPv4 WAN connection type. Options:
     * * `disabled` - WAN interface disabled
     * * `static` - Static IP configuration
     * * `dhcp` - Dynamic IP from ISP
     * * `pppoe` - PPPoE connection (common for DSL)
     * Choose based on your ISP's requirements.
     */
    readonly wanType: pulumi.Output<string | undefined>;
    /**
     * The IPv6 WAN connection type. Options:
     * * `disabled` - IPv6 disabled
     * * `static` - Static IPv6 configuration
     * * `dhcpv6` - Dynamic IPv6 from ISP
     * Choose based on your ISP's requirements.
     */
    readonly wanTypeV6: pulumi.Output<string | undefined>;
    /**
     * Username for WAN authentication.
     * * Required for PPPoE connections
     * * May be needed for some ISP configurations
     * * Cannot contain spaces or special characters
     */
    readonly wanUsername: pulumi.Output<string | undefined>;
    /**
     * Password for WAN authentication.
     * * Required for PPPoE connections
     * * May be needed for some ISP configurations
     * * Must be kept secret
     */
    readonly xWanPassword: pulumi.Output<string | undefined>;
    /**
     * Create a Network resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: NetworkArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Network resources.
 */
export interface NetworkState {
    /**
     * List of IPv4 DNS server addresses to be provided to DHCP clients. Examples:
     * * Use ['8.8.8.8', '8.8.4.4'] for Google DNS
     * * Use ['1.1.1.1', '1.0.0.1'] for Cloudflare DNS
     * * Use internal DNS servers for corporate networks
     * Maximum 4 servers can be specified.
     */
    dhcpDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Controls whether DHCP server is enabled for this network. When enabled:
     * * The network will automatically assign IP addresses to clients
     * * DHCP options (DNS, lease time) will be provided to clients
     * * Static IP assignments can still be made outside the DHCP range
     */
    dhcpEnabled?: pulumi.Input<boolean>;
    /**
     * The DHCP lease time in seconds. Common values:
     * * 86400 (1 day) - Default, suitable for most networks
     * * 3600 (1 hour) - For testing or temporary networks
     * * 604800 (1 week) - For stable networks with static clients
     * * 2592000 (30 days) - For very stable networks Defaults to `86400`.
     */
    dhcpLease?: pulumi.Input<number>;
    /**
     * Enables DHCP relay for this network. When enabled:
     * * DHCP requests are forwarded to an external DHCP server
     * * Local DHCP server is disabled
     * * Useful for centralized DHCP management
     */
    dhcpRelayEnabled?: pulumi.Input<boolean>;
    /**
     * The starting IPv4 address of the DHCP range. Examples:
     * * For subnet 192.168.1.0/24, typical start: '192.168.1.100'
     * * For subnet 10.0.0.0/24, typical start: '10.0.0.100'
     * Ensure this address is within the network's subnet.
     */
    dhcpStart?: pulumi.Input<string>;
    /**
     * The ending IPv4 address of the DHCP range. Examples:
     * * For subnet 192.168.1.0/24, typical stop: '192.168.1.254'
     * * For subnet 10.0.0.0/24, typical stop: '10.0.0.254'
     * Must be greater than dhcp_start and within the network's subnet.
     */
    dhcpStop?: pulumi.Input<string>;
    /**
     * List of IPv6 DNS server addresses for DHCPv6 clients. Examples:
     * * Use ['2001:4860:4860::8888', '2001:4860:4860::8844'] for Google DNS
     * * Use ['2606:4700:4700::1111', '2606:4700:4700::1001'] for Cloudflare DNS
     * Only used when dhcp_v6_dns_auto is false. Maximum of 4 addresses are allowed.
     */
    dhcpV6Dns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Controls DNS server source for DHCPv6 clients:
     * * true - Use upstream DNS servers (recommended)
     * * false - Use manually specified servers from dhcp_v6_dns
     * Default is true for easier management. Defaults to `true`.
     */
    dhcpV6DnsAuto?: pulumi.Input<boolean>;
    /**
     * Enables stateful DHCPv6 for IPv6 address assignment. When enabled:
     * * Provides IPv6 addresses to clients
     * * Works alongside SLAAC if configured
     * * Allows for more controlled IPv6 addressing
     */
    dhcpV6Enabled?: pulumi.Input<boolean>;
    /**
     * The DHCPv6 lease time in seconds. Common values:
     * * 86400 (1 day) - Default setting
     * * 3600 (1 hour) - For testing
     * * 604800 (1 week) - For stable networks
     * Typically longer than IPv4 DHCP leases. Defaults to `86400`.
     */
    dhcpV6Lease?: pulumi.Input<number>;
    /**
     * The starting IPv6 address for the DHCPv6 range. Used in static DHCPv6 configuration.
     * Must be a valid IPv6 address within your allocated IPv6 subnet.
     */
    dhcpV6Start?: pulumi.Input<string>;
    /**
     * The ending IPv6 address for the DHCPv6 range. Used in static DHCPv6 configuration.
     * Must be after dhcp_v6_start in the IPv6 address space.
     */
    dhcpV6Stop?: pulumi.Input<string>;
    /**
     * Enables DHCP boot options for PXE boot or network boot configurations. When enabled:
     * * Allows network devices to boot from a TFTP server
     * * Requires dhcpd_boot_server and dhcpd_boot_filename to be set
     * * Commonly used for diskless workstations or network installations
     */
    dhcpdBootEnabled?: pulumi.Input<boolean>;
    /**
     * The boot filename to be loaded from the TFTP server. Examples:
     * * 'pxelinux.0' - Standard PXE boot loader
     * * 'undionly.kpxe' - iPXE boot loader
     * * Custom paths for specific boot images
     */
    dhcpdBootFilename?: pulumi.Input<string>;
    /**
     * The IPv4 address of the TFTP server for network boot. This setting:
     * * Is required when dhcpd_boot_enabled is true
     * * Should be a reliable, always-on server
     * * Must be accessible to all clients that need to boot
     */
    dhcpdBootServer?: pulumi.Input<string>;
    /**
     * The domain name for this network. Examples:
     * * 'corp.example.com' - For corporate networks
     * * 'guest.example.com' - For guest networks
     * * 'iot.example.com' - For IoT networks
     * Used for internal DNS resolution and DHCP options.
     */
    domainName?: pulumi.Input<string>;
    /**
     * Controls whether this network is active. When disabled:
     * * Network will not be available to clients
     * * DHCP services will be stopped
     * * Existing clients will be disconnected
     * Useful for temporary network maintenance or security measures. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Enables IGMP (Internet Group Management Protocol) snooping. When enabled:
     * * Optimizes multicast traffic flow
     * * Reduces network congestion
     * * Improves performance for multicast applications (e.g., IPTV)
     * Recommended for networks with multicast traffic.
     */
    igmpSnooping?: pulumi.Input<boolean>;
    /**
     * Controls internet access for this network. When disabled:
     * * Clients cannot access external networks
     * * Internal network access remains available
     * * Useful for creating isolated or secure networks Defaults to `true`.
     */
    internetAccessEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the IPv6 connection type. Must be one of:
     * * `none` - IPv6 disabled (default)
     * * `static` - Static IPv6 addressing
     * * `pd` - Prefix Delegation from upstream
     *
     * Choose based on your IPv6 deployment strategy and ISP capabilities. Defaults to `none`.
     */
    ipv6InterfaceType?: pulumi.Input<string>;
    /**
     * The WAN interface to use for IPv6 Prefix Delegation. Options:
     * * `wan` - Primary WAN interface
     * * `wan2` - Secondary WAN interface
     * Only applicable when `ipv6_interface_type` is 'pd'.
     */
    ipv6PdInterface?: pulumi.Input<string>;
    /**
     * The IPv6 Prefix ID for Prefix Delegation. Used to:
     * * Differentiate multiple delegated prefixes
     * * Create unique subnets from the delegated prefix
     * Typically a hexadecimal value (e.g., '0', '1', 'a1').
     */
    ipv6PdPrefixid?: pulumi.Input<string>;
    /**
     * The starting IPv6 address for Prefix Delegation range.
     * Only used when `ipv6_interface_type` is 'pd'.
     * Must be within the delegated prefix range.
     */
    ipv6PdStart?: pulumi.Input<string>;
    /**
     * The ending IPv6 address for Prefix Delegation range.
     * Only used when `ipv6_interface_type` is 'pd'.
     * Must be after `ipv6_pd_start` within the delegated prefix.
     */
    ipv6PdStop?: pulumi.Input<string>;
    /**
     * Enables IPv6 Router Advertisements (RA). When enabled:
     * * Announces IPv6 prefix information to clients
     * * Enables SLAAC address configuration
     * * Required for most IPv6 deployments
     */
    ipv6RaEnable?: pulumi.Input<boolean>;
    /**
     * The preferred lifetime (in seconds) for IPv6 addresses in Router Advertisements.
     * * Must be less than or equal to `ipv6_ra_valid_lifetime`
     * * Default: 14400 (4 hours)
     * * After this time, addresses become deprecated but still usable Defaults to `14400`.
     */
    ipv6RaPreferredLifetime?: pulumi.Input<number>;
    /**
     * Sets the priority for IPv6 Router Advertisements. Options:
     * * `high` - Preferred for primary networks
     * * `medium` - Standard priority
     * * `low` - For backup or secondary networks
     * Affects router selection when multiple IPv6 routers exist.
     */
    ipv6RaPriority?: pulumi.Input<string>;
    /**
     * The valid lifetime (in seconds) for IPv6 addresses in Router Advertisements.
     * * Must be greater than or equal to `ipv6_ra_preferred_lifetime`
     * * Default: 86400 (24 hours)
     * * After this time, addresses become invalid Defaults to `86400`.
     */
    ipv6RaValidLifetime?: pulumi.Input<number>;
    /**
     * The static IPv6 subnet in CIDR notation (e.g., '2001:db8::/64') when using static IPv6.
     * Only applicable when `ipv6_interface_type` is 'static'.
     * Must be a valid IPv6 subnet allocated to your organization.
     */
    ipv6StaticSubnet?: pulumi.Input<string>;
    /**
     * Enables Multicast DNS (mDNS/Bonjour/Avahi) on the network. When enabled:
     * * Allows device discovery (e.g., printers, Chromecasts)
     * * Supports zero-configuration networking
     * * Available on Controller version 7 and later
     */
    multicastDns?: pulumi.Input<boolean>;
    /**
     * The name of the network. This should be a descriptive name that helps identify the network's purpose, such as 'Corporate-Main', 'Guest-Network', or 'IoT-VLAN'.
     */
    name?: pulumi.Input<string>;
    /**
     * The network group for this network. Default is 'LAN'. For WAN networks, use 'WAN' or 'WAN2'. Network groups help organize and apply policies to multiple networks. Defaults to `LAN`.
     */
    networkGroup?: pulumi.Input<string>;
    /**
     * Enables network isolation. When enabled:
     * * Prevents communication between clients on this network
     * * Each client can only communicate with the gateway
     * * Commonly used for guest networks or IoT devices Defaults to `false`.
     */
    networkIsolationEnabled?: pulumi.Input<boolean>;
    /**
     * The purpose/type of the network. Must be one of:
     * * `corporate` - Standard network for corporate use with full access
     * * `guest` - Isolated network for guest access with limited permissions
     * * `wan` - External network connection (WAN uplink)
     * * `vlan-only` - VLAN network without DHCP services
     */
    purpose?: pulumi.Input<string>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string>;
    /**
     * The IPv4 subnet for this network in CIDR notation (e.g., '192.168.1.0/24'). This defines the network's address space and determines the range of IP addresses available for DHCP.
     */
    subnet?: pulumi.Input<string>;
    /**
     * The VLAN ID for this network. Valid range is 0-4096. Common uses:
     * * 1-4094: Standard VLAN range for network segmentation
     * * 0: Untagged/native VLAN
     * * >4094: Reserved for special purposes
     */
    vlanId?: pulumi.Input<number>;
    /**
     * The IPv6 prefix size to request from ISP. Must be between 48 and 64.
     * Only applicable when `wan_type_v6` is 'dhcpv6'.
     */
    wanDhcpV6PdSize?: pulumi.Input<number>;
    /**
     * List of IPv4 DNS servers for WAN interface. Examples:
     * * ISP provided DNS servers
     * * Public DNS services (e.g., 8.8.8.8, 1.1.1.1)
     * * Maximum 4 servers can be specified
     */
    wanDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Quality of Service (QoS) priority for WAN egress traffic (0-7).
     * * 0 (default) - Best effort
     * * 1-4 - Increasing priority
     * * 5-7 - Highest priority, use sparingly
     * Higher values get preferential treatment. Defaults to `0`.
     */
    wanEgressQos?: pulumi.Input<number>;
    /**
     * The IPv4 gateway address for WAN interface.
     * Required when `wan_type` is 'static'.
     * Typically the ISP's router IP address.
     */
    wanGateway?: pulumi.Input<string>;
    /**
     * The IPv6 gateway address for WAN interface.
     * Required when `wan_type_v6` is 'static'.
     * Typically the ISP's router IPv6 address.
     */
    wanGatewayV6?: pulumi.Input<string>;
    /**
     * The static IPv4 address for WAN interface.
     * Required when `wan_type` is 'static'.
     * Must be a valid public IP address assigned by your ISP.
     */
    wanIp?: pulumi.Input<string>;
    /**
     * The static IPv6 address for WAN interface.
     * Required when `wan_type_v6` is 'static'.
     * Must be a valid public IPv6 address assigned by your ISP.
     */
    wanIpv6?: pulumi.Input<string>;
    /**
     * The IPv4 netmask for WAN interface (e.g., '255.255.255.0').
     * Required when `wan_type` is 'static'.
     * Must match the subnet mask provided by your ISP.
     */
    wanNetmask?: pulumi.Input<string>;
    /**
     * The WAN interface group assignment. Options:
     * * `WAN` - Primary WAN interface
     * * `WAN2` - Secondary WAN interface
     * * `WAN_LTE_FAILOVER` - LTE backup connection
     * Used for dual WAN and failover configurations.
     */
    wanNetworkgroup?: pulumi.Input<string>;
    /**
     * The IPv6 prefix length for WAN interface. Must be between 1 and 128.
     * Only applicable when `wan_type_v6` is 'static'.
     */
    wanPrefixlen?: pulumi.Input<number>;
    /**
     * The IPv4 WAN connection type. Options:
     * * `disabled` - WAN interface disabled
     * * `static` - Static IP configuration
     * * `dhcp` - Dynamic IP from ISP
     * * `pppoe` - PPPoE connection (common for DSL)
     * Choose based on your ISP's requirements.
     */
    wanType?: pulumi.Input<string>;
    /**
     * The IPv6 WAN connection type. Options:
     * * `disabled` - IPv6 disabled
     * * `static` - Static IPv6 configuration
     * * `dhcpv6` - Dynamic IPv6 from ISP
     * Choose based on your ISP's requirements.
     */
    wanTypeV6?: pulumi.Input<string>;
    /**
     * Username for WAN authentication.
     * * Required for PPPoE connections
     * * May be needed for some ISP configurations
     * * Cannot contain spaces or special characters
     */
    wanUsername?: pulumi.Input<string>;
    /**
     * Password for WAN authentication.
     * * Required for PPPoE connections
     * * May be needed for some ISP configurations
     * * Must be kept secret
     */
    xWanPassword?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Network resource.
 */
export interface NetworkArgs {
    /**
     * List of IPv4 DNS server addresses to be provided to DHCP clients. Examples:
     * * Use ['8.8.8.8', '8.8.4.4'] for Google DNS
     * * Use ['1.1.1.1', '1.0.0.1'] for Cloudflare DNS
     * * Use internal DNS servers for corporate networks
     * Maximum 4 servers can be specified.
     */
    dhcpDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Controls whether DHCP server is enabled for this network. When enabled:
     * * The network will automatically assign IP addresses to clients
     * * DHCP options (DNS, lease time) will be provided to clients
     * * Static IP assignments can still be made outside the DHCP range
     */
    dhcpEnabled?: pulumi.Input<boolean>;
    /**
     * The DHCP lease time in seconds. Common values:
     * * 86400 (1 day) - Default, suitable for most networks
     * * 3600 (1 hour) - For testing or temporary networks
     * * 604800 (1 week) - For stable networks with static clients
     * * 2592000 (30 days) - For very stable networks Defaults to `86400`.
     */
    dhcpLease?: pulumi.Input<number>;
    /**
     * Enables DHCP relay for this network. When enabled:
     * * DHCP requests are forwarded to an external DHCP server
     * * Local DHCP server is disabled
     * * Useful for centralized DHCP management
     */
    dhcpRelayEnabled?: pulumi.Input<boolean>;
    /**
     * The starting IPv4 address of the DHCP range. Examples:
     * * For subnet 192.168.1.0/24, typical start: '192.168.1.100'
     * * For subnet 10.0.0.0/24, typical start: '10.0.0.100'
     * Ensure this address is within the network's subnet.
     */
    dhcpStart?: pulumi.Input<string>;
    /**
     * The ending IPv4 address of the DHCP range. Examples:
     * * For subnet 192.168.1.0/24, typical stop: '192.168.1.254'
     * * For subnet 10.0.0.0/24, typical stop: '10.0.0.254'
     * Must be greater than dhcp_start and within the network's subnet.
     */
    dhcpStop?: pulumi.Input<string>;
    /**
     * List of IPv6 DNS server addresses for DHCPv6 clients. Examples:
     * * Use ['2001:4860:4860::8888', '2001:4860:4860::8844'] for Google DNS
     * * Use ['2606:4700:4700::1111', '2606:4700:4700::1001'] for Cloudflare DNS
     * Only used when dhcp_v6_dns_auto is false. Maximum of 4 addresses are allowed.
     */
    dhcpV6Dns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Controls DNS server source for DHCPv6 clients:
     * * true - Use upstream DNS servers (recommended)
     * * false - Use manually specified servers from dhcp_v6_dns
     * Default is true for easier management. Defaults to `true`.
     */
    dhcpV6DnsAuto?: pulumi.Input<boolean>;
    /**
     * Enables stateful DHCPv6 for IPv6 address assignment. When enabled:
     * * Provides IPv6 addresses to clients
     * * Works alongside SLAAC if configured
     * * Allows for more controlled IPv6 addressing
     */
    dhcpV6Enabled?: pulumi.Input<boolean>;
    /**
     * The DHCPv6 lease time in seconds. Common values:
     * * 86400 (1 day) - Default setting
     * * 3600 (1 hour) - For testing
     * * 604800 (1 week) - For stable networks
     * Typically longer than IPv4 DHCP leases. Defaults to `86400`.
     */
    dhcpV6Lease?: pulumi.Input<number>;
    /**
     * The starting IPv6 address for the DHCPv6 range. Used in static DHCPv6 configuration.
     * Must be a valid IPv6 address within your allocated IPv6 subnet.
     */
    dhcpV6Start?: pulumi.Input<string>;
    /**
     * The ending IPv6 address for the DHCPv6 range. Used in static DHCPv6 configuration.
     * Must be after dhcp_v6_start in the IPv6 address space.
     */
    dhcpV6Stop?: pulumi.Input<string>;
    /**
     * Enables DHCP boot options for PXE boot or network boot configurations. When enabled:
     * * Allows network devices to boot from a TFTP server
     * * Requires dhcpd_boot_server and dhcpd_boot_filename to be set
     * * Commonly used for diskless workstations or network installations
     */
    dhcpdBootEnabled?: pulumi.Input<boolean>;
    /**
     * The boot filename to be loaded from the TFTP server. Examples:
     * * 'pxelinux.0' - Standard PXE boot loader
     * * 'undionly.kpxe' - iPXE boot loader
     * * Custom paths for specific boot images
     */
    dhcpdBootFilename?: pulumi.Input<string>;
    /**
     * The IPv4 address of the TFTP server for network boot. This setting:
     * * Is required when dhcpd_boot_enabled is true
     * * Should be a reliable, always-on server
     * * Must be accessible to all clients that need to boot
     */
    dhcpdBootServer?: pulumi.Input<string>;
    /**
     * The domain name for this network. Examples:
     * * 'corp.example.com' - For corporate networks
     * * 'guest.example.com' - For guest networks
     * * 'iot.example.com' - For IoT networks
     * Used for internal DNS resolution and DHCP options.
     */
    domainName?: pulumi.Input<string>;
    /**
     * Controls whether this network is active. When disabled:
     * * Network will not be available to clients
     * * DHCP services will be stopped
     * * Existing clients will be disconnected
     * Useful for temporary network maintenance or security measures. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Enables IGMP (Internet Group Management Protocol) snooping. When enabled:
     * * Optimizes multicast traffic flow
     * * Reduces network congestion
     * * Improves performance for multicast applications (e.g., IPTV)
     * Recommended for networks with multicast traffic.
     */
    igmpSnooping?: pulumi.Input<boolean>;
    /**
     * Controls internet access for this network. When disabled:
     * * Clients cannot access external networks
     * * Internal network access remains available
     * * Useful for creating isolated or secure networks Defaults to `true`.
     */
    internetAccessEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the IPv6 connection type. Must be one of:
     * * `none` - IPv6 disabled (default)
     * * `static` - Static IPv6 addressing
     * * `pd` - Prefix Delegation from upstream
     *
     * Choose based on your IPv6 deployment strategy and ISP capabilities. Defaults to `none`.
     */
    ipv6InterfaceType?: pulumi.Input<string>;
    /**
     * The WAN interface to use for IPv6 Prefix Delegation. Options:
     * * `wan` - Primary WAN interface
     * * `wan2` - Secondary WAN interface
     * Only applicable when `ipv6_interface_type` is 'pd'.
     */
    ipv6PdInterface?: pulumi.Input<string>;
    /**
     * The IPv6 Prefix ID for Prefix Delegation. Used to:
     * * Differentiate multiple delegated prefixes
     * * Create unique subnets from the delegated prefix
     * Typically a hexadecimal value (e.g., '0', '1', 'a1').
     */
    ipv6PdPrefixid?: pulumi.Input<string>;
    /**
     * The starting IPv6 address for Prefix Delegation range.
     * Only used when `ipv6_interface_type` is 'pd'.
     * Must be within the delegated prefix range.
     */
    ipv6PdStart?: pulumi.Input<string>;
    /**
     * The ending IPv6 address for Prefix Delegation range.
     * Only used when `ipv6_interface_type` is 'pd'.
     * Must be after `ipv6_pd_start` within the delegated prefix.
     */
    ipv6PdStop?: pulumi.Input<string>;
    /**
     * Enables IPv6 Router Advertisements (RA). When enabled:
     * * Announces IPv6 prefix information to clients
     * * Enables SLAAC address configuration
     * * Required for most IPv6 deployments
     */
    ipv6RaEnable?: pulumi.Input<boolean>;
    /**
     * The preferred lifetime (in seconds) for IPv6 addresses in Router Advertisements.
     * * Must be less than or equal to `ipv6_ra_valid_lifetime`
     * * Default: 14400 (4 hours)
     * * After this time, addresses become deprecated but still usable Defaults to `14400`.
     */
    ipv6RaPreferredLifetime?: pulumi.Input<number>;
    /**
     * Sets the priority for IPv6 Router Advertisements. Options:
     * * `high` - Preferred for primary networks
     * * `medium` - Standard priority
     * * `low` - For backup or secondary networks
     * Affects router selection when multiple IPv6 routers exist.
     */
    ipv6RaPriority?: pulumi.Input<string>;
    /**
     * The valid lifetime (in seconds) for IPv6 addresses in Router Advertisements.
     * * Must be greater than or equal to `ipv6_ra_preferred_lifetime`
     * * Default: 86400 (24 hours)
     * * After this time, addresses become invalid Defaults to `86400`.
     */
    ipv6RaValidLifetime?: pulumi.Input<number>;
    /**
     * The static IPv6 subnet in CIDR notation (e.g., '2001:db8::/64') when using static IPv6.
     * Only applicable when `ipv6_interface_type` is 'static'.
     * Must be a valid IPv6 subnet allocated to your organization.
     */
    ipv6StaticSubnet?: pulumi.Input<string>;
    /**
     * Enables Multicast DNS (mDNS/Bonjour/Avahi) on the network. When enabled:
     * * Allows device discovery (e.g., printers, Chromecasts)
     * * Supports zero-configuration networking
     * * Available on Controller version 7 and later
     */
    multicastDns?: pulumi.Input<boolean>;
    /**
     * The name of the network. This should be a descriptive name that helps identify the network's purpose, such as 'Corporate-Main', 'Guest-Network', or 'IoT-VLAN'.
     */
    name?: pulumi.Input<string>;
    /**
     * The network group for this network. Default is 'LAN'. For WAN networks, use 'WAN' or 'WAN2'. Network groups help organize and apply policies to multiple networks. Defaults to `LAN`.
     */
    networkGroup?: pulumi.Input<string>;
    /**
     * Enables network isolation. When enabled:
     * * Prevents communication between clients on this network
     * * Each client can only communicate with the gateway
     * * Commonly used for guest networks or IoT devices Defaults to `false`.
     */
    networkIsolationEnabled?: pulumi.Input<boolean>;
    /**
     * The purpose/type of the network. Must be one of:
     * * `corporate` - Standard network for corporate use with full access
     * * `guest` - Isolated network for guest access with limited permissions
     * * `wan` - External network connection (WAN uplink)
     * * `vlan-only` - VLAN network without DHCP services
     */
    purpose: pulumi.Input<string>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string>;
    /**
     * The IPv4 subnet for this network in CIDR notation (e.g., '192.168.1.0/24'). This defines the network's address space and determines the range of IP addresses available for DHCP.
     */
    subnet?: pulumi.Input<string>;
    /**
     * The VLAN ID for this network. Valid range is 0-4096. Common uses:
     * * 1-4094: Standard VLAN range for network segmentation
     * * 0: Untagged/native VLAN
     * * >4094: Reserved for special purposes
     */
    vlanId?: pulumi.Input<number>;
    /**
     * The IPv6 prefix size to request from ISP. Must be between 48 and 64.
     * Only applicable when `wan_type_v6` is 'dhcpv6'.
     */
    wanDhcpV6PdSize?: pulumi.Input<number>;
    /**
     * List of IPv4 DNS servers for WAN interface. Examples:
     * * ISP provided DNS servers
     * * Public DNS services (e.g., 8.8.8.8, 1.1.1.1)
     * * Maximum 4 servers can be specified
     */
    wanDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Quality of Service (QoS) priority for WAN egress traffic (0-7).
     * * 0 (default) - Best effort
     * * 1-4 - Increasing priority
     * * 5-7 - Highest priority, use sparingly
     * Higher values get preferential treatment. Defaults to `0`.
     */
    wanEgressQos?: pulumi.Input<number>;
    /**
     * The IPv4 gateway address for WAN interface.
     * Required when `wan_type` is 'static'.
     * Typically the ISP's router IP address.
     */
    wanGateway?: pulumi.Input<string>;
    /**
     * The IPv6 gateway address for WAN interface.
     * Required when `wan_type_v6` is 'static'.
     * Typically the ISP's router IPv6 address.
     */
    wanGatewayV6?: pulumi.Input<string>;
    /**
     * The static IPv4 address for WAN interface.
     * Required when `wan_type` is 'static'.
     * Must be a valid public IP address assigned by your ISP.
     */
    wanIp?: pulumi.Input<string>;
    /**
     * The static IPv6 address for WAN interface.
     * Required when `wan_type_v6` is 'static'.
     * Must be a valid public IPv6 address assigned by your ISP.
     */
    wanIpv6?: pulumi.Input<string>;
    /**
     * The IPv4 netmask for WAN interface (e.g., '255.255.255.0').
     * Required when `wan_type` is 'static'.
     * Must match the subnet mask provided by your ISP.
     */
    wanNetmask?: pulumi.Input<string>;
    /**
     * The WAN interface group assignment. Options:
     * * `WAN` - Primary WAN interface
     * * `WAN2` - Secondary WAN interface
     * * `WAN_LTE_FAILOVER` - LTE backup connection
     * Used for dual WAN and failover configurations.
     */
    wanNetworkgroup?: pulumi.Input<string>;
    /**
     * The IPv6 prefix length for WAN interface. Must be between 1 and 128.
     * Only applicable when `wan_type_v6` is 'static'.
     */
    wanPrefixlen?: pulumi.Input<number>;
    /**
     * The IPv4 WAN connection type. Options:
     * * `disabled` - WAN interface disabled
     * * `static` - Static IP configuration
     * * `dhcp` - Dynamic IP from ISP
     * * `pppoe` - PPPoE connection (common for DSL)
     * Choose based on your ISP's requirements.
     */
    wanType?: pulumi.Input<string>;
    /**
     * The IPv6 WAN connection type. Options:
     * * `disabled` - IPv6 disabled
     * * `static` - Static IPv6 configuration
     * * `dhcpv6` - Dynamic IPv6 from ISP
     * Choose based on your ISP's requirements.
     */
    wanTypeV6?: pulumi.Input<string>;
    /**
     * Username for WAN authentication.
     * * Required for PPPoE connections
     * * May be needed for some ISP configurations
     * * Cannot contain spaces or special characters
     */
    wanUsername?: pulumi.Input<string>;
    /**
     * Password for WAN authentication.
     * * Required for PPPoE connections
     * * May be needed for some ISP configurations
     * * Must be kept secret
     */
    xWanPassword?: pulumi.Input<string>;
}

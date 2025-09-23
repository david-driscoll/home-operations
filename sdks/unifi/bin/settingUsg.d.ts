import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class SettingUsg extends pulumi.CustomResource {
    /**
     * Get an existing SettingUsg resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingUsgState, opts?: pulumi.CustomResourceOptions): SettingUsg;
    /**
     * Returns true if the given object is an instance of SettingUsg.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingUsg;
    /**
     * The base reachable timeout (in seconds) for ARP cache entries. This controls how long the gateway considers a MAC-to-IP mapping valid without needing to refresh it. Higher values reduce network traffic but may cause stale entries if devices change IP addresses frequently.
     */
    readonly arpCacheBaseReachable: pulumi.Output<number>;
    /**
     * The timeout strategy for ARP cache entries. Valid values are:
     *   * `normal` - Use system default timeouts
     *   * `min-dhcp-lease` - Set ARP timeout to match the minimum DHCP lease time
     *   * `custom` - Use the custom timeout value specified in `arp_cache_base_reachable`
     *
     * This setting determines how long MAC-to-IP mappings are stored in the ARP cache before being refreshed.
     */
    readonly arpCacheTimeout: pulumi.Output<string>;
    /**
     * Enable responding to broadcast ping requests (ICMP echo requests sent to the broadcast address). When enabled, the gateway will respond to pings sent to the broadcast address of the network (e.g., 192.168.1.255). This can be useful for network diagnostics but may also be used in certain denial-of-service attacks.
     */
    readonly broadcastPing: pulumi.Output<boolean>;
    /**
     * Advanced DHCP relay configuration settings. Controls how the gateway forwards DHCP requests to external servers and manages DHCP relay agent behavior. Use this block to fine-tune DHCP relay functionality beyond simply specifying relay servers.
     */
    readonly dhcpRelay: pulumi.Output<outputs.SettingUsgDhcpRelay>;
    /**
     * List of up to 5 DHCP relay servers (specified by IP address) that will receive forwarded DHCP requests. This is useful when you want to use external DHCP servers instead of the built-in DHCP server on the USG/UDM. When configured, the gateway will forward DHCP discovery packets from clients to these external servers, allowing centralized IP address management across multiple networks. Example: `['192.168.1.5', '192.168.2.5']`
     *
     * @deprecated Deprecated
     */
    readonly dhcpRelayServers: pulumi.Output<string[]>;
    /**
     * Enable updating the gateway's host files with DHCP client information. When enabled, the gateway will automatically add entries to its host file for each DHCP client, allowing hostname resolution for devices that receive IP addresses via DHCP. This improves name resolution on the local network.
     */
    readonly dhcpdHostfileUpdate: pulumi.Output<boolean>;
    /**
     * Use dnsmasq for DHCP services instead of the default DHCP server. Dnsmasq provides integrated DNS and DHCP functionality with additional features like DNS caching, DHCP static leases, and local domain name resolution. This can improve DNS resolution performance and provide more flexible DHCP options.
     */
    readonly dhcpdUseDnsmasq: pulumi.Output<boolean>;
    /**
     * DNS verification settings for validating DNS responses. This feature helps detect and prevent DNS spoofing attacks by verifying DNS responses against trusted DNS servers. When configured, the gateway can compare DNS responses with those from known trusted servers to identify potential tampering or poisoning attempts. Requires controller version 8.5 or later.
     */
    readonly dnsVerification: pulumi.Output<outputs.SettingUsgDnsVerification>;
    /**
     * When enabled, dnsmasq will query all configured DNS servers simultaneously and use the fastest response. This can improve DNS resolution speed but may increase DNS traffic. By default, dnsmasq queries servers sequentially, only trying the next server if the current one fails to respond.
     */
    readonly dnsmasqAllServers: pulumi.Output<boolean>;
    /**
     * The hostname or IP address of a server to use for network echo tests. Echo tests send packets to this server and measure response times to evaluate network connectivity and performance. This can be used for network diagnostics and monitoring.
     */
    readonly echoServer: pulumi.Output<string>;
    /**
     * Enable the FTP (File Transfer Protocol) helper module. This module allows the gateway to properly handle FTP connections through NAT by tracking the control channel and dynamically opening required data ports. Without this helper, passive FTP connections may fail when clients are behind NAT.
     */
    readonly ftpModule: pulumi.Output<boolean>;
    /**
     * Geographic IP filtering configuration that allows blocking or allowing traffic based on country of origin. This feature uses IP geolocation databases to identify the country associated with IP addresses and apply filtering rules. Useful for implementing country-specific access policies or blocking traffic from high-risk regions. Requires controller version 7.0 or later.
     */
    readonly geoIpFiltering: pulumi.Output<outputs.SettingUsgGeoIpFiltering | undefined>;
    /**
     * Whether Geo IP Filtering is enabled. When enabled, the gateway will apply the specified country-based
     */
    readonly geoIpFilteringEnabled: pulumi.Output<boolean>;
    /**
     * Enable the GRE (Generic Routing Encapsulation) protocol helper module. This module allows proper handling of GRE tunneling protocol through the gateway's firewall. GRE is commonly used for VPN tunnels and other encapsulation needs. Required if you plan to use PPTP VPNs (see `pptp_module`).
     */
    readonly greModule: pulumi.Output<boolean>;
    /**
     * Enable the H.323 protocol helper module. H.323 is a standard for multimedia communications (audio, video, and data) over packet-based networks. This helper allows H.323-based applications like video conferencing systems to work properly through NAT by tracking connection details and opening required ports.
     */
    readonly h323Module: pulumi.Output<boolean>;
    /**
     * ICMP timeout in seconds for connection tracking. This controls how long the gateway maintains state information for ICMP (ping) packets in its connection tracking table. Higher values maintain ICMP connection state longer, while lower values reclaim resources more quickly but may affect some diagnostic tools.
     */
    readonly icmpTimeout: pulumi.Output<number>;
    /**
     * Enable Link Layer Discovery Protocol (LLDP) on all interfaces. LLDP is a vendor-neutral protocol that allows network devices to advertise their identity, capabilities, and neighbors on a local network. When enabled, the gateway will both send and receive LLDP packets, facilitating network discovery and management tools.
     */
    readonly lldpEnableAll: pulumi.Output<boolean>;
    /**
     * TCP Maximum Segment Size (MSS) clamping mode. MSS clamping adjusts the maximum segment size of TCP packets to prevent fragmentation issues when packets traverse networks with different MTU sizes. Valid values include:
     *   * `auto` - Automatically determine appropriate MSS values based on interface MTUs
     *   * `custom` - Use the custom MSS value specified in `mss_clamp_mss`
     *   * `disabled` - Do not perform MSS clamping
     *
     * This setting is particularly important for VPN connections and networks with non-standard MTU sizes.
     */
    readonly mssClamp: pulumi.Output<string>;
    /**
     * Custom TCP Maximum Segment Size (MSS) value in bytes. This value is used when `mss_clamp` is set to `custom`. The MSS value should typically be set to the path MTU minus 40 bytes (for IPv4) or minus 60 bytes (for IPv6) to account for TCP/IP header overhead. Valid values range from 100 to 9999, with common values being 1460 (for standard 1500 MTU) or 1400 (for VPN tunnels).
     */
    readonly mssClampMss: pulumi.Output<number>;
    /**
     * Enable multicast DNS (mDNS/Bonjour/Avahi) forwarding across VLANs. This allows devices to discover services (like printers, Chromecasts, Apple devices, etc.) even when they are on different networks or VLANs. When enabled, the gateway will forward mDNS packets between networks, facilitating cross-VLAN service discovery. Note: This setting is not supported on UniFi OS v7+ as it has been replaced by mDNS settings in the network configuration.
     */
    readonly multicastDnsEnabled: pulumi.Output<boolean>;
    /**
     * Enable hardware accounting offload. When enabled, the gateway will use hardware acceleration for traffic accounting functions, reducing CPU load and potentially improving throughput for high-traffic environments. This setting may not be supported on all hardware models.
     */
    readonly offloadAccounting: pulumi.Output<boolean>;
    /**
     * Enable hardware offload for Layer 2 (L2) blocking functions. When enabled, the gateway will use hardware acceleration for blocking traffic at the data link layer (MAC address level), which can improve performance when implementing MAC-based filtering or isolation. This setting may not be supported on all hardware models.
     */
    readonly offloadL2Blocking: pulumi.Output<boolean>;
    /**
     * Enable hardware scheduling offload. When enabled, the gateway will use hardware acceleration for packet scheduling functions, which can improve QoS (Quality of Service) performance and throughput for prioritized traffic. This setting may not be supported on all hardware models and may affect other hardware offload capabilities.
     */
    readonly offloadSch: pulumi.Output<boolean>;
    /**
     * Timeout (in seconds) for connection tracking of protocols other than TCP, UDP, and ICMP. This controls how long the gateway maintains state information for connections using other protocols. Higher values maintain connection state longer, while lower values reclaim resources more quickly but may affect some applications using non-standard protocols.
     */
    readonly otherTimeout: pulumi.Output<number>;
    /**
     * Enable the PPTP (Point-to-Point Tunneling Protocol) helper module. This module allows PPTP VPN connections to work properly through the gateway's firewall and NAT. PPTP uses GRE for tunneling, so the `gre_module` must also be enabled for PPTP to function correctly. Note that PPTP has known security vulnerabilities and more secure VPN protocols are generally recommended.
     */
    readonly pptpModule: pulumi.Output<boolean>;
    /**
     * Enable accepting ICMP redirect messages. ICMP redirects are messages sent by routers to inform hosts of better routes to specific destinations. When enabled, the gateway will update its routing table based on these messages. While useful for route optimization, this can potentially be exploited for man-in-the-middle attacks, so it's often disabled in security-sensitive environments.
     */
    readonly receiveRedirects: pulumi.Output<boolean>;
    /**
     * Enable sending ICMP redirect messages. When enabled, the gateway will send ICMP redirect messages to hosts on the local network to inform them of better routes to specific destinations. This can help optimize network traffic but is typically only needed when the gateway has multiple interfaces on the same subnet or in complex routing scenarios.
     */
    readonly sendRedirects: pulumi.Output<boolean>;
    /**
     * Enable the SIP (Session Initiation Protocol) helper module. SIP is used for initiating, maintaining, and terminating real-time sessions for voice, video, and messaging applications (VoIP, video conferencing). This helper allows SIP-based applications to work correctly through NAT by tracking SIP connections and dynamically opening the necessary ports for media streams.
     */
    readonly sipModule: pulumi.Output<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Enable SYN cookies to protect against SYN flood attacks. SYN cookies are a technique that helps mitigate TCP SYN flood attacks by avoiding the need to track incomplete connections in a backlog queue. When enabled, the gateway can continue to establish legitimate connections even when under a SYN flood attack. This is a recommended security setting for internet-facing gateways.
     */
    readonly synCookies: pulumi.Output<boolean>;
    /**
     * TCP connection timeout settings for various TCP connection states. These settings control how long the gateway maintains state information for TCP connections in different states before removing them from the connection tracking table. Proper timeout values balance resource usage with connection reliability. These settings are particularly relevant when `timeout_setting_preference` is set to `manual`.
     */
    readonly tcpTimeouts: pulumi.Output<outputs.SettingUsgTcpTimeouts>;
    /**
     * Enable the TFTP (Trivial File Transfer Protocol) helper module. This module allows TFTP connections to work properly through the gateway's firewall and NAT. TFTP is commonly used for firmware updates, configuration file transfers, and network booting of devices. The helper tracks TFTP connections and ensures return traffic is properly handled.
     */
    readonly tftpModule: pulumi.Output<boolean>;
    /**
     * Determines how connection timeout values are configured. Valid values are:
     *   * `auto` - The gateway will automatically determine appropriate timeout values based on system defaults
     *   * `manual` - Use the manually specified timeout values for various connection types
     *
     * When set to `manual`, you should specify values for the various timeout settings like `tcp_timeouts`, `udp_stream_timeout`, `udp_other_timeout`, `icmp_timeout`, and `other_timeout`. Requires controller version 7.0 or later.
     */
    readonly timeoutSettingPreference: pulumi.Output<string>;
    /**
     * Timeout (in seconds) for general UDP connections. Since UDP is connectionless, this timeout determines how long the gateway maintains state information for UDP packets that don't match the criteria for stream connections. This applies to most short-lived UDP communications like DNS queries. Lower values free resources more quickly but may affect some applications that expect longer session persistence.
     */
    readonly udpOtherTimeout: pulumi.Output<number>;
    /**
     * Timeout (in seconds) for UDP stream connections. This applies to UDP traffic patterns that resemble ongoing streams, such as VoIP calls, video streaming, or online gaming. The gateway identifies these based on traffic patterns and maintains state information longer than for regular UDP traffic. Higher values improve reliability for streaming applications but consume more connection tracking resources.
     */
    readonly udpStreamTimeout: pulumi.Output<number>;
    /**
     * Unbind WAN monitors to prevent unnecessary traffic. When enabled, the gateway will stop certain monitoring processes that periodically check WAN connectivity. This can reduce unnecessary traffic on metered connections or in environments where the monitoring traffic might trigger security alerts. However, disabling these monitors may affect the gateway's ability to detect and respond to WAN connectivity issues. Requires controller version 9.0 or later.
     */
    readonly unbindWanMonitors: pulumi.Output<boolean>;
    /**
     * UPNP (Universal Plug and Play) configuration settings. UPNP allows compatible applications and devices to automatically configure port forwarding rules on the gateway without manual intervention. This is commonly used by gaming consoles, media servers, VoIP applications, and other network services that require incoming connections.
     */
    readonly upnp: pulumi.Output<outputs.SettingUsgUpnp | undefined>;
    /**
     * Whether UPNP is enabled. When enabled, the gateway will automatically forward ports for UPNP-compatible devices
     */
    readonly upnpEnabled: pulumi.Output<boolean>;
    /**
     * Create a SettingUsg resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingUsgArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingUsg resources.
 */
export interface SettingUsgState {
    /**
     * The base reachable timeout (in seconds) for ARP cache entries. This controls how long the gateway considers a MAC-to-IP mapping valid without needing to refresh it. Higher values reduce network traffic but may cause stale entries if devices change IP addresses frequently.
     */
    arpCacheBaseReachable?: pulumi.Input<number>;
    /**
     * The timeout strategy for ARP cache entries. Valid values are:
     *   * `normal` - Use system default timeouts
     *   * `min-dhcp-lease` - Set ARP timeout to match the minimum DHCP lease time
     *   * `custom` - Use the custom timeout value specified in `arp_cache_base_reachable`
     *
     * This setting determines how long MAC-to-IP mappings are stored in the ARP cache before being refreshed.
     */
    arpCacheTimeout?: pulumi.Input<string>;
    /**
     * Enable responding to broadcast ping requests (ICMP echo requests sent to the broadcast address). When enabled, the gateway will respond to pings sent to the broadcast address of the network (e.g., 192.168.1.255). This can be useful for network diagnostics but may also be used in certain denial-of-service attacks.
     */
    broadcastPing?: pulumi.Input<boolean>;
    /**
     * Advanced DHCP relay configuration settings. Controls how the gateway forwards DHCP requests to external servers and manages DHCP relay agent behavior. Use this block to fine-tune DHCP relay functionality beyond simply specifying relay servers.
     */
    dhcpRelay?: pulumi.Input<inputs.SettingUsgDhcpRelay>;
    /**
     * List of up to 5 DHCP relay servers (specified by IP address) that will receive forwarded DHCP requests. This is useful when you want to use external DHCP servers instead of the built-in DHCP server on the USG/UDM. When configured, the gateway will forward DHCP discovery packets from clients to these external servers, allowing centralized IP address management across multiple networks. Example: `['192.168.1.5', '192.168.2.5']`
     *
     * @deprecated Deprecated
     */
    dhcpRelayServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Enable updating the gateway's host files with DHCP client information. When enabled, the gateway will automatically add entries to its host file for each DHCP client, allowing hostname resolution for devices that receive IP addresses via DHCP. This improves name resolution on the local network.
     */
    dhcpdHostfileUpdate?: pulumi.Input<boolean>;
    /**
     * Use dnsmasq for DHCP services instead of the default DHCP server. Dnsmasq provides integrated DNS and DHCP functionality with additional features like DNS caching, DHCP static leases, and local domain name resolution. This can improve DNS resolution performance and provide more flexible DHCP options.
     */
    dhcpdUseDnsmasq?: pulumi.Input<boolean>;
    /**
     * DNS verification settings for validating DNS responses. This feature helps detect and prevent DNS spoofing attacks by verifying DNS responses against trusted DNS servers. When configured, the gateway can compare DNS responses with those from known trusted servers to identify potential tampering or poisoning attempts. Requires controller version 8.5 or later.
     */
    dnsVerification?: pulumi.Input<inputs.SettingUsgDnsVerification>;
    /**
     * When enabled, dnsmasq will query all configured DNS servers simultaneously and use the fastest response. This can improve DNS resolution speed but may increase DNS traffic. By default, dnsmasq queries servers sequentially, only trying the next server if the current one fails to respond.
     */
    dnsmasqAllServers?: pulumi.Input<boolean>;
    /**
     * The hostname or IP address of a server to use for network echo tests. Echo tests send packets to this server and measure response times to evaluate network connectivity and performance. This can be used for network diagnostics and monitoring.
     */
    echoServer?: pulumi.Input<string>;
    /**
     * Enable the FTP (File Transfer Protocol) helper module. This module allows the gateway to properly handle FTP connections through NAT by tracking the control channel and dynamically opening required data ports. Without this helper, passive FTP connections may fail when clients are behind NAT.
     */
    ftpModule?: pulumi.Input<boolean>;
    /**
     * Geographic IP filtering configuration that allows blocking or allowing traffic based on country of origin. This feature uses IP geolocation databases to identify the country associated with IP addresses and apply filtering rules. Useful for implementing country-specific access policies or blocking traffic from high-risk regions. Requires controller version 7.0 or later.
     */
    geoIpFiltering?: pulumi.Input<inputs.SettingUsgGeoIpFiltering>;
    /**
     * Whether Geo IP Filtering is enabled. When enabled, the gateway will apply the specified country-based
     */
    geoIpFilteringEnabled?: pulumi.Input<boolean>;
    /**
     * Enable the GRE (Generic Routing Encapsulation) protocol helper module. This module allows proper handling of GRE tunneling protocol through the gateway's firewall. GRE is commonly used for VPN tunnels and other encapsulation needs. Required if you plan to use PPTP VPNs (see `pptp_module`).
     */
    greModule?: pulumi.Input<boolean>;
    /**
     * Enable the H.323 protocol helper module. H.323 is a standard for multimedia communications (audio, video, and data) over packet-based networks. This helper allows H.323-based applications like video conferencing systems to work properly through NAT by tracking connection details and opening required ports.
     */
    h323Module?: pulumi.Input<boolean>;
    /**
     * ICMP timeout in seconds for connection tracking. This controls how long the gateway maintains state information for ICMP (ping) packets in its connection tracking table. Higher values maintain ICMP connection state longer, while lower values reclaim resources more quickly but may affect some diagnostic tools.
     */
    icmpTimeout?: pulumi.Input<number>;
    /**
     * Enable Link Layer Discovery Protocol (LLDP) on all interfaces. LLDP is a vendor-neutral protocol that allows network devices to advertise their identity, capabilities, and neighbors on a local network. When enabled, the gateway will both send and receive LLDP packets, facilitating network discovery and management tools.
     */
    lldpEnableAll?: pulumi.Input<boolean>;
    /**
     * TCP Maximum Segment Size (MSS) clamping mode. MSS clamping adjusts the maximum segment size of TCP packets to prevent fragmentation issues when packets traverse networks with different MTU sizes. Valid values include:
     *   * `auto` - Automatically determine appropriate MSS values based on interface MTUs
     *   * `custom` - Use the custom MSS value specified in `mss_clamp_mss`
     *   * `disabled` - Do not perform MSS clamping
     *
     * This setting is particularly important for VPN connections and networks with non-standard MTU sizes.
     */
    mssClamp?: pulumi.Input<string>;
    /**
     * Custom TCP Maximum Segment Size (MSS) value in bytes. This value is used when `mss_clamp` is set to `custom`. The MSS value should typically be set to the path MTU minus 40 bytes (for IPv4) or minus 60 bytes (for IPv6) to account for TCP/IP header overhead. Valid values range from 100 to 9999, with common values being 1460 (for standard 1500 MTU) or 1400 (for VPN tunnels).
     */
    mssClampMss?: pulumi.Input<number>;
    /**
     * Enable multicast DNS (mDNS/Bonjour/Avahi) forwarding across VLANs. This allows devices to discover services (like printers, Chromecasts, Apple devices, etc.) even when they are on different networks or VLANs. When enabled, the gateway will forward mDNS packets between networks, facilitating cross-VLAN service discovery. Note: This setting is not supported on UniFi OS v7+ as it has been replaced by mDNS settings in the network configuration.
     */
    multicastDnsEnabled?: pulumi.Input<boolean>;
    /**
     * Enable hardware accounting offload. When enabled, the gateway will use hardware acceleration for traffic accounting functions, reducing CPU load and potentially improving throughput for high-traffic environments. This setting may not be supported on all hardware models.
     */
    offloadAccounting?: pulumi.Input<boolean>;
    /**
     * Enable hardware offload for Layer 2 (L2) blocking functions. When enabled, the gateway will use hardware acceleration for blocking traffic at the data link layer (MAC address level), which can improve performance when implementing MAC-based filtering or isolation. This setting may not be supported on all hardware models.
     */
    offloadL2Blocking?: pulumi.Input<boolean>;
    /**
     * Enable hardware scheduling offload. When enabled, the gateway will use hardware acceleration for packet scheduling functions, which can improve QoS (Quality of Service) performance and throughput for prioritized traffic. This setting may not be supported on all hardware models and may affect other hardware offload capabilities.
     */
    offloadSch?: pulumi.Input<boolean>;
    /**
     * Timeout (in seconds) for connection tracking of protocols other than TCP, UDP, and ICMP. This controls how long the gateway maintains state information for connections using other protocols. Higher values maintain connection state longer, while lower values reclaim resources more quickly but may affect some applications using non-standard protocols.
     */
    otherTimeout?: pulumi.Input<number>;
    /**
     * Enable the PPTP (Point-to-Point Tunneling Protocol) helper module. This module allows PPTP VPN connections to work properly through the gateway's firewall and NAT. PPTP uses GRE for tunneling, so the `gre_module` must also be enabled for PPTP to function correctly. Note that PPTP has known security vulnerabilities and more secure VPN protocols are generally recommended.
     */
    pptpModule?: pulumi.Input<boolean>;
    /**
     * Enable accepting ICMP redirect messages. ICMP redirects are messages sent by routers to inform hosts of better routes to specific destinations. When enabled, the gateway will update its routing table based on these messages. While useful for route optimization, this can potentially be exploited for man-in-the-middle attacks, so it's often disabled in security-sensitive environments.
     */
    receiveRedirects?: pulumi.Input<boolean>;
    /**
     * Enable sending ICMP redirect messages. When enabled, the gateway will send ICMP redirect messages to hosts on the local network to inform them of better routes to specific destinations. This can help optimize network traffic but is typically only needed when the gateway has multiple interfaces on the same subnet or in complex routing scenarios.
     */
    sendRedirects?: pulumi.Input<boolean>;
    /**
     * Enable the SIP (Session Initiation Protocol) helper module. SIP is used for initiating, maintaining, and terminating real-time sessions for voice, video, and messaging applications (VoIP, video conferencing). This helper allows SIP-based applications to work correctly through NAT by tracking SIP connections and dynamically opening the necessary ports for media streams.
     */
    sipModule?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable SYN cookies to protect against SYN flood attacks. SYN cookies are a technique that helps mitigate TCP SYN flood attacks by avoiding the need to track incomplete connections in a backlog queue. When enabled, the gateway can continue to establish legitimate connections even when under a SYN flood attack. This is a recommended security setting for internet-facing gateways.
     */
    synCookies?: pulumi.Input<boolean>;
    /**
     * TCP connection timeout settings for various TCP connection states. These settings control how long the gateway maintains state information for TCP connections in different states before removing them from the connection tracking table. Proper timeout values balance resource usage with connection reliability. These settings are particularly relevant when `timeout_setting_preference` is set to `manual`.
     */
    tcpTimeouts?: pulumi.Input<inputs.SettingUsgTcpTimeouts>;
    /**
     * Enable the TFTP (Trivial File Transfer Protocol) helper module. This module allows TFTP connections to work properly through the gateway's firewall and NAT. TFTP is commonly used for firmware updates, configuration file transfers, and network booting of devices. The helper tracks TFTP connections and ensures return traffic is properly handled.
     */
    tftpModule?: pulumi.Input<boolean>;
    /**
     * Determines how connection timeout values are configured. Valid values are:
     *   * `auto` - The gateway will automatically determine appropriate timeout values based on system defaults
     *   * `manual` - Use the manually specified timeout values for various connection types
     *
     * When set to `manual`, you should specify values for the various timeout settings like `tcp_timeouts`, `udp_stream_timeout`, `udp_other_timeout`, `icmp_timeout`, and `other_timeout`. Requires controller version 7.0 or later.
     */
    timeoutSettingPreference?: pulumi.Input<string>;
    /**
     * Timeout (in seconds) for general UDP connections. Since UDP is connectionless, this timeout determines how long the gateway maintains state information for UDP packets that don't match the criteria for stream connections. This applies to most short-lived UDP communications like DNS queries. Lower values free resources more quickly but may affect some applications that expect longer session persistence.
     */
    udpOtherTimeout?: pulumi.Input<number>;
    /**
     * Timeout (in seconds) for UDP stream connections. This applies to UDP traffic patterns that resemble ongoing streams, such as VoIP calls, video streaming, or online gaming. The gateway identifies these based on traffic patterns and maintains state information longer than for regular UDP traffic. Higher values improve reliability for streaming applications but consume more connection tracking resources.
     */
    udpStreamTimeout?: pulumi.Input<number>;
    /**
     * Unbind WAN monitors to prevent unnecessary traffic. When enabled, the gateway will stop certain monitoring processes that periodically check WAN connectivity. This can reduce unnecessary traffic on metered connections or in environments where the monitoring traffic might trigger security alerts. However, disabling these monitors may affect the gateway's ability to detect and respond to WAN connectivity issues. Requires controller version 9.0 or later.
     */
    unbindWanMonitors?: pulumi.Input<boolean>;
    /**
     * UPNP (Universal Plug and Play) configuration settings. UPNP allows compatible applications and devices to automatically configure port forwarding rules on the gateway without manual intervention. This is commonly used by gaming consoles, media servers, VoIP applications, and other network services that require incoming connections.
     */
    upnp?: pulumi.Input<inputs.SettingUsgUpnp>;
    /**
     * Whether UPNP is enabled. When enabled, the gateway will automatically forward ports for UPNP-compatible devices
     */
    upnpEnabled?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingUsg resource.
 */
export interface SettingUsgArgs {
    /**
     * The base reachable timeout (in seconds) for ARP cache entries. This controls how long the gateway considers a MAC-to-IP mapping valid without needing to refresh it. Higher values reduce network traffic but may cause stale entries if devices change IP addresses frequently.
     */
    arpCacheBaseReachable?: pulumi.Input<number>;
    /**
     * The timeout strategy for ARP cache entries. Valid values are:
     *   * `normal` - Use system default timeouts
     *   * `min-dhcp-lease` - Set ARP timeout to match the minimum DHCP lease time
     *   * `custom` - Use the custom timeout value specified in `arp_cache_base_reachable`
     *
     * This setting determines how long MAC-to-IP mappings are stored in the ARP cache before being refreshed.
     */
    arpCacheTimeout?: pulumi.Input<string>;
    /**
     * Enable responding to broadcast ping requests (ICMP echo requests sent to the broadcast address). When enabled, the gateway will respond to pings sent to the broadcast address of the network (e.g., 192.168.1.255). This can be useful for network diagnostics but may also be used in certain denial-of-service attacks.
     */
    broadcastPing?: pulumi.Input<boolean>;
    /**
     * Advanced DHCP relay configuration settings. Controls how the gateway forwards DHCP requests to external servers and manages DHCP relay agent behavior. Use this block to fine-tune DHCP relay functionality beyond simply specifying relay servers.
     */
    dhcpRelay?: pulumi.Input<inputs.SettingUsgDhcpRelay>;
    /**
     * List of up to 5 DHCP relay servers (specified by IP address) that will receive forwarded DHCP requests. This is useful when you want to use external DHCP servers instead of the built-in DHCP server on the USG/UDM. When configured, the gateway will forward DHCP discovery packets from clients to these external servers, allowing centralized IP address management across multiple networks. Example: `['192.168.1.5', '192.168.2.5']`
     *
     * @deprecated Deprecated
     */
    dhcpRelayServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Enable updating the gateway's host files with DHCP client information. When enabled, the gateway will automatically add entries to its host file for each DHCP client, allowing hostname resolution for devices that receive IP addresses via DHCP. This improves name resolution on the local network.
     */
    dhcpdHostfileUpdate?: pulumi.Input<boolean>;
    /**
     * Use dnsmasq for DHCP services instead of the default DHCP server. Dnsmasq provides integrated DNS and DHCP functionality with additional features like DNS caching, DHCP static leases, and local domain name resolution. This can improve DNS resolution performance and provide more flexible DHCP options.
     */
    dhcpdUseDnsmasq?: pulumi.Input<boolean>;
    /**
     * DNS verification settings for validating DNS responses. This feature helps detect and prevent DNS spoofing attacks by verifying DNS responses against trusted DNS servers. When configured, the gateway can compare DNS responses with those from known trusted servers to identify potential tampering or poisoning attempts. Requires controller version 8.5 or later.
     */
    dnsVerification?: pulumi.Input<inputs.SettingUsgDnsVerification>;
    /**
     * When enabled, dnsmasq will query all configured DNS servers simultaneously and use the fastest response. This can improve DNS resolution speed but may increase DNS traffic. By default, dnsmasq queries servers sequentially, only trying the next server if the current one fails to respond.
     */
    dnsmasqAllServers?: pulumi.Input<boolean>;
    /**
     * The hostname or IP address of a server to use for network echo tests. Echo tests send packets to this server and measure response times to evaluate network connectivity and performance. This can be used for network diagnostics and monitoring.
     */
    echoServer?: pulumi.Input<string>;
    /**
     * Enable the FTP (File Transfer Protocol) helper module. This module allows the gateway to properly handle FTP connections through NAT by tracking the control channel and dynamically opening required data ports. Without this helper, passive FTP connections may fail when clients are behind NAT.
     */
    ftpModule?: pulumi.Input<boolean>;
    /**
     * Geographic IP filtering configuration that allows blocking or allowing traffic based on country of origin. This feature uses IP geolocation databases to identify the country associated with IP addresses and apply filtering rules. Useful for implementing country-specific access policies or blocking traffic from high-risk regions. Requires controller version 7.0 or later.
     */
    geoIpFiltering?: pulumi.Input<inputs.SettingUsgGeoIpFiltering>;
    /**
     * Enable the GRE (Generic Routing Encapsulation) protocol helper module. This module allows proper handling of GRE tunneling protocol through the gateway's firewall. GRE is commonly used for VPN tunnels and other encapsulation needs. Required if you plan to use PPTP VPNs (see `pptp_module`).
     */
    greModule?: pulumi.Input<boolean>;
    /**
     * Enable the H.323 protocol helper module. H.323 is a standard for multimedia communications (audio, video, and data) over packet-based networks. This helper allows H.323-based applications like video conferencing systems to work properly through NAT by tracking connection details and opening required ports.
     */
    h323Module?: pulumi.Input<boolean>;
    /**
     * ICMP timeout in seconds for connection tracking. This controls how long the gateway maintains state information for ICMP (ping) packets in its connection tracking table. Higher values maintain ICMP connection state longer, while lower values reclaim resources more quickly but may affect some diagnostic tools.
     */
    icmpTimeout?: pulumi.Input<number>;
    /**
     * Enable Link Layer Discovery Protocol (LLDP) on all interfaces. LLDP is a vendor-neutral protocol that allows network devices to advertise their identity, capabilities, and neighbors on a local network. When enabled, the gateway will both send and receive LLDP packets, facilitating network discovery and management tools.
     */
    lldpEnableAll?: pulumi.Input<boolean>;
    /**
     * TCP Maximum Segment Size (MSS) clamping mode. MSS clamping adjusts the maximum segment size of TCP packets to prevent fragmentation issues when packets traverse networks with different MTU sizes. Valid values include:
     *   * `auto` - Automatically determine appropriate MSS values based on interface MTUs
     *   * `custom` - Use the custom MSS value specified in `mss_clamp_mss`
     *   * `disabled` - Do not perform MSS clamping
     *
     * This setting is particularly important for VPN connections and networks with non-standard MTU sizes.
     */
    mssClamp?: pulumi.Input<string>;
    /**
     * Custom TCP Maximum Segment Size (MSS) value in bytes. This value is used when `mss_clamp` is set to `custom`. The MSS value should typically be set to the path MTU minus 40 bytes (for IPv4) or minus 60 bytes (for IPv6) to account for TCP/IP header overhead. Valid values range from 100 to 9999, with common values being 1460 (for standard 1500 MTU) or 1400 (for VPN tunnels).
     */
    mssClampMss?: pulumi.Input<number>;
    /**
     * Enable multicast DNS (mDNS/Bonjour/Avahi) forwarding across VLANs. This allows devices to discover services (like printers, Chromecasts, Apple devices, etc.) even when they are on different networks or VLANs. When enabled, the gateway will forward mDNS packets between networks, facilitating cross-VLAN service discovery. Note: This setting is not supported on UniFi OS v7+ as it has been replaced by mDNS settings in the network configuration.
     */
    multicastDnsEnabled?: pulumi.Input<boolean>;
    /**
     * Enable hardware accounting offload. When enabled, the gateway will use hardware acceleration for traffic accounting functions, reducing CPU load and potentially improving throughput for high-traffic environments. This setting may not be supported on all hardware models.
     */
    offloadAccounting?: pulumi.Input<boolean>;
    /**
     * Enable hardware offload for Layer 2 (L2) blocking functions. When enabled, the gateway will use hardware acceleration for blocking traffic at the data link layer (MAC address level), which can improve performance when implementing MAC-based filtering or isolation. This setting may not be supported on all hardware models.
     */
    offloadL2Blocking?: pulumi.Input<boolean>;
    /**
     * Enable hardware scheduling offload. When enabled, the gateway will use hardware acceleration for packet scheduling functions, which can improve QoS (Quality of Service) performance and throughput for prioritized traffic. This setting may not be supported on all hardware models and may affect other hardware offload capabilities.
     */
    offloadSch?: pulumi.Input<boolean>;
    /**
     * Timeout (in seconds) for connection tracking of protocols other than TCP, UDP, and ICMP. This controls how long the gateway maintains state information for connections using other protocols. Higher values maintain connection state longer, while lower values reclaim resources more quickly but may affect some applications using non-standard protocols.
     */
    otherTimeout?: pulumi.Input<number>;
    /**
     * Enable the PPTP (Point-to-Point Tunneling Protocol) helper module. This module allows PPTP VPN connections to work properly through the gateway's firewall and NAT. PPTP uses GRE for tunneling, so the `gre_module` must also be enabled for PPTP to function correctly. Note that PPTP has known security vulnerabilities and more secure VPN protocols are generally recommended.
     */
    pptpModule?: pulumi.Input<boolean>;
    /**
     * Enable accepting ICMP redirect messages. ICMP redirects are messages sent by routers to inform hosts of better routes to specific destinations. When enabled, the gateway will update its routing table based on these messages. While useful for route optimization, this can potentially be exploited for man-in-the-middle attacks, so it's often disabled in security-sensitive environments.
     */
    receiveRedirects?: pulumi.Input<boolean>;
    /**
     * Enable sending ICMP redirect messages. When enabled, the gateway will send ICMP redirect messages to hosts on the local network to inform them of better routes to specific destinations. This can help optimize network traffic but is typically only needed when the gateway has multiple interfaces on the same subnet or in complex routing scenarios.
     */
    sendRedirects?: pulumi.Input<boolean>;
    /**
     * Enable the SIP (Session Initiation Protocol) helper module. SIP is used for initiating, maintaining, and terminating real-time sessions for voice, video, and messaging applications (VoIP, video conferencing). This helper allows SIP-based applications to work correctly through NAT by tracking SIP connections and dynamically opening the necessary ports for media streams.
     */
    sipModule?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable SYN cookies to protect against SYN flood attacks. SYN cookies are a technique that helps mitigate TCP SYN flood attacks by avoiding the need to track incomplete connections in a backlog queue. When enabled, the gateway can continue to establish legitimate connections even when under a SYN flood attack. This is a recommended security setting for internet-facing gateways.
     */
    synCookies?: pulumi.Input<boolean>;
    /**
     * TCP connection timeout settings for various TCP connection states. These settings control how long the gateway maintains state information for TCP connections in different states before removing them from the connection tracking table. Proper timeout values balance resource usage with connection reliability. These settings are particularly relevant when `timeout_setting_preference` is set to `manual`.
     */
    tcpTimeouts?: pulumi.Input<inputs.SettingUsgTcpTimeouts>;
    /**
     * Enable the TFTP (Trivial File Transfer Protocol) helper module. This module allows TFTP connections to work properly through the gateway's firewall and NAT. TFTP is commonly used for firmware updates, configuration file transfers, and network booting of devices. The helper tracks TFTP connections and ensures return traffic is properly handled.
     */
    tftpModule?: pulumi.Input<boolean>;
    /**
     * Determines how connection timeout values are configured. Valid values are:
     *   * `auto` - The gateway will automatically determine appropriate timeout values based on system defaults
     *   * `manual` - Use the manually specified timeout values for various connection types
     *
     * When set to `manual`, you should specify values for the various timeout settings like `tcp_timeouts`, `udp_stream_timeout`, `udp_other_timeout`, `icmp_timeout`, and `other_timeout`. Requires controller version 7.0 or later.
     */
    timeoutSettingPreference?: pulumi.Input<string>;
    /**
     * Timeout (in seconds) for general UDP connections. Since UDP is connectionless, this timeout determines how long the gateway maintains state information for UDP packets that don't match the criteria for stream connections. This applies to most short-lived UDP communications like DNS queries. Lower values free resources more quickly but may affect some applications that expect longer session persistence.
     */
    udpOtherTimeout?: pulumi.Input<number>;
    /**
     * Timeout (in seconds) for UDP stream connections. This applies to UDP traffic patterns that resemble ongoing streams, such as VoIP calls, video streaming, or online gaming. The gateway identifies these based on traffic patterns and maintains state information longer than for regular UDP traffic. Higher values improve reliability for streaming applications but consume more connection tracking resources.
     */
    udpStreamTimeout?: pulumi.Input<number>;
    /**
     * Unbind WAN monitors to prevent unnecessary traffic. When enabled, the gateway will stop certain monitoring processes that periodically check WAN connectivity. This can reduce unnecessary traffic on metered connections or in environments where the monitoring traffic might trigger security alerts. However, disabling these monitors may affect the gateway's ability to detect and respond to WAN connectivity issues. Requires controller version 9.0 or later.
     */
    unbindWanMonitors?: pulumi.Input<boolean>;
    /**
     * UPNP (Universal Plug and Play) configuration settings. UPNP allows compatible applications and devices to automatically configure port forwarding rules on the gateway without manual intervention. This is commonly used by gaming consoles, media servers, VoIP applications, and other network services that require incoming connections.
     */
    upnp?: pulumi.Input<inputs.SettingUsgUpnp>;
}

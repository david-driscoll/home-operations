import * as outputs from "../types/output";
export interface BgpPeer {
    /**
     * Description of this peer group.
     */
    description?: string;
    /**
     * The peer group name.
     */
    name: string;
    /**
     * List of network CIDR ranges to listen on for this peer group.
     */
    networks?: string[];
    /**
     * The remote Autonomous System Number for this peer group.
     */
    remoteAs: number;
}
export interface ClientQosRate {
    /**
     * The ID of the client group (usergroup). If set, this group is used directly.
     */
    id: string;
    /**
     * Maximum download rate in kbps.
     */
    maxDown: number;
    /**
     * Maximum upload rate in kbps.
     */
    maxUp: number;
    /**
     * The name of the client group. If set, the group is looked up or created by name.
     */
    name: string;
}
export interface DeviceConfigNetwork {
    /**
     * Enable network bonding.
     */
    bondingEnabled: boolean;
    /**
     * Primary DNS server.
     */
    dns1: string;
    /**
     * Secondary DNS server.
     */
    dns2: string;
    /**
     * DNS suffix.
     */
    dnssuffix: string;
    /**
     * Gateway address (for static configuration).
     */
    gateway: string;
    /**
     * IP address (for static configuration).
     */
    ip: string;
    /**
     * Network mask (for static configuration).
     */
    netmask: string;
    /**
     * Network configuration type (dhcp or static).
     */
    type: string;
}
export interface DeviceOutletOverride {
    /**
     * Enable power cycle.
     */
    cycleEnabled: boolean;
    /**
     * Outlet index.
     */
    index: number;
    /**
     * Outlet name.
     */
    name: string;
    /**
     * Relay state (on/off).
     */
    relayState: boolean;
}
export interface DevicePortOverride {
    /**
     * Number of ports in the aggregate.
     */
    aggregateMembers?: number[];
    /**
     * Enable auto-negotiation for port speed.
     */
    autoneg: boolean;
    /**
     * 802.1X control mode.
     */
    dot1xCtrl?: string;
    /**
     * 802.1X idle timeout in seconds.
     */
    dot1xIdleTimeout?: number;
    /**
     * Egress rate limit in kbps.
     */
    egressRateLimitKbps?: number;
    /**
     * Enable egress rate limiting.
     */
    egressRateLimitKbpsEnabled: boolean;
    /**
     * List of network IDs to exclude from this port.
     */
    excludedNetworkconfIds?: string[];
    /**
     * Forward Error Correction mode.
     */
    fecMode?: string;
    /**
     * Enable flow control.
     */
    flowControlEnabled: boolean;
    /**
     * Forwarding mode.
     */
    forward?: string;
    /**
     * Enable full duplex mode.
     */
    fullDuplex: boolean;
    /**
     * Switch port index.
     */
    index: number;
    /**
     * Enable port isolation.
     */
    isolation: boolean;
    /**
     * Enable LLDP-MED.
     */
    lldpmedEnabled: boolean;
    /**
     * Enable LLDP-MED notifications.
     */
    lldpmedNotifyEnabled: boolean;
    /**
     * Mirror port index.
     */
    mirrorPortIdx?: number;
    /**
     * List of network IDs for multicast router.
     */
    multicastRouterNetworkconfIds?: string[];
    /**
     * Human-readable name of the port.
     */
    name?: string;
    /**
     * Native network ID (VLAN).
     */
    nativeNetworkconfId?: string;
    /**
     * Operating mode of the port, valid values are `switch`, `mirror`, and `aggregate`.
     */
    opMode: string;
    /**
     * PoE mode of the port; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: string;
    /**
     * Enable port keepalive.
     */
    portKeepaliveEnabled: boolean;
    /**
     * ID of the Port Profile used on this port.
     */
    portProfileId?: string;
    /**
     * Enable port security.
     */
    portSecurityEnabled: boolean;
    /**
     * List of MAC addresses allowed when port security is enabled.
     */
    portSecurityMacAddresses?: string[];
    /**
     * Priority queue 1 level.
     */
    priorityQueue1Level?: number;
    /**
     * Priority queue 2 level.
     */
    priorityQueue2Level?: number;
    /**
     * Priority queue 3 level.
     */
    priorityQueue3Level?: number;
    /**
     * Priority queue 4 level.
     */
    priorityQueue4Level?: number;
    /**
     * Setting preference.
     */
    settingPreference?: string;
    /**
     * Port speed in Mbps.
     */
    speed?: number;
    /**
     * Enable broadcast storm control.
     */
    stormctrlBcastEnabled: boolean;
    /**
     * Broadcast storm control level.
     */
    stormctrlBcastLevel?: number;
    /**
     * Broadcast storm control rate.
     */
    stormctrlBcastRate?: number;
    /**
     * Enable multicast storm control.
     */
    stormctrlMcastEnabled: boolean;
    /**
     * Multicast storm control level.
     */
    stormctrlMcastLevel?: number;
    /**
     * Multicast storm control rate.
     */
    stormctrlMcastRate?: number;
    /**
     * Storm control type.
     */
    stormctrlType?: string;
    /**
     * Enable unicast storm control.
     */
    stormctrlUcastEnabled: boolean;
    /**
     * Unicast storm control level.
     */
    stormctrlUcastLevel?: number;
    /**
     * Unicast storm control rate.
     */
    stormctrlUcastRate?: number;
    /**
     * STP port mode.
     */
    stpPortMode: boolean;
    /**
     * Tagged VLAN management.
     */
    taggedVlanMgmt?: string;
    /**
     * Voice network ID.
     */
    voiceNetworkconfId?: string;
}
export interface DeviceRadioTable {
    /**
     * Antenna gain.
     */
    antennaGain: number;
    /**
     * Antenna ID.
     */
    antennaId: number;
    /**
     * Enable assisted roaming.
     */
    assistedRoamingEnabled: boolean;
    /**
     * Assisted roaming RSSI threshold.
     */
    assistedRoamingRssi: number;
    /**
     * Channel number or 'auto'.
     */
    channel: string;
    /**
     * Enable DFS (Dynamic Frequency Selection).
     */
    dfs: boolean;
    /**
     * Enable hard noise floor.
     */
    hardNoiseFloorEnabled: boolean;
    /**
     * Channel width (20, 40, 80, 160).
     */
    ht: number;
    /**
     * Enable load balancing.
     */
    loadbalanceEnabled: boolean;
    /**
     * Maximum number of stations.
     */
    maxsta: number;
    /**
     * Minimum RSSI value.
     */
    minRssi: number;
    /**
     * Enable minimum RSSI.
     */
    minRssiEnabled: boolean;
    /**
     * Radio name.
     */
    name: string;
    /**
     * Radio band (ng, na, ad, 6e).
     */
    radio: string;
    /**
     * Sensitivity level.
     */
    sensLevel: number;
    /**
     * Enable sensitivity level.
     */
    sensLevelEnabled: boolean;
    /**
     * Transmit power or 'auto'.
     */
    txPower: string;
    /**
     * Transmit power mode (auto, medium, high, low, custom).
     */
    txPowerMode: string;
    /**
     * Enable virtual wire.
     */
    vwireEnabled: boolean;
}
export interface GetClientInfoListClient {
    /**
     * The MAC address of the access point the client is connected to.
     */
    apMac: string;
    /**
     * Whether the client is authorized.
     */
    authorized: boolean;
    /**
     * Whether the client is blocked.
     */
    blocked: boolean;
    /**
     * The BSSID of the access point.
     */
    bssid: string;
    /**
     * The WiFi channel the client is connected on.
     */
    channel: number;
    /**
     * The display name of the client.
     */
    displayName: string;
    /**
     * The ESSID (network name) the client is connected to.
     */
    essid: string;
    /**
     * Unix timestamp when the client was first seen.
     */
    firstSeen: number;
    /**
     * Fixed IPv4 address set for this client.
     */
    fixedIp: string;
    /**
     * The hostname of the client.
     */
    hostname: string;
    /**
     * The ID of the client.
     */
    id: string;
    /**
     * The IP address of the client.
     */
    ip: string;
    /**
     * Whether the client is a guest.
     */
    isGuest: boolean;
    /**
     * Whether the client is connected via wired connection.
     */
    isWired: boolean;
    /**
     * The network ID of the last connection.
     */
    lastConnectionNetworkId: string;
    /**
     * The network name of the last connection.
     */
    lastConnectionNetworkName: string;
    /**
     * Unix timestamp when the client was last seen.
     */
    lastSeen: number;
    /**
     * The MAC address of the last uplink device.
     */
    lastUplinkMac: string;
    /**
     * The name of the last uplink device.
     */
    lastUplinkName: string;
    /**
     * The remote port of the last uplink device.
     */
    lastUplinkRemotePort: number;
    /**
     * The local DNS record for this client.
     */
    localDnsRecord: string;
    /**
     * Whether local DNS record is enabled for this client.
     */
    localDnsRecordEnabled: boolean;
    /**
     * The MAC address of the client.
     */
    mac: string;
    /**
     * The name of the client.
     */
    name: string;
    /**
     * The network ID for this client.
     */
    networkId: string;
    /**
     * The network name for this client.
     */
    networkName: string;
    /**
     * The noise level in dBm.
     */
    noise: number;
    /**
     * The OUI (vendor) of the client's MAC address.
     */
    oui: string;
    /**
     * The radio type (e.g., na, ng).
     */
    radio: string;
    /**
     * The radio name (e.g., wifi0, wifi1).
     */
    radioName: string;
    /**
     * The RSSI value.
     */
    rssi: number;
    /**
     * Total bytes received.
     */
    rxBytes: number;
    /**
     * The receive rate in kbps.
     */
    rxRate: number;
    /**
     * The signal strength in dBm.
     */
    signal: number;
    /**
     * The status of the client.
     */
    status: string;
    /**
     * The switch port number the client is connected to.
     */
    swPort: number;
    /**
     * Total bytes transmitted.
     */
    txBytes: number;
    /**
     * The transmit rate in kbps.
     */
    txRate: number;
    /**
     * The uptime of the client in seconds.
     */
    uptime: number;
    /**
     * Whether this client uses a fixed IP.
     */
    useFixedip: boolean;
    /**
     * The user group ID for the client.
     */
    usergroupId: string;
    /**
     * The wired connection rate in Mbps.
     */
    wiredRateMbps: number;
}
export interface GetClientListClient {
    /**
     * The MAC address of the access point the client is connected to.
     */
    apMac: string;
    /**
     * Whether the client is authorized.
     */
    authorized: boolean;
    /**
     * Whether the client is blocked from the network.
     */
    blocked: boolean;
    /**
     * The BSSID of the access point.
     */
    bssid: string;
    /**
     * The WiFi channel the client is connected on.
     */
    channel: number;
    /**
     * The display name of the client.
     */
    displayName: string;
    /**
     * The ESSID (network name) the client is connected to.
     */
    essid: string;
    /**
     * Unix timestamp when the client was first seen.
     */
    firstSeen: number;
    /**
     * The MAC address of the access point to which this client is fixed.
     */
    fixedApMac: string;
    /**
     * A fixed IPv4 address for this client.
     */
    fixedIp: string;
    /**
     * The user group ID for the client.
     */
    groupId: string;
    /**
     * The hostname of the client.
     */
    hostname: string;
    /**
     * The ID of the client.
     */
    id: string;
    /**
     * The IP address of the client.
     */
    ip: string;
    /**
     * Whether the client is a guest.
     */
    isGuest: boolean;
    /**
     * Whether the client is connected via wired connection.
     */
    isWired: boolean;
    /**
     * The network ID of the last connection.
     */
    lastConnectionNetworkId: string;
    /**
     * The network name of the last connection.
     */
    lastConnectionNetworkName: string;
    /**
     * Unix timestamp when the client was last seen.
     */
    lastSeen: number;
    /**
     * The MAC address of the last uplink device.
     */
    lastUplinkMac: string;
    /**
     * The name of the last uplink device.
     */
    lastUplinkName: string;
    /**
     * The local DNS record for this client.
     */
    localDnsRecord: string;
    /**
     * The MAC address of the client.
     */
    mac: string;
    /**
     * The name of the client.
     */
    name: string;
    /**
     * The network ID for this client.
     */
    networkId: string;
    /**
     * List of network member group IDs for this client.
     */
    networkMembersGroupIds: string[];
    /**
     * The network name for this client.
     */
    networkName: string;
    /**
     * The noise level in dBm.
     */
    noise: number;
    /**
     * A note with additional information for the client.
     */
    note: string;
    /**
     * The OUI (vendor) of the client's MAC address.
     */
    oui: string;
    /**
     * The radio type (e.g., na, ng).
     */
    radio: string;
    /**
     * The radio name (e.g., wifi0, wifi1).
     */
    radioName: string;
    /**
     * The RSSI value.
     */
    rssi: number;
    /**
     * Total bytes received.
     */
    rxBytes: number;
    /**
     * The receive rate in kbps.
     */
    rxRate: number;
    /**
     * The signal strength in dBm.
     */
    signal: number;
    /**
     * The connection status of the client.
     */
    status: string;
    /**
     * The switch port number the client is connected to.
     */
    swPort: number;
    /**
     * Total bytes transmitted.
     */
    txBytes: number;
    /**
     * The transmit rate in kbps.
     */
    txRate: number;
    /**
     * The uptime of the client in seconds.
     */
    uptime: number;
    /**
     * The wired connection rate in Mbps.
     */
    wiredRateMbps: number;
}
export interface GetClientQosRate {
    /**
     * The ID of the client group.
     */
    id: string;
    /**
     * Maximum download rate in kbps.
     */
    maxDown: number;
    /**
     * Maximum upload rate in kbps.
     */
    maxUp: number;
    /**
     * The name of the client group.
     */
    name: string;
}
export interface GetNetworkDhcpGuarding {
    /**
     * Specifies whether DHCP guarding is enabled.
     */
    enabled: boolean;
    /**
     * List of allowed DHCP server IP addresses.
     */
    servers: string[];
}
export interface GetNetworkDhcpRelay {
    /**
     * Specifies whether DHCP relay is enabled.
     */
    enabled: boolean;
    /**
     * List of DHCP relay server addresses.
     */
    servers: string[];
}
export interface GetNetworkDhcpServer {
    /**
     * DHCP boot settings.
     */
    boot: outputs.GetNetworkDhcpServerBoot;
    /**
     * Specifies whether DHCP conflict checking is enabled.
     */
    conflictChecking: boolean;
    /**
     * Specifies whether DHCP DNS is enabled.
     */
    dnsEnabled: boolean;
    /**
     * List of DNS server addresses for DHCP clients.
     */
    dnsServers: string[];
    /**
     * Specifies whether DHCP server is enabled.
     */
    enabled: boolean;
    /**
     * Specifies whether DHCP gateway is enabled.
     */
    gatewayEnabled: boolean;
    /**
     * Specifies the lease time for DHCP addresses in seconds.
     */
    leasetime: number;
    /**
     * Specifies whether DHCP NTP is enabled.
     */
    ntpEnabled: boolean;
    /**
     * The IPv4 address where the DHCP range starts.
     */
    start: string;
    /**
     * The IPv4 address where the DHCP range stops.
     */
    stop: string;
    /**
     * TFTP server address.
     */
    tftpServer: string;
    /**
     * Specifies whether DHCP time offset is enabled.
     */
    timeOffsetEnabled: boolean;
    /**
     * UniFi controller IP address.
     */
    unifiController: string;
    /**
     * WINS server configuration.
     */
    wins: outputs.GetNetworkDhcpServerWins;
    /**
     * WPAD URL for proxy auto-configuration.
     */
    wpadUrl: string;
}
export interface GetNetworkDhcpServerBoot {
    /**
     * Toggles DHCP boot options.
     */
    enabled: boolean;
    /**
     * Boot filename.
     */
    filename: string;
    /**
     * TFTP server for boot options.
     */
    server: string;
}
export interface GetNetworkDhcpServerWins {
    /**
     * List of WINS server addresses.
     */
    addresses: string[];
    /**
     * Specifies whether DHCP WINS is enabled.
     */
    enabled: boolean;
}
export interface GetNetworkDhcpV6Server {
    /**
     * When true, upstream DNS entries are propagated. When false, `dns_servers` are used.
     */
    dnsAuto: boolean;
    /**
     * IPv6 DNS server addresses for DHCPv6 clients.
     */
    dnsServers: string[];
    /**
     * Specifies whether stateful DHCPv6 is enabled.
     */
    enabled: boolean;
    /**
     * Lease time for DHCPv6 addresses in seconds.
     */
    lease: number;
    /**
     * Start address of the DHCPv6 range.
     */
    start: string;
    /**
     * End address of the DHCPv6 range.
     */
    stop: string;
}
export interface GetNetworkNatOutboundIpAddress {
    /**
     * The IP address.
     */
    ipAddress: string;
    /**
     * The IP address pool.
     */
    ipAddressPools: string[];
    /**
     * The mode.
     */
    mode: string;
    /**
     * The WAN network group.
     */
    wanNetworkGroup: string;
}
export interface NetworkDhcpGuarding {
    /**
     * Specifies whether DHCP guarding is enabled.
     */
    enabled: boolean;
    /**
     * List of allowed DHCP server IP addresses (maximum 3). Only applies when `third_party_gateway` is enabled.
     */
    servers?: string[];
}
export interface NetworkDhcpRelay {
    /**
     * Specifies whether DHCP relay is enabled.
     */
    enabled: boolean;
    /**
     * List of DHCP relay server addresses.
     */
    servers?: string[];
}
export interface NetworkDhcpServer {
    /**
     * DHCP boot settings.
     */
    boot: outputs.NetworkDhcpServerBoot;
    /**
     * Specifies whether DHCP conflict checking is enabled.
     */
    conflictChecking: boolean;
    /**
     * Specifies whether DHCP DNS is enabled.
     */
    dnsEnabled: boolean;
    /**
     * List of DNS server addresses for DHCP clients.
     */
    dnsServers?: string[];
    /**
     * Specifies whether DHCP server is enabled.
     */
    enabled: boolean;
    /**
     * Specifies whether DHCP gateway is enabled.
     */
    gatewayEnabled: boolean;
    /**
     * Specifies the lease time for DHCP addresses in seconds.
     */
    leasetime: number;
    /**
     * Specifies whether DHCP NTP is enabled.
     */
    ntpEnabled: boolean;
    /**
     * The IPv4 address where the DHCP range starts.
     */
    start: string;
    /**
     * The IPv4 address where the DHCP range stops.
     */
    stop: string;
    /**
     * TFTP server address.
     */
    tftpServer?: string;
    /**
     * Specifies whether DHCP time offset is enabled.
     */
    timeOffsetEnabled: boolean;
    /**
     * UniFi controller IP address.
     */
    unifiController?: string;
    /**
     * WINS server configuration.
     */
    wins: outputs.NetworkDhcpServerWins;
    /**
     * WPAD URL for proxy auto-configuration.
     */
    wpadUrl?: string;
}
export interface NetworkDhcpServerBoot {
    /**
     * Toggles DHCP boot options.
     */
    enabled: boolean;
    /**
     * Boot filename.
     */
    filename: string;
    /**
     * TFTP server for boot options.
     */
    server: string;
}
export interface NetworkDhcpServerWins {
    /**
     * List of WINS server addresses (maximum 2).
     */
    addresses?: string[];
    /**
     * Specifies whether DHCP WINS is enabled.
     */
    enabled: boolean;
}
export interface NetworkNatOutboundIpAddress {
    /**
     * The IP address.
     */
    ipAddress?: string;
    /**
     * The IP address pool.
     */
    ipAddressPools?: string[];
    /**
     * The mode.
     */
    mode?: string;
    /**
     * The WAN network group.
     */
    wanNetworkGroup?: string;
}
export interface PortForwardForward {
    /**
     * The forward IPv4 address to send traffic to.
     */
    ip?: string;
    /**
     * The forward port or port range (e.g. `1-10,11,12`).
     */
    port?: string;
}
export interface PortForwardSourceLimiting {
    /**
     * Specifies whether source limiting is enabled.
     */
    enabled: boolean;
    /**
     * The ID of the firewall group to use for source limiting.
     */
    firewallGroupId?: string;
    /**
     * The source IPv4 address (or CIDR) of the port forwarding rule. For all traffic, specify `any`.
     */
    ip: string;
    /**
     * The source limiting type. Can be `ip` or `firewall_group`. Inferred automatically when only one of `ip` or `firewall_group_id` is set.
     */
    type: string;
}
export interface PortForwardWan {
    /**
     * The WAN interface. Can be `wan`, `wan2`, or `both`.
     */
    interface?: string;
    /**
     * The WAN IP address for the port forwarding rule. Use `any` for all addresses.
     */
    ipAddress?: string;
    /**
     * The WAN port or port range (e.g. `1-10,11,12`).
     */
    port?: string;
}
export interface RadiusProfileAcctServer {
    /**
     * IP address of accounting service server.
     */
    ip: string;
    /**
     * Port of accounting service.
     */
    port: number;
    /**
     * Shared secret for accounting server.
     */
    xSecret: string;
}
export interface RadiusProfileAuthServer {
    /**
     * IP address of authentication service server.
     */
    ip: string;
    /**
     * Port of authentication service.
     */
    port: number;
    /**
     * Shared secret for authentication server.
     */
    xSecret: string;
}
export interface SettingMgmt {
    /**
     * Automatically upgrade device firmware.
     */
    autoUpgrade: boolean;
    /**
     * Enable SSH authentication.
     */
    sshEnabled: boolean;
    /**
     * SSH keys.
     */
    sshKeys: outputs.SettingMgmtSshKey[];
}
export interface SettingMgmtSshKey {
    /**
     * Comment.
     */
    comment: string;
    /**
     * Public SSH key.
     */
    key: string;
    /**
     * Name of SSH key.
     */
    name: string;
    /**
     * Type of SSH key, e.g. ssh-rsa.
     */
    type: string;
}
export interface SettingRadius {
    /**
     * Enable RADIUS accounting.
     */
    accountingEnabled: boolean;
    /**
     * RADIUS accounting port.
     */
    acctPort: number;
    /**
     * RADIUS authentication port.
     */
    authPort: number;
    /**
     * Interim update interval in seconds.
     */
    interimUpdateInterval: number;
    /**
     * RADIUS shared secret.
     */
    secret: string;
}
export interface SettingUsg {
    /**
     * Enable broadcast ping.
     */
    broadcastPing: boolean;
    /**
     * DNS verification settings.
     */
    dnsVerification: outputs.SettingUsgDnsVerification;
    /**
     * Enable FTP module.
     */
    ftpModule: boolean;
    /**
     * Geo IP filtering action: block or allow.
     */
    geoIpFilteringBlock: string;
    /**
     * Comma-separated list of country codes for geo IP filtering.
     */
    geoIpFilteringCountries: string;
    /**
     * Enable geo IP filtering.
     */
    geoIpFilteringEnabled: boolean;
    /**
     * Geo IP filtering traffic direction: both, ingress, or egress.
     */
    geoIpFilteringTrafficDirection: string;
    /**
     * Enable GRE module.
     */
    greModule: boolean;
    /**
     * Enable H.323 module.
     */
    h323Module: boolean;
    /**
     * ICMP connection timeout in seconds.
     */
    icmpTimeout: number;
    /**
     * MSS clamping mode: auto, custom, or disabled.
     */
    mssClamp: string;
    /**
     * Enable hardware offload for accounting.
     */
    offloadAccounting: boolean;
    /**
     * Enable hardware offload for L2 blocking.
     */
    offloadL2Blocking: boolean;
    /**
     * Enable hardware offload for scheduling.
     */
    offloadSch: boolean;
    /**
     * Other connections timeout in seconds.
     */
    otherTimeout: number;
    /**
     * Enable PPTP module.
     */
    pptpModule: boolean;
    /**
     * Accept ICMP redirects.
     */
    receiveRedirects: boolean;
    /**
     * Send ICMP redirects.
     */
    sendRedirects: boolean;
    /**
     * Enable SIP module.
     */
    sipModule: boolean;
    /**
     * Enable SYN cookies.
     */
    synCookies: boolean;
    /**
     * TCP close timeout in seconds.
     */
    tcpCloseTimeout: number;
    /**
     * TCP close wait timeout in seconds.
     */
    tcpCloseWaitTimeout: number;
    /**
     * TCP established connection timeout in seconds.
     */
    tcpEstablishedTimeout: number;
    /**
     * TCP fin wait timeout in seconds.
     */
    tcpFinWaitTimeout: number;
    /**
     * TCP last ACK timeout in seconds.
     */
    tcpLastAckTimeout: number;
    /**
     * TCP SYN received timeout in seconds.
     */
    tcpSynRecvTimeout: number;
    /**
     * TCP SYN sent timeout in seconds.
     */
    tcpSynSentTimeout: number;
    /**
     * TCP time wait timeout in seconds.
     */
    tcpTimeWaitTimeout: number;
    /**
     * Enable TFTP module.
     */
    tftpModule: boolean;
    /**
     * Timeout setting preference: auto or manual.
     */
    timeoutSettingPreference: string;
    /**
     * UDP other timeout in seconds.
     */
    udpOtherTimeout: number;
    /**
     * UDP stream timeout in seconds.
     */
    udpStreamTimeout: number;
    /**
     * Unbind WAN monitors.
     */
    unbindWanMonitors: boolean;
    /**
     * Enable UPnP.
     */
    upnpEnabled: boolean;
    /**
     * Enable UPnP NAT-PMP.
     */
    upnpNatPmpEnabled: boolean;
    /**
     * Enable UPnP secure mode.
     */
    upnpSecureMode: boolean;
    /**
     * UPnP WAN interface (e.g., WAN, WAN2).
     */
    upnpWanInterface: string;
}
export interface SettingUsgDnsVerification {
    /**
     * Domain for DNS verification.
     */
    domain: string;
    /**
     * Primary DNS server.
     */
    primaryDnsServer: string;
    /**
     * Secondary DNS server.
     */
    secondaryDnsServer: string;
    /**
     * Setting preference: auto or manual.
     */
    settingPreference: string;
}
export interface TrafficRouteDestination {
    /**
     * List of domain entries to match.
     */
    domains?: outputs.TrafficRouteDestinationDomain[];
    /**
     * List of IP address or subnet entries to match.
     */
    ipAddresses?: outputs.TrafficRouteDestinationIpAddress[];
    /**
     * List of IP range entries to match.
     */
    ipRanges?: outputs.TrafficRouteDestinationIpRange[];
    /**
     * List of regions to match.
     */
    regions?: string[];
}
export interface TrafficRouteDestinationDomain {
    /**
     * The domain name to match.
     */
    domain: string;
    /**
     * List of port ranges to match.
     */
    portRanges?: outputs.TrafficRouteDestinationDomainPortRange[];
    /**
     * List of individual ports to match.
     */
    ports?: number[];
}
export interface TrafficRouteDestinationDomainPortRange {
    /**
     * The start port of the range.
     */
    start: number;
    /**
     * The stop port of the range.
     */
    stop: number;
}
export interface TrafficRouteDestinationIpAddress {
    /**
     * An IP address or CIDR subnet to match.
     */
    ipOrSubnet: string;
    /**
     * List of port ranges to match.
     */
    portRanges?: outputs.TrafficRouteDestinationIpAddressPortRange[];
    /**
     * List of individual ports to match.
     */
    ports?: number[];
}
export interface TrafficRouteDestinationIpAddressPortRange {
    /**
     * The start port of the range.
     */
    start: number;
    /**
     * The stop port of the range.
     */
    stop: number;
}
export interface TrafficRouteDestinationIpRange {
    /**
     * The start IP address of the range.
     */
    start: string;
    /**
     * The stop IP address of the range.
     */
    stop: string;
}
export interface TrafficRouteSource {
    /**
     * List of client devices whose traffic this route applies to.
     */
    clients?: outputs.TrafficRouteSourceClient[];
    /**
     * List of networks whose traffic this route applies to.
     */
    networks?: outputs.TrafficRouteSourceNetwork[];
}
export interface TrafficRouteSourceClient {
    /**
     * The MAC address of the client device.
     */
    mac: string;
}
export interface TrafficRouteSourceNetwork {
    /**
     * The ID of the network.
     */
    id: string;
}
export interface VpnClientWireguard {
    /**
     * File-based WireGuard configuration. Provide a complete WireGuard .conf file.
     */
    configuration?: outputs.VpnClientWireguardConfiguration;
    /**
     * DNS servers for the WireGuard interface. Required for manual mode. Must specify 1-2 DNS server addresses.
     */
    dnsServers?: string[];
    /**
     * WAN interface to use for the VPN connection (e.g., `wan`, `wan2`).
     */
    interface: string;
    /**
     * Manual WireGuard peer configuration. Specify peer endpoint and public key.
     */
    peer?: outputs.VpnClientWireguardPeer;
    /**
     * WireGuard preshared key. Required when preshared_key_enabled is true.
     */
    presharedKey?: string;
    /**
     * Specifies whether to use a preshared key for additional security.
     */
    presharedKeyEnabled: boolean;
    /**
     * WireGuard private key for this client.
     */
    privateKey: string;
}
export interface VpnClientWireguardConfiguration {
    /**
     * Base64-encoded WireGuard configuration file content.
     */
    content: string;
    /**
     * Filename of the WireGuard configuration file.
     */
    filename: string;
}
export interface VpnClientWireguardPeer {
    /**
     * WireGuard peer endpoint IP address.
     */
    ip: string;
    /**
     * WireGuard peer endpoint port.
     */
    port: number;
    /**
     * WireGuard peer public key.
     */
    publicKey: string;
}
export interface VpnServerDns {
    /**
     * Specifies whether custom DNS servers are enabled for VPN clients. Defaults to `true` when `servers` is non-empty.
     */
    enabled: boolean;
    /**
     * DNS servers to push to VPN clients.
     */
    servers?: string[];
}
export interface VpnServerL2tp {
    /**
     * Allow weak ciphers for L2TP connections.
     */
    allowWeakCiphers: boolean;
    /**
     * IPsec pre-shared key for L2TP. Required by the UniFi controller.
     */
    preSharedKey: string;
}
export interface VpnServerOpenvpn {
    /**
     * OpenVPN static authentication key generated by the controller.
     */
    authKey: string;
    /**
     * CA certificate generated by the controller.
     */
    caCrt: string;
    /**
     * CA private key generated by the controller.
     */
    caKey: string;
    /**
     * Diffie-Hellman parameters generated by the controller.
     */
    dhKey: string;
    /**
     * Encryption cipher for OpenVPN.
     */
    encryptionCipher: string;
    /**
     * OpenVPN mode.
     */
    mode: string;
    /**
     * Port for the OpenVPN server to listen on.
     */
    port: number;
    /**
     * Server certificate generated by the controller.
     */
    serverCrt: string;
    /**
     * Server private key generated by the controller.
     */
    serverKey: string;
    /**
     * Shared client certificate generated by the controller.
     */
    sharedClientCrt: string;
    /**
     * Shared client private key generated by the controller.
     */
    sharedClientKey: string;
}
export interface VpnServerWan {
    /**
     * WAN interface to use for the VPN server (e.g., `wan`, `wan2`).
     */
    interface: string;
    /**
     * Local WAN IP to bind the VPN server to. Use `any` to listen on all addresses.
     */
    ip: string;
}
export interface VpnServerWireguard {
    /**
     * UDP port for the WireGuard server to listen on.
     */
    port: number;
    /**
     * WireGuard private key for this server. If not specified, one will be generated by the controller.
     */
    privateKey: string;
    /**
     * WireGuard public key for this server. Computed from the private key.
     */
    publicKey: string;
}
export interface WanDhcp {
    /**
     * DHCP Class of Service
     */
    cos: number;
    /**
     * DHCP options
     */
    options?: outputs.WanDhcpOption[];
}
export interface WanDhcpOption {
    /**
     * DHCP option number
     */
    optionNumber: number;
    /**
     * DHCP option value
     */
    value: string;
}
export interface WanDhcpv6 {
    /**
     * DHCPv6 Class of Service
     */
    cos: number;
    /**
     * DHCPv6 options
     */
    options?: outputs.WanDhcpv6Option[];
    /**
     * DHCPv6 prefix delegation size
     */
    pdSize: number;
    /**
     * Whether DHCPv6 PD size is automatic
     */
    pdSizeAuto: boolean;
    /**
     * IPv6 WAN delegation type (pd, single_network, none)
     */
    wanDelegationType: string;
}
export interface WanDhcpv6Option {
    /**
     * DHCPv6 option number (1, 11, 15, 16, or 17)
     */
    optionNumber: number;
    /**
     * DHCPv6 option value
     */
    value: string;
}
export interface WanDns {
    /**
     * IPv6 DNS preference (auto, manual)
     */
    ipv6Preference: string;
    /**
     * Primary IPv6 DNS server
     */
    ipv6Primary?: string;
    /**
     * Secondary IPv6 DNS server
     */
    ipv6Secondary?: string;
    /**
     * DNS preference (auto, manual)
     */
    preference: string;
    /**
     * Primary DNS server
     */
    primary?: string;
    /**
     * Secondary DNS server
     */
    secondary?: string;
}
export interface WanEgressQos {
    /**
     * Whether egress QoS is enabled
     */
    enabled: boolean;
    /**
     * Egress QoS priority
     */
    priority: number;
}
export interface WanIgmpProxy {
    /**
     * IGMP proxy downstream target (none, lan, guest)
     */
    downstream: string;
    /**
     * Whether IGMP proxy upstream is enabled
     */
    upstream: boolean;
}
export interface WanLoadBalance {
    /**
     * Failover priority
     */
    failoverPriority: number;
    /**
     * Load balance type (failover-only, weighted)
     */
    type: string;
    /**
     * Load balance weight
     */
    weight: number;
}
export interface WanProviderCapabilities {
    /**
     * Download speed in kilobits per second
     */
    downloadKilobitsPerSecond: number;
    /**
     * Upload speed in kilobits per second
     */
    uploadKilobitsPerSecond: number;
}
export interface WanSmartq {
    /**
     * Smart Queue download rate in kbps
     */
    downRate?: number;
    /**
     * Whether Smart Queue is enabled
     */
    enabled: boolean;
    /**
     * Smart Queue upload rate in kbps
     */
    upRate?: number;
}
export interface WanUpnp {
    /**
     * Whether UPnP is enabled
     */
    enabled: boolean;
    /**
     * Whether UPnP NAT-PMP is enabled
     */
    natPmpEnabled: boolean;
    /**
     * Whether UPnP secure mode is enabled
     */
    secureMode: boolean;
    /**
     * UPnP WAN interface
     */
    wanInterface?: string;
}
export interface WanVlan {
    /**
     * Whether VLAN is enabled
     */
    enabled: boolean;
    /**
     * The VLAN ID
     */
    id: number;
}
export interface WlanMacFilter {
    /**
     * Indicates whether or not the MAC filter is turned on for the network.
     */
    enabled: boolean;
    /**
     * List of MAC addresses to filter (only valid if `enabled` is `true`).
     */
    lists?: string[];
    /**
     * MAC address filter policy (only valid if `enabled` is `true`).
     */
    policy: string;
}
export interface WlanSchedule {
    /**
     * Day of week for the block.
     */
    dayOfWeek: string;
    /**
     * Length of the block in minutes.
     */
    duration: number;
    /**
     * Name of the block.
     */
    name?: string;
    /**
     * Start hour for the block (0-23).
     */
    startHour: number;
    /**
     * Start minute for the block (0-59).
     */
    startMinute: number;
}

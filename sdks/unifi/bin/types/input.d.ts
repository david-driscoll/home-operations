import * as pulumi from "@pulumi/pulumi";
import * as inputs from "../types/input";
export interface BgpPeer {
    /**
     * Description of this peer group.
     */
    description?: pulumi.Input<string>;
    /**
     * The peer group name.
     */
    name: pulumi.Input<string>;
    /**
     * List of network CIDR ranges to listen on for this peer group.
     */
    networks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The remote Autonomous System Number for this peer group.
     */
    remoteAs: pulumi.Input<number>;
}
export interface ClientQosRate {
    /**
     * The ID of the client group (usergroup). If set, this group is used directly.
     */
    id?: pulumi.Input<string>;
    /**
     * Maximum download rate in kbps.
     */
    maxDown?: pulumi.Input<number>;
    /**
     * Maximum upload rate in kbps.
     */
    maxUp?: pulumi.Input<number>;
    /**
     * The name of the client group. If set, the group is looked up or created by name.
     */
    name?: pulumi.Input<string>;
}
export interface DeviceConfigNetwork {
    /**
     * Enable network bonding.
     */
    bondingEnabled?: pulumi.Input<boolean>;
    /**
     * Primary DNS server.
     */
    dns1?: pulumi.Input<string>;
    /**
     * Secondary DNS server.
     */
    dns2?: pulumi.Input<string>;
    /**
     * DNS suffix.
     */
    dnssuffix?: pulumi.Input<string>;
    /**
     * Gateway address (for static configuration).
     */
    gateway?: pulumi.Input<string>;
    /**
     * IP address (for static configuration).
     */
    ip?: pulumi.Input<string>;
    /**
     * Network mask (for static configuration).
     */
    netmask?: pulumi.Input<string>;
    /**
     * Network configuration type (dhcp or static).
     */
    type?: pulumi.Input<string>;
}
export interface DeviceOutletOverride {
    /**
     * Enable power cycle.
     */
    cycleEnabled?: pulumi.Input<boolean>;
    /**
     * Outlet index.
     */
    index: pulumi.Input<number>;
    /**
     * Outlet name.
     */
    name?: pulumi.Input<string>;
    /**
     * Relay state (on/off).
     */
    relayState?: pulumi.Input<boolean>;
}
export interface DevicePortOverride {
    /**
     * Number of ports in the aggregate.
     */
    aggregateMembers?: pulumi.Input<pulumi.Input<number>[]>;
    /**
     * Enable auto-negotiation for port speed.
     */
    autoneg?: pulumi.Input<boolean>;
    /**
     * 802.1X control mode.
     */
    dot1xCtrl?: pulumi.Input<string>;
    /**
     * 802.1X idle timeout in seconds.
     */
    dot1xIdleTimeout?: pulumi.Input<number>;
    /**
     * Egress rate limit in kbps.
     */
    egressRateLimitKbps?: pulumi.Input<number>;
    /**
     * Enable egress rate limiting.
     */
    egressRateLimitKbpsEnabled?: pulumi.Input<boolean>;
    /**
     * List of network IDs to exclude from this port.
     */
    excludedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Forward Error Correction mode.
     */
    fecMode?: pulumi.Input<string>;
    /**
     * Enable flow control.
     */
    flowControlEnabled?: pulumi.Input<boolean>;
    /**
     * Forwarding mode.
     */
    forward?: pulumi.Input<string>;
    /**
     * Enable full duplex mode.
     */
    fullDuplex?: pulumi.Input<boolean>;
    /**
     * Switch port index.
     */
    index: pulumi.Input<number>;
    /**
     * Enable port isolation.
     */
    isolation?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED.
     */
    lldpmedEnabled?: pulumi.Input<boolean>;
    /**
     * Enable LLDP-MED notifications.
     */
    lldpmedNotifyEnabled?: pulumi.Input<boolean>;
    /**
     * Mirror port index.
     */
    mirrorPortIdx?: pulumi.Input<number>;
    /**
     * List of network IDs for multicast router.
     */
    multicastRouterNetworkconfIds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Human-readable name of the port.
     */
    name?: pulumi.Input<string>;
    /**
     * Native network ID (VLAN).
     */
    nativeNetworkconfId?: pulumi.Input<string>;
    /**
     * Operating mode of the port, valid values are `switch`, `mirror`, and `aggregate`.
     */
    opMode?: pulumi.Input<string>;
    /**
     * PoE mode of the port; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Enable port keepalive.
     */
    portKeepaliveEnabled?: pulumi.Input<boolean>;
    /**
     * ID of the Port Profile used on this port.
     */
    portProfileId?: pulumi.Input<string>;
    /**
     * Enable port security.
     */
    portSecurityEnabled?: pulumi.Input<boolean>;
    /**
     * List of MAC addresses allowed when port security is enabled.
     */
    portSecurityMacAddresses?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Priority queue 1 level.
     */
    priorityQueue1Level?: pulumi.Input<number>;
    /**
     * Priority queue 2 level.
     */
    priorityQueue2Level?: pulumi.Input<number>;
    /**
     * Priority queue 3 level.
     */
    priorityQueue3Level?: pulumi.Input<number>;
    /**
     * Priority queue 4 level.
     */
    priorityQueue4Level?: pulumi.Input<number>;
    /**
     * Setting preference.
     */
    settingPreference?: pulumi.Input<string>;
    /**
     * Port speed in Mbps.
     */
    speed?: pulumi.Input<number>;
    /**
     * Enable broadcast storm control.
     */
    stormctrlBcastEnabled?: pulumi.Input<boolean>;
    /**
     * Broadcast storm control level.
     */
    stormctrlBcastLevel?: pulumi.Input<number>;
    /**
     * Broadcast storm control rate.
     */
    stormctrlBcastRate?: pulumi.Input<number>;
    /**
     * Enable multicast storm control.
     */
    stormctrlMcastEnabled?: pulumi.Input<boolean>;
    /**
     * Multicast storm control level.
     */
    stormctrlMcastLevel?: pulumi.Input<number>;
    /**
     * Multicast storm control rate.
     */
    stormctrlMcastRate?: pulumi.Input<number>;
    /**
     * Storm control type.
     */
    stormctrlType?: pulumi.Input<string>;
    /**
     * Enable unicast storm control.
     */
    stormctrlUcastEnabled?: pulumi.Input<boolean>;
    /**
     * Unicast storm control level.
     */
    stormctrlUcastLevel?: pulumi.Input<number>;
    /**
     * Unicast storm control rate.
     */
    stormctrlUcastRate?: pulumi.Input<number>;
    /**
     * STP port mode.
     */
    stpPortMode?: pulumi.Input<boolean>;
    /**
     * Tagged VLAN management.
     */
    taggedVlanMgmt?: pulumi.Input<string>;
    /**
     * Voice network ID.
     */
    voiceNetworkconfId?: pulumi.Input<string>;
}
export interface DeviceRadioTable {
    /**
     * Antenna gain.
     */
    antennaGain?: pulumi.Input<number>;
    /**
     * Antenna ID.
     */
    antennaId?: pulumi.Input<number>;
    /**
     * Enable assisted roaming.
     */
    assistedRoamingEnabled?: pulumi.Input<boolean>;
    /**
     * Assisted roaming RSSI threshold.
     */
    assistedRoamingRssi?: pulumi.Input<number>;
    /**
     * Channel number or 'auto'.
     */
    channel?: pulumi.Input<string>;
    /**
     * Enable DFS (Dynamic Frequency Selection).
     */
    dfs?: pulumi.Input<boolean>;
    /**
     * Enable hard noise floor.
     */
    hardNoiseFloorEnabled?: pulumi.Input<boolean>;
    /**
     * Channel width (20, 40, 80, 160).
     */
    ht?: pulumi.Input<number>;
    /**
     * Enable load balancing.
     */
    loadbalanceEnabled?: pulumi.Input<boolean>;
    /**
     * Maximum number of stations.
     */
    maxsta?: pulumi.Input<number>;
    /**
     * Minimum RSSI value.
     */
    minRssi?: pulumi.Input<number>;
    /**
     * Enable minimum RSSI.
     */
    minRssiEnabled?: pulumi.Input<boolean>;
    /**
     * Radio name.
     */
    name?: pulumi.Input<string>;
    /**
     * Radio band (ng, na, ad, 6e).
     */
    radio?: pulumi.Input<string>;
    /**
     * Sensitivity level.
     */
    sensLevel?: pulumi.Input<number>;
    /**
     * Enable sensitivity level.
     */
    sensLevelEnabled?: pulumi.Input<boolean>;
    /**
     * Transmit power or 'auto'.
     */
    txPower?: pulumi.Input<string>;
    /**
     * Transmit power mode (auto, medium, high, low, custom).
     */
    txPowerMode?: pulumi.Input<string>;
    /**
     * Enable virtual wire.
     */
    vwireEnabled?: pulumi.Input<boolean>;
}
export interface NetworkDhcpGuarding {
    /**
     * Specifies whether DHCP guarding is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * List of allowed DHCP server IP addresses (maximum 3). Only applies when `third_party_gateway` is enabled.
     */
    servers?: pulumi.Input<pulumi.Input<string>[]>;
}
export interface NetworkDhcpRelay {
    /**
     * Specifies whether DHCP relay is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * List of DHCP relay server addresses.
     */
    servers?: pulumi.Input<pulumi.Input<string>[]>;
}
export interface NetworkDhcpServer {
    /**
     * DHCP boot settings.
     */
    boot?: pulumi.Input<inputs.NetworkDhcpServerBoot>;
    /**
     * Specifies whether DHCP conflict checking is enabled.
     */
    conflictChecking?: pulumi.Input<boolean>;
    /**
     * Specifies whether DHCP DNS is enabled.
     */
    dnsEnabled?: pulumi.Input<boolean>;
    /**
     * List of DNS server addresses for DHCP clients.
     */
    dnsServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies whether DHCP server is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether DHCP gateway is enabled.
     */
    gatewayEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the lease time for DHCP addresses in seconds.
     */
    leasetime?: pulumi.Input<number>;
    /**
     * Specifies whether DHCP NTP is enabled.
     */
    ntpEnabled?: pulumi.Input<boolean>;
    /**
     * The IPv4 address where the DHCP range starts.
     */
    start?: pulumi.Input<string>;
    /**
     * The IPv4 address where the DHCP range stops.
     */
    stop?: pulumi.Input<string>;
    /**
     * TFTP server address.
     */
    tftpServer?: pulumi.Input<string>;
    /**
     * Specifies whether DHCP time offset is enabled.
     */
    timeOffsetEnabled?: pulumi.Input<boolean>;
    /**
     * UniFi controller IP address.
     */
    unifiController?: pulumi.Input<string>;
    /**
     * WINS server configuration.
     */
    wins?: pulumi.Input<inputs.NetworkDhcpServerWins>;
    /**
     * WPAD URL for proxy auto-configuration.
     */
    wpadUrl?: pulumi.Input<string>;
}
export interface NetworkDhcpServerBoot {
    /**
     * Toggles DHCP boot options.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Boot filename.
     */
    filename?: pulumi.Input<string>;
    /**
     * TFTP server for boot options.
     */
    server?: pulumi.Input<string>;
}
export interface NetworkDhcpServerWins {
    /**
     * List of WINS server addresses (maximum 2).
     */
    addresses?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies whether DHCP WINS is enabled.
     */
    enabled?: pulumi.Input<boolean>;
}
export interface NetworkNatOutboundIpAddress {
    /**
     * The IP address.
     */
    ipAddress?: pulumi.Input<string>;
    /**
     * The IP address pool.
     */
    ipAddressPools?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The mode.
     */
    mode?: pulumi.Input<string>;
    /**
     * The WAN network group.
     */
    wanNetworkGroup?: pulumi.Input<string>;
}
export interface PortForwardForward {
    /**
     * The forward IPv4 address to send traffic to.
     */
    ip?: pulumi.Input<string>;
    /**
     * The forward port or port range (e.g. `1-10,11,12`).
     */
    port?: pulumi.Input<string>;
}
export interface PortForwardSourceLimiting {
    /**
     * Specifies whether source limiting is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The ID of the firewall group to use for source limiting.
     */
    firewallGroupId?: pulumi.Input<string>;
    /**
     * The source IPv4 address (or CIDR) of the port forwarding rule. For all traffic, specify `any`.
     */
    ip?: pulumi.Input<string>;
    /**
     * The source limiting type. Can be `ip` or `firewall_group`. Inferred automatically when only one of `ip` or `firewall_group_id` is set.
     */
    type?: pulumi.Input<string>;
}
export interface PortForwardWan {
    /**
     * The WAN interface. Can be `wan`, `wan2`, or `both`.
     */
    interface?: pulumi.Input<string>;
    /**
     * The WAN IP address for the port forwarding rule. Use `any` for all addresses.
     */
    ipAddress?: pulumi.Input<string>;
    /**
     * The WAN port or port range (e.g. `1-10,11,12`).
     */
    port?: pulumi.Input<string>;
}
export interface RadiusProfileAcctServer {
    /**
     * IP address of accounting service server.
     */
    ip: pulumi.Input<string>;
    /**
     * Port of accounting service.
     */
    port?: pulumi.Input<number>;
    /**
     * Shared secret for accounting server.
     */
    xSecret: pulumi.Input<string>;
}
export interface RadiusProfileAuthServer {
    /**
     * IP address of authentication service server.
     */
    ip: pulumi.Input<string>;
    /**
     * Port of authentication service.
     */
    port?: pulumi.Input<number>;
    /**
     * Shared secret for authentication server.
     */
    xSecret: pulumi.Input<string>;
}
export interface SettingMgmt {
    /**
     * Automatically upgrade device firmware.
     */
    autoUpgrade?: pulumi.Input<boolean>;
    /**
     * Enable SSH authentication.
     */
    sshEnabled?: pulumi.Input<boolean>;
    /**
     * SSH keys.
     */
    sshKeys?: pulumi.Input<pulumi.Input<inputs.SettingMgmtSshKey>[]>;
}
export interface SettingMgmtSshKey {
    /**
     * Comment.
     */
    comment?: pulumi.Input<string>;
    /**
     * Public SSH key.
     */
    key?: pulumi.Input<string>;
    /**
     * Name of SSH key.
     */
    name: pulumi.Input<string>;
    /**
     * Type of SSH key, e.g. ssh-rsa.
     */
    type: pulumi.Input<string>;
}
export interface SettingRadius {
    /**
     * Enable RADIUS accounting.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * RADIUS accounting port.
     */
    acctPort?: pulumi.Input<number>;
    /**
     * RADIUS authentication port.
     */
    authPort?: pulumi.Input<number>;
    /**
     * Interim update interval in seconds.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * RADIUS shared secret.
     */
    secret?: pulumi.Input<string>;
}
export interface SettingUsg {
    /**
     * Enable broadcast ping.
     */
    broadcastPing?: pulumi.Input<boolean>;
    /**
     * DNS verification settings.
     */
    dnsVerification?: pulumi.Input<inputs.SettingUsgDnsVerification>;
    /**
     * Enable FTP module.
     */
    ftpModule?: pulumi.Input<boolean>;
    /**
     * Geo IP filtering action: block or allow.
     */
    geoIpFilteringBlock?: pulumi.Input<string>;
    /**
     * Comma-separated list of country codes for geo IP filtering.
     */
    geoIpFilteringCountries?: pulumi.Input<string>;
    /**
     * Enable geo IP filtering.
     */
    geoIpFilteringEnabled?: pulumi.Input<boolean>;
    /**
     * Geo IP filtering traffic direction: both, ingress, or egress.
     */
    geoIpFilteringTrafficDirection?: pulumi.Input<string>;
    /**
     * Enable GRE module.
     */
    greModule?: pulumi.Input<boolean>;
    /**
     * Enable H.323 module.
     */
    h323Module?: pulumi.Input<boolean>;
    /**
     * ICMP connection timeout in seconds.
     */
    icmpTimeout?: pulumi.Input<number>;
    /**
     * MSS clamping mode: auto, custom, or disabled.
     */
    mssClamp?: pulumi.Input<string>;
    /**
     * Enable hardware offload for accounting.
     */
    offloadAccounting?: pulumi.Input<boolean>;
    /**
     * Enable hardware offload for L2 blocking.
     */
    offloadL2Blocking?: pulumi.Input<boolean>;
    /**
     * Enable hardware offload for scheduling.
     */
    offloadSch?: pulumi.Input<boolean>;
    /**
     * Other connections timeout in seconds.
     */
    otherTimeout?: pulumi.Input<number>;
    /**
     * Enable PPTP module.
     */
    pptpModule?: pulumi.Input<boolean>;
    /**
     * Accept ICMP redirects.
     */
    receiveRedirects?: pulumi.Input<boolean>;
    /**
     * Send ICMP redirects.
     */
    sendRedirects?: pulumi.Input<boolean>;
    /**
     * Enable SIP module.
     */
    sipModule?: pulumi.Input<boolean>;
    /**
     * Enable SYN cookies.
     */
    synCookies?: pulumi.Input<boolean>;
    /**
     * TCP close timeout in seconds.
     */
    tcpCloseTimeout?: pulumi.Input<number>;
    /**
     * TCP close wait timeout in seconds.
     */
    tcpCloseWaitTimeout?: pulumi.Input<number>;
    /**
     * TCP established connection timeout in seconds.
     */
    tcpEstablishedTimeout?: pulumi.Input<number>;
    /**
     * TCP fin wait timeout in seconds.
     */
    tcpFinWaitTimeout?: pulumi.Input<number>;
    /**
     * TCP last ACK timeout in seconds.
     */
    tcpLastAckTimeout?: pulumi.Input<number>;
    /**
     * TCP SYN received timeout in seconds.
     */
    tcpSynRecvTimeout?: pulumi.Input<number>;
    /**
     * TCP SYN sent timeout in seconds.
     */
    tcpSynSentTimeout?: pulumi.Input<number>;
    /**
     * TCP time wait timeout in seconds.
     */
    tcpTimeWaitTimeout?: pulumi.Input<number>;
    /**
     * Enable TFTP module.
     */
    tftpModule?: pulumi.Input<boolean>;
    /**
     * Timeout setting preference: auto or manual.
     */
    timeoutSettingPreference?: pulumi.Input<string>;
    /**
     * UDP other timeout in seconds.
     */
    udpOtherTimeout?: pulumi.Input<number>;
    /**
     * UDP stream timeout in seconds.
     */
    udpStreamTimeout?: pulumi.Input<number>;
    /**
     * Unbind WAN monitors.
     */
    unbindWanMonitors?: pulumi.Input<boolean>;
    /**
     * Enable UPnP.
     */
    upnpEnabled?: pulumi.Input<boolean>;
    /**
     * Enable UPnP NAT-PMP.
     */
    upnpNatPmpEnabled?: pulumi.Input<boolean>;
    /**
     * Enable UPnP secure mode.
     */
    upnpSecureMode?: pulumi.Input<boolean>;
    /**
     * UPnP WAN interface (e.g., WAN, WAN2).
     */
    upnpWanInterface?: pulumi.Input<string>;
}
export interface SettingUsgDnsVerification {
    /**
     * Domain for DNS verification.
     */
    domain?: pulumi.Input<string>;
    /**
     * Primary DNS server.
     */
    primaryDnsServer?: pulumi.Input<string>;
    /**
     * Secondary DNS server.
     */
    secondaryDnsServer?: pulumi.Input<string>;
    /**
     * Setting preference: auto or manual.
     */
    settingPreference?: pulumi.Input<string>;
}
export interface TrafficRouteDestination {
    /**
     * List of domain entries to match.
     */
    domains?: pulumi.Input<pulumi.Input<inputs.TrafficRouteDestinationDomain>[]>;
    /**
     * List of IP address or subnet entries to match.
     */
    ipAddresses?: pulumi.Input<pulumi.Input<inputs.TrafficRouteDestinationIpAddress>[]>;
    /**
     * List of IP range entries to match.
     */
    ipRanges?: pulumi.Input<pulumi.Input<inputs.TrafficRouteDestinationIpRange>[]>;
    /**
     * List of regions to match.
     */
    regions?: pulumi.Input<pulumi.Input<string>[]>;
}
export interface TrafficRouteDestinationDomain {
    /**
     * The domain name to match.
     */
    domain: pulumi.Input<string>;
    /**
     * List of port ranges to match.
     */
    portRanges?: pulumi.Input<pulumi.Input<inputs.TrafficRouteDestinationDomainPortRange>[]>;
    /**
     * List of individual ports to match.
     */
    ports?: pulumi.Input<pulumi.Input<number>[]>;
}
export interface TrafficRouteDestinationDomainPortRange {
    /**
     * The start port of the range.
     */
    start: pulumi.Input<number>;
    /**
     * The stop port of the range.
     */
    stop: pulumi.Input<number>;
}
export interface TrafficRouteDestinationIpAddress {
    /**
     * An IP address or CIDR subnet to match.
     */
    ipOrSubnet: pulumi.Input<string>;
    /**
     * List of port ranges to match.
     */
    portRanges?: pulumi.Input<pulumi.Input<inputs.TrafficRouteDestinationIpAddressPortRange>[]>;
    /**
     * List of individual ports to match.
     */
    ports?: pulumi.Input<pulumi.Input<number>[]>;
}
export interface TrafficRouteDestinationIpAddressPortRange {
    /**
     * The start port of the range.
     */
    start: pulumi.Input<number>;
    /**
     * The stop port of the range.
     */
    stop: pulumi.Input<number>;
}
export interface TrafficRouteDestinationIpRange {
    /**
     * The start IP address of the range.
     */
    start: pulumi.Input<string>;
    /**
     * The stop IP address of the range.
     */
    stop: pulumi.Input<string>;
}
export interface TrafficRouteSource {
    /**
     * List of client devices whose traffic this route applies to.
     */
    clients?: pulumi.Input<pulumi.Input<inputs.TrafficRouteSourceClient>[]>;
    /**
     * List of networks whose traffic this route applies to.
     */
    networks?: pulumi.Input<pulumi.Input<inputs.TrafficRouteSourceNetwork>[]>;
}
export interface TrafficRouteSourceClient {
    /**
     * The MAC address of the client device.
     */
    mac: pulumi.Input<string>;
}
export interface TrafficRouteSourceNetwork {
    /**
     * The ID of the network.
     */
    id: pulumi.Input<string>;
}
export interface VpnClientWireguard {
    /**
     * File-based WireGuard configuration. Provide a complete WireGuard .conf file.
     */
    configuration?: pulumi.Input<inputs.VpnClientWireguardConfiguration>;
    /**
     * DNS servers for the WireGuard interface. Required for manual mode. Must specify 1-2 DNS server addresses.
     */
    dnsServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * WAN interface to use for the VPN connection (e.g., `wan`, `wan2`).
     */
    interface?: pulumi.Input<string>;
    /**
     * Manual WireGuard peer configuration. Specify peer endpoint and public key.
     */
    peer?: pulumi.Input<inputs.VpnClientWireguardPeer>;
    /**
     * WireGuard preshared key. Required when preshared_key_enabled is true.
     */
    presharedKey?: pulumi.Input<string>;
    /**
     * Specifies whether to use a preshared key for additional security.
     */
    presharedKeyEnabled?: pulumi.Input<boolean>;
    /**
     * WireGuard private key for this client.
     */
    privateKey: pulumi.Input<string>;
}
export interface VpnClientWireguardConfiguration {
    /**
     * Base64-encoded WireGuard configuration file content.
     */
    content: pulumi.Input<string>;
    /**
     * Filename of the WireGuard configuration file.
     */
    filename: pulumi.Input<string>;
}
export interface VpnClientWireguardPeer {
    /**
     * WireGuard peer endpoint IP address.
     */
    ip: pulumi.Input<string>;
    /**
     * WireGuard peer endpoint port.
     */
    port: pulumi.Input<number>;
    /**
     * WireGuard peer public key.
     */
    publicKey: pulumi.Input<string>;
}
export interface VpnServerDns {
    /**
     * Specifies whether custom DNS servers are enabled for VPN clients. Defaults to `true` when `servers` is non-empty.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * DNS servers to push to VPN clients.
     */
    servers?: pulumi.Input<pulumi.Input<string>[]>;
}
export interface VpnServerL2tp {
    /**
     * Allow weak ciphers for L2TP connections.
     */
    allowWeakCiphers?: pulumi.Input<boolean>;
    /**
     * IPsec pre-shared key for L2TP. Required by the UniFi controller.
     */
    preSharedKey: pulumi.Input<string>;
}
export interface VpnServerOpenvpn {
    /**
     * OpenVPN static authentication key generated by the controller.
     */
    authKey?: pulumi.Input<string>;
    /**
     * CA certificate generated by the controller.
     */
    caCrt?: pulumi.Input<string>;
    /**
     * CA private key generated by the controller.
     */
    caKey?: pulumi.Input<string>;
    /**
     * Diffie-Hellman parameters generated by the controller.
     */
    dhKey?: pulumi.Input<string>;
    /**
     * Encryption cipher for OpenVPN.
     */
    encryptionCipher?: pulumi.Input<string>;
    /**
     * OpenVPN mode.
     */
    mode?: pulumi.Input<string>;
    /**
     * Port for the OpenVPN server to listen on.
     */
    port?: pulumi.Input<number>;
    /**
     * Server certificate generated by the controller.
     */
    serverCrt?: pulumi.Input<string>;
    /**
     * Server private key generated by the controller.
     */
    serverKey?: pulumi.Input<string>;
    /**
     * Shared client certificate generated by the controller.
     */
    sharedClientCrt?: pulumi.Input<string>;
    /**
     * Shared client private key generated by the controller.
     */
    sharedClientKey?: pulumi.Input<string>;
}
export interface VpnServerWan {
    /**
     * WAN interface to use for the VPN server (e.g., `wan`, `wan2`).
     */
    interface?: pulumi.Input<string>;
    /**
     * Local WAN IP to bind the VPN server to. Use `any` to listen on all addresses.
     */
    ip?: pulumi.Input<string>;
}
export interface VpnServerWireguard {
    /**
     * UDP port for the WireGuard server to listen on.
     */
    port?: pulumi.Input<number>;
    /**
     * WireGuard private key for this server. If not specified, one will be generated by the controller.
     */
    privateKey?: pulumi.Input<string>;
    /**
     * WireGuard public key for this server. Computed from the private key.
     */
    publicKey?: pulumi.Input<string>;
}
export interface WanDhcp {
    /**
     * DHCP Class of Service
     */
    cos?: pulumi.Input<number>;
    /**
     * DHCP options
     */
    options?: pulumi.Input<pulumi.Input<inputs.WanDhcpOption>[]>;
}
export interface WanDhcpOption {
    /**
     * DHCP option number
     */
    optionNumber: pulumi.Input<number>;
    /**
     * DHCP option value
     */
    value: pulumi.Input<string>;
}
export interface WanDhcpv6 {
    /**
     * DHCPv6 Class of Service
     */
    cos?: pulumi.Input<number>;
    /**
     * DHCPv6 options
     */
    options?: pulumi.Input<pulumi.Input<inputs.WanDhcpv6Option>[]>;
    /**
     * DHCPv6 prefix delegation size
     */
    pdSize?: pulumi.Input<number>;
    /**
     * Whether DHCPv6 PD size is automatic
     */
    pdSizeAuto?: pulumi.Input<boolean>;
    /**
     * IPv6 WAN delegation type (pd, single_network, none)
     */
    wanDelegationType?: pulumi.Input<string>;
}
export interface WanDhcpv6Option {
    /**
     * DHCPv6 option number (1, 11, 15, 16, or 17)
     */
    optionNumber: pulumi.Input<number>;
    /**
     * DHCPv6 option value
     */
    value: pulumi.Input<string>;
}
export interface WanDns {
    /**
     * IPv6 DNS preference (auto, manual)
     */
    ipv6Preference?: pulumi.Input<string>;
    /**
     * Primary IPv6 DNS server
     */
    ipv6Primary?: pulumi.Input<string>;
    /**
     * Secondary IPv6 DNS server
     */
    ipv6Secondary?: pulumi.Input<string>;
    /**
     * DNS preference (auto, manual)
     */
    preference?: pulumi.Input<string>;
    /**
     * Primary DNS server
     */
    primary?: pulumi.Input<string>;
    /**
     * Secondary DNS server
     */
    secondary?: pulumi.Input<string>;
}
export interface WanEgressQos {
    /**
     * Whether egress QoS is enabled
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Egress QoS priority
     */
    priority?: pulumi.Input<number>;
}
export interface WanIgmpProxy {
    /**
     * IGMP proxy downstream target (none, lan, guest)
     */
    downstream?: pulumi.Input<string>;
    /**
     * Whether IGMP proxy upstream is enabled
     */
    upstream?: pulumi.Input<boolean>;
}
export interface WanLoadBalance {
    /**
     * Failover priority
     */
    failoverPriority?: pulumi.Input<number>;
    /**
     * Load balance type (failover-only, weighted)
     */
    type?: pulumi.Input<string>;
    /**
     * Load balance weight
     */
    weight?: pulumi.Input<number>;
}
export interface WanProviderCapabilities {
    /**
     * Download speed in kilobits per second
     */
    downloadKilobitsPerSecond: pulumi.Input<number>;
    /**
     * Upload speed in kilobits per second
     */
    uploadKilobitsPerSecond: pulumi.Input<number>;
}
export interface WanSmartq {
    /**
     * Smart Queue download rate in kbps
     */
    downRate?: pulumi.Input<number>;
    /**
     * Whether Smart Queue is enabled
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Smart Queue upload rate in kbps
     */
    upRate?: pulumi.Input<number>;
}
export interface WanUpnp {
    /**
     * Whether UPnP is enabled
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Whether UPnP NAT-PMP is enabled
     */
    natPmpEnabled?: pulumi.Input<boolean>;
    /**
     * Whether UPnP secure mode is enabled
     */
    secureMode?: pulumi.Input<boolean>;
    /**
     * UPnP WAN interface
     */
    wanInterface?: pulumi.Input<string>;
}
export interface WanVlan {
    /**
     * Whether VLAN is enabled
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The VLAN ID
     */
    id?: pulumi.Input<number>;
}
export interface WlanMacFilter {
    /**
     * Indicates whether or not the MAC filter is turned on for the network.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * List of MAC addresses to filter (only valid if `enabled` is `true`).
     */
    lists?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * MAC address filter policy (only valid if `enabled` is `true`).
     */
    policy?: pulumi.Input<string>;
}
export interface WlanSchedule {
    /**
     * Day of week for the block.
     */
    dayOfWeek: pulumi.Input<string>;
    /**
     * Length of the block in minutes.
     */
    duration: pulumi.Input<number>;
    /**
     * Name of the block.
     */
    name?: pulumi.Input<string>;
    /**
     * Start hour for the block (0-23).
     */
    startHour: pulumi.Input<number>;
    /**
     * Start minute for the block (0-59).
     */
    startMinute?: pulumi.Input<number>;
}

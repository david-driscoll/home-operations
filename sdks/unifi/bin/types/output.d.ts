import * as outputs from "../types/output";
export interface AccountTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface ApGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
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
export interface BgpTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
export interface ClientQosRateTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface ClientTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
     * Port indices that make up this link-aggregation (LAG) group. Only takes effect when `op_mode` is `aggregate` on this port.
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
     * 802.1X idle timeout, as a Go duration string (e.g. `5m`, `300s`).
     */
    dot1xIdleTimeout?: string;
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
     * Operating mode of the port: `switch` (default), `mirror`, or `aggregate`. Set `aggregate` on the lead port of an SFP+/link-aggregation (LAG) group and list the member ports in `aggregate_members`. Only written when not `switch`, as gateway devices (UDM) reject op_mode on update.
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
     * List of network IDs to tag on this port.
     */
    taggedNetworkconfIds?: string[];
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
export interface DeviceTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface DnsRecordTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface DynamicDnsTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface FirewallGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface FirewallPolicyDestination {
    /**
     * List of client MAC addresses to match. Used when `matching_target` is `CLIENT`.
     */
    clientMacs: string[];
    /**
     * ID of a `unifi.FirewallGroup` (address-group type) to match. Used when `matching_target` is `IP` with `matching_target_type = OBJECT`.
     */
    ipGroupId: string;
    /**
     * List of IP addresses or CIDR ranges to match. Used when `matching_target` is `IP`.
     */
    ips: string[];
    /**
     * What to match: `ANY`, `NETWORK`, `CLIENT`, `IP`, `DEVICE`, `MAC`, or `WEB` (domains/FQDN).
     */
    matchingTarget: string;
    /**
     * How the matching target is specified (`ANY`, `SPECIFIC`, `LIST`, `OBJECT`). Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    matchingTargetType: string;
    /**
     * List of UniFi network IDs to match. Used when `matching_target` is `NETWORK`.
     */
    networkIds: string[];
    /**
     * Port(s) to match when `port_matching_type` is `SPECIFIC`. A single port (`161`) or a comma-separated list of ports/ranges (`80,443`, `8000-8100`). Leave unset for no port match.
     */
    port: string;
    /**
     * ID of a `unifi.FirewallGroup` (port-group type) to match. Used when `port_matching_type` is `OBJECT`.
     */
    portGroupId: string;
    /**
     * How to match ports: `ANY`, `SPECIFIC`, or `OBJECT` (port group).
     */
    portMatchingType: string;
    /**
     * List of domains/FQDNs to match. Used when `matching_target` is `WEB`.
     */
    webDomains: string[];
    /**
     * The ID of the firewall zone this endpoint belongs to. Use the `unifi.FirewallZone` data source to look up zone IDs by name.
     */
    zoneId: string;
}
export interface FirewallPolicySource {
    /**
     * List of client MAC addresses to match. Used when `matching_target` is `CLIENT`.
     */
    clientMacs: string[];
    /**
     * ID of a `unifi.FirewallGroup` (address-group type) to match. Used when `matching_target` is `IP` with `matching_target_type = OBJECT`.
     */
    ipGroupId: string;
    /**
     * List of IP addresses or CIDR ranges to match. Used when `matching_target` is `IP`.
     */
    ips: string[];
    /**
     * What to match: `ANY`, `NETWORK`, `CLIENT`, `IP`, `DEVICE`, `MAC`, or `WEB` (domains/FQDN).
     */
    matchingTarget: string;
    /**
     * How the matching target is specified (`ANY`, `SPECIFIC`, `LIST`, `OBJECT`). Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    matchingTargetType: string;
    /**
     * List of UniFi network IDs to match. Used when `matching_target` is `NETWORK`.
     */
    networkIds: string[];
    /**
     * Port(s) to match when `port_matching_type` is `SPECIFIC`. A single port (`161`) or a comma-separated list of ports/ranges (`80,443`, `8000-8100`). Leave unset for no port match.
     */
    port: string;
    /**
     * ID of a `unifi.FirewallGroup` (port-group type) to match. Used when `port_matching_type` is `OBJECT`.
     */
    portGroupId: string;
    /**
     * How to match ports: `ANY`, `SPECIFIC`, or `OBJECT` (port group).
     */
    portMatchingType: string;
    /**
     * List of domains/FQDNs to match. Used when `matching_target` is `WEB`.
     */
    webDomains: string[];
    /**
     * The ID of the firewall zone this endpoint belongs to. Use the `unifi.FirewallZone` data source to look up zone IDs by name.
     */
    zoneId: string;
}
export interface FirewallPolicyTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface FirewallRuleTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface FirewallZoneTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface GetAccountTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetApGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
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
     * The uptime of the client, as a Go duration string.
     */
    uptime: string;
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
export interface GetClientInfoListTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientInfoTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
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
export interface GetClientListTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
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
export interface GetClientQosRateTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetDnsRecordTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetFirewallZoneTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
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
     * Specifies the DHCP lease time, as a Go duration string.
     */
    leasetime: string;
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
export interface GetNetworkTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetPortProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusUserTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface NetworkDhcpGuarding {
    /**
     * Specifies whether DHCP guarding is enabled.
     */
    enabled: boolean;
    /**
     * List of allowed DHCP server IP addresses (maximum 3).
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
     * Specifies the DHCP lease time, as a Go duration string (e.g. `24h`, `86400s`). Defaults to `24h0m0s`.
     */
    leasetime: string;
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
export interface NetworkDhcpV6Server {
    /**
     * Specifies whether DNS auto-discovery is enabled for DHCPv6.
     */
    dnsAuto: boolean;
    /**
     * List of DNS server addresses for DHCPv6 clients (maximum 4).
     */
    dnsServers?: string[];
    /**
     * Specifies whether the DHCPv6 server is enabled.
     */
    enabled: boolean;
    /**
     * The lease time for DHCPv6 addresses in seconds.
     */
    lease?: number;
    /**
     * The start of the DHCPv6 address range.
     */
    start?: string;
    /**
     * The end of the DHCPv6 address range.
     */
    stop?: string;
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
export interface NetworkTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface PortForwardDestinationIp {
    /**
     * The destination IPv4 address. Use `any` for all addresses.
     */
    destinationIp?: string;
    /**
     * The WAN interface for this destination (e.g. `wan`, `wan2`).
     */
    interface?: string;
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
export interface PortForwardTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
export interface PortProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface PowerSupervisorPowerSource {
    /**
     * Index of the supervised device's PSU.
     */
    clientPsuIndex: number;
    /**
     * Port/outlet index on the upstream source.
     */
    powerSourceIndex: number;
    /**
     * MAC of the upstream source (e.g. the PoE switch).
     */
    powerSourceMac: string;
    /**
     * Type of the upstream source (e.g. `poe_port`).
     */
    powerSourceType: string;
}
export interface PowerSupervisorTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface RadiusProfileAcctServer {
    /**
     * IP address of the accounting server. Optional: the controller-managed default profile returns a server entry without an IP, so importing it must not force one.
     */
    ip?: string;
    /**
     * Port of accounting service.
     */
    port: number;
    /**
     * Shared secret for accounting server.
     */
    secret: string;
}
export interface RadiusProfileAuthServer {
    /**
     * IP address of the authentication server. Optional: the controller-managed default profile (e.g. the one created when a gateway RADIUS/VPN service is enabled, with `use_usg_auth_server = true`) returns a server entry without an IP, so importing it must not force one.
     */
    ip?: string;
    /**
     * Port of authentication service.
     */
    port: number;
    /**
     * Shared secret for authentication server.
     */
    secret: string;
}
export interface RadiusProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface RadiusUserTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface SettingAutoSpeedtest {
    /**
     * Cron expression controlling when the speed test runs (e.g. `0 * * * *`).
     */
    cronExpr: string;
    /**
     * Whether periodic automated speed tests are enabled.
     */
    enabled: boolean;
}
export interface SettingCountry {
    /**
     * Regulatory country code (ISO 3166-1 numeric).
     */
    code: number;
}
export interface SettingDoh {
    /**
     * Custom DNS servers specified via DNS stamp.
     */
    customServers: outputs.SettingDohCustomServer[];
    /**
     * Predefined DNS provider names (e.g. "cloudflare", "google").
     */
    serverNames: string[];
    /**
     * Encrypted DNS state: off, auto, manual, or custom.
     */
    state: string;
}
export interface SettingDohCustomServer {
    /**
     * Enable this custom server. Defaults to true.
     */
    enabled: boolean;
    /**
     * DNS stamp (sdns://) for the custom resolver.
     */
    sdnsStamp: string;
    /**
     * Human-readable name for this custom server.
     */
    serverName: string;
}
export interface SettingDpi {
    /**
     * Whether DPI is enabled.
     */
    enabled: boolean;
    /**
     * Whether device fingerprinting is enabled.
     */
    fingerprintingEnabled: boolean;
}
export interface SettingIgmpSnooping {
    /**
     * Whether IGMP snooping is enabled for the site.
     */
    enabled: boolean;
    /**
     * IDs of the networks IGMP snooping applies to.
     */
    networkIds: string[];
}
export interface SettingIps {
    /**
     * Advanced filtering mode: manual or disabled.
     */
    advancedFilteringPreference: string;
    /**
     * Show a blocking page when content filtering blocks a request.
     */
    contentFilteringBlockingPageEnabled: boolean;
    /**
     * Emerging Threats ruleset categories to enable (e.g. "emerging-malware", "tor", "phishing").
     */
    enabledCategories: string[];
    /**
     * Network IDs to apply IPS inspection to.
     */
    enabledNetworks: string[];
    /**
     * Enable honeypot to detect internal port scans.
     */
    honeypotEnabled: boolean;
    /**
     * Honeypot IP addresses per network.
     */
    honeypots: outputs.SettingIpsHoneypot[];
    /**
     * IPS operating mode: ids (detect only), ips (detect and block), ipsInline, or disabled.
     */
    ipsMode: string;
    /**
     * Use memory-optimized IPS ruleset (reduced rule set for low-memory devices).
     */
    memoryOptimized: boolean;
    /**
     * Block BitTorrent traffic.
     */
    restrictTorrents: boolean;
    /**
     * IPS signature alert suppression entries — silence specific signatures or categories.
     */
    suppressionAlerts: outputs.SettingIpsSuppressionAlert[];
    /**
     * IPS suppression whitelist entries — sources/destinations to exclude from inspection.
     */
    suppressionWhitelists: outputs.SettingIpsSuppressionWhitelist[];
}
export interface SettingIpsHoneypot {
    /**
     * IP address to use as a honeypot.
     */
    ipAddress: string;
    /**
     * Network ID this honeypot IP belongs to.
     */
    networkId: string;
    /**
     * IP version: v4 or v6.
     */
    version: string;
}
export interface SettingIpsSuppressionAlert {
    /**
     * Alert suppression signature category.
     */
    category: string;
    /**
     * Signature Generator ID (GID).
     */
    gid: number;
    /**
     * Signature ID.
     */
    id: number;
    /**
     * Suppression signature name.
     */
    signature: string;
    /**
     * Tracking specifications (used when `type` is `track`).
     */
    trackings: outputs.SettingIpsSuppressionAlertTracking[];
    /**
     * Suppression type: `all` (everywhere) or `track` (only the tracked sources/destinations).
     */
    type: string;
}
export interface SettingIpsSuppressionAlertTracking {
    /**
     * Match direction: both, src, or dest.
     */
    direction: string;
    /**
     * Match mode: ip, subnet, or network.
     */
    mode: string;
    /**
     * IP address, CIDR subnet, or network ID to match.
     */
    value: string;
}
export interface SettingIpsSuppressionWhitelist {
    /**
     * Match direction: both, src, or dest.
     */
    direction: string;
    /**
     * Match mode: ip, subnet, or network.
     */
    mode: string;
    /**
     * IP address, CIDR subnet, or network ID to whitelist.
     */
    value: string;
}
export interface SettingLcm {
    /**
     * Display brightness (1-100).
     */
    brightness: number;
    /**
     * Whether the device display is enabled.
     */
    enabled: boolean;
    /**
     * Seconds of inactivity before the display turns off (10-3600).
     */
    idleTimeout: number;
    /**
     * Sync display settings across devices.
     */
    sync: boolean;
    /**
     * Whether touch events on the display are enabled.
     */
    touchEvent: boolean;
}
export interface SettingMgmt {
    /**
     * Enable advanced features.
     */
    advancedFeatureEnabled: boolean;
    /**
     * Automatically upgrade device firmware.
     */
    autoUpgrade: boolean;
    /**
     * Hour of day (0-23) for automatic firmware upgrades.
     */
    autoUpgradeHour: number;
    /**
     * Enable debug tools.
     */
    debugToolsEnabled: boolean;
    /**
     * Enable Direct Connect (remote access).
     */
    directConnectEnabled: boolean;
    /**
     * Allow SSH password authentication (in addition to keys).
     */
    sshAuthPasswordEnabled: boolean;
    /**
     * Enable SSH authentication.
     */
    sshEnabled: boolean;
    /**
     * SSH keys.
     */
    sshKeys: outputs.SettingMgmtSshKey[];
    /**
     * SSH password for device access. Sensitive — the controller stores only a hash, so this value is kept from configuration and not read back.
     */
    sshPassword?: string;
    /**
     * SSH username for device access.
     */
    sshUsername: string;
    /**
     * Enable the UniFi Identity Provider.
     */
    unifiIdpEnabled: boolean;
    /**
     * Enable WiFiman.
     */
    wifimanEnabled: boolean;
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
export interface SettingNetworkOptimization {
    /**
     * Whether automated network optimization is enabled.
     */
    enabled: boolean;
}
export interface SettingNtp {
    /**
     * Primary NTP server.
     */
    ntpServer1: string;
    /**
     * Second NTP server.
     */
    ntpServer2: string;
    /**
     * Third NTP server.
     */
    ntpServer3: string;
    /**
     * Fourth NTP server.
     */
    ntpServer4: string;
    /**
     * Configuration mode: `auto` or `manual`.
     */
    settingPreference: string;
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
     * Interim update interval, as a Go duration string (e.g. `1h`, `3600s`).
     */
    interimUpdateInterval: string;
    /**
     * RADIUS shared secret.
     */
    secret: string;
}
export interface SettingSyslog {
    /**
     * Logged facilities (e.g. `device`, `client`, `firewall_default_policy`, `triggers`, `updates`, `admin_activity`, `critical`, `security_detections`, `vpn`).
     */
    contents: string[];
    /**
     * Enable debug logging.
     */
    debug: boolean;
    /**
     * Whether remote syslog is enabled.
     */
    enabled: boolean;
    /**
     * Remote syslog server IP address.
     */
    ip: string;
    /**
     * Log all available facilities.
     */
    logAllContents: boolean;
    /**
     * Whether netconsole logging is enabled.
     */
    netconsoleEnabled: boolean;
    /**
     * Netconsole host.
     */
    netconsoleHost: string;
    /**
     * Netconsole port (1-65535).
     */
    netconsolePort: number;
    /**
     * Remote syslog server port (1-65535).
     */
    port: number;
    /**
     * Also log this controller's events.
     */
    thisController: boolean;
    /**
     * Only send this controller's logs over an encrypted channel.
     */
    thisControllerEncryptedOnly: boolean;
}
export interface SettingTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
     * ICMP connection timeout, as a Go duration string (e.g. `30s`, `1m`).
     */
    icmpTimeout: string;
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
     * Other connections timeout, as a Go duration string (e.g. `600s`, `10m`).
     */
    otherTimeout: string;
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
     * TCP close timeout, as a Go duration string (e.g. `10s`).
     */
    tcpCloseTimeout: string;
    /**
     * TCP close wait timeout, as a Go duration string (e.g. `60s`, `1m`).
     */
    tcpCloseWaitTimeout: string;
    /**
     * TCP established connection timeout, as a Go duration string (e.g. `7440s`, `2h4m`).
     */
    tcpEstablishedTimeout: string;
    /**
     * TCP fin wait timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    tcpFinWaitTimeout: string;
    /**
     * TCP last ACK timeout, as a Go duration string (e.g. `30s`).
     */
    tcpLastAckTimeout: string;
    /**
     * TCP SYN received timeout, as a Go duration string (e.g. `60s`, `1m`).
     */
    tcpSynRecvTimeout: string;
    /**
     * TCP SYN sent timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    tcpSynSentTimeout: string;
    /**
     * TCP time wait timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    tcpTimeWaitTimeout: string;
    /**
     * Enable TFTP module.
     */
    tftpModule: boolean;
    /**
     * Timeout setting preference: auto or manual.
     */
    timeoutSettingPreference: string;
    /**
     * UDP other timeout, as a Go duration string (e.g. `30s`).
     */
    udpOtherTimeout: string;
    /**
     * UDP stream timeout, as a Go duration string (e.g. `180s`, `3m`).
     */
    udpStreamTimeout: string;
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
export interface SiteTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface SiteToSiteVpnTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface StaticRouteTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface TrafficRouteDestination {
    /**
     * List of domain names to match.
     */
    domains?: string[];
    /**
     * List of IP address, subnet, or IP range entries to match. Use CIDR notation (e.g. `10.0.0.0/8`) for subnets, or a hyphenated range (e.g. `192.168.10.1-192.168.10.255`) for IP ranges.
     */
    ips?: outputs.TrafficRouteDestinationIp[];
    /**
     * List of regions to match.
     */
    regions?: string[];
}
export interface TrafficRouteDestinationIp {
    /**
     * An IP address, CIDR subnet, or hyphenated IP range to match.
     */
    address: string;
    /**
     * List of ports or port ranges to match. Use a single number (e.g. `80`) for individual ports, or a hyphenated range (e.g. `8080-8090`) for port ranges. Only supported for IP addresses and subnets, not IP ranges.
     */
    ports?: string[];
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
export interface TrafficRouteTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
export interface VpnClientTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
export interface VpnServerTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
     * WireGuard private key for this server (base64). If not specified, the provider generates one at create time (the controller does not generate it and rejects a server without a key).
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
export interface WanTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
export interface WireguardPeerTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
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
export interface WlanPrivatePresharedKey {
    /**
     * ID of the network/VLAN this key is bound to. Leave unset to use the WLAN's default network.
     */
    networkId: string;
    /**
     * The passphrase for this key (8-255 characters).
     */
    password: string;
}
export interface WlanSchedule {
    /**
     * Day of week for the block.
     */
    dayOfWeek: string;
    /**
     * Length of the block, as a Go duration string. The controller stores this value with one-minute resolution, so the duration must be at least `1m` and a whole multiple of one minute (e.g. `30m`, `2h`).
     */
    duration: string;
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
export interface WlanTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: string;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: string;
}
//# sourceMappingURL=output.d.ts.map
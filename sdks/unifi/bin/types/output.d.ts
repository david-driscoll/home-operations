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
export interface AccountTunnel {
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    configType?: string;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    mediumType: number;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    type: number;
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
export interface ClientQosRateQosRate {
    /**
     * The QOS maximum download rate.
     */
    maxDown: number;
    /**
     * The QOS maximum upload rate.
     */
    maxUp: number;
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
export interface DeviceLcm {
    /**
     * LCM brightness (1-100).
     */
    brightness: number;
    /**
     * Override the site-wide LCM brightness with `brightness`.
     */
    brightnessOverride: boolean;
    /**
     * LCM idle timeout, as a Go duration string (e.g. `10m`, `600s`).
     */
    idleTimeout: string;
    /**
     * Override the site-wide LCM idle timeout with `idle_timeout`.
     */
    idleTimeoutOverride: boolean;
    /**
     * Window during which the display is dimmed.
     */
    nightMode: outputs.DeviceLcmNightMode;
}
export interface DeviceLcmNightMode {
    /**
     * Night mode start time, 24-hour `HH:MM`.
     */
    begins: string;
    /**
     * Night mode end time, 24-hour `HH:MM`.
     */
    ends: string;
}
export interface DeviceLed {
    /**
     * LED brightness (0-100).
     */
    brightness: number;
    /**
     * LED color override (hex color code).
     */
    color: string;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    override: string;
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
     * 802.1X port authentication settings.
     */
    dot1x: outputs.DevicePortOverrideDot1x;
    /**
     * Egress rate limiting.
     */
    egressRateLimit: outputs.DevicePortOverrideEgressRateLimit;
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
     * LLDP-MED settings.
     */
    lldpmed: outputs.DevicePortOverrideLldpmed;
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
     * Port security (MAC allow-list) settings.
     */
    portSecurity: outputs.DevicePortOverridePortSecurity;
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
     * Storm control settings.
     */
    stormctrl: outputs.DevicePortOverrideStormctrl;
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
export interface DevicePortOverrideDot1x {
    /**
     * 802.1X control mode.
     */
    ctrl: string;
    /**
     * 802.1X idle timeout, as a Go duration string (e.g. `5m`, `300s`).
     */
    idleTimeout: string;
}
export interface DevicePortOverrideEgressRateLimit {
    /**
     * Enable egress rate limiting.
     */
    enabled: boolean;
    /**
     * Egress rate limit in kbps.
     */
    kbps: number;
}
export interface DevicePortOverrideLldpmed {
    /**
     * Enable LLDP-MED.
     */
    enabled: boolean;
    /**
     * Enable LLDP-MED topology change notifications.
     */
    notifyEnabled: boolean;
}
export interface DevicePortOverridePortSecurity {
    /**
     * Enable port security.
     */
    enabled: boolean;
    /**
     * List of MAC addresses allowed when port security is enabled.
     */
    macAddresses: string[];
}
export interface DevicePortOverrideStormctrl {
    /**
     * Broadcast storm control.
     */
    bcast: outputs.DevicePortOverrideStormctrlBcast;
    /**
     * Multicast storm control.
     */
    mcast: outputs.DevicePortOverrideStormctrlMcast;
    /**
     * Storm control type; `level` or `rate`.
     */
    type: string;
    /**
     * Unknown unicast storm control.
     */
    ucast: outputs.DevicePortOverrideStormctrlUcast;
}
export interface DevicePortOverrideStormctrlBcast {
    /**
     * Enable Broadcast storm control.
     */
    enabled: boolean;
    /**
     * Broadcast storm control level (percent), used when `type` is `level`.
     */
    level: number;
    /**
     * Broadcast storm control rate (packets per second), used when `type` is `rate`.
     */
    rate: number;
}
export interface DevicePortOverrideStormctrlMcast {
    /**
     * Enable Multicast storm control.
     */
    enabled: boolean;
    /**
     * Multicast storm control level (percent), used when `type` is `level`.
     */
    level: number;
    /**
     * Multicast storm control rate (packets per second), used when `type` is `rate`.
     */
    rate: number;
}
export interface DevicePortOverrideStormctrlUcast {
    /**
     * Enable Unknown unicast storm control.
     */
    enabled: boolean;
    /**
     * Unknown unicast storm control level (percent), used when `type` is `level`.
     */
    level: number;
    /**
     * Unknown unicast storm control rate (packets per second), used when `type` is `rate`.
     */
    rate: number;
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
     * **Moved to `unifi_wlan.roaming_assistant_na.enabled`** (and `roaming_assistant_6e.enabled` for 6 GHz). UniFi Network 10.x moved assisted roaming from the device's radio table onto the WLAN, so this attribute no longer reaches the controller. Still accepted and preserved in state for one release.
     *
     * @deprecated Deprecated
     */
    assistedRoamingEnabled?: boolean;
    /**
     * **Moved to `unifi_wlan.roaming_assistant_na.rssi`** (and `roaming_assistant_6e.rssi` for 6 GHz). UniFi Network 10.x moved assisted roaming from the device's radio table onto the WLAN, so this attribute no longer reaches the controller. Still accepted and preserved in state for one release.
     *
     * @deprecated Deprecated
     */
    assistedRoamingRssi?: number;
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
export interface DeviceStp {
    /**
     * STP bridge priority.
     */
    priority: number;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    version: string;
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
     * Match the clients in `client_macs` by MAC address rather than by their current IP address. Corresponds to the controller's `match_mac` flag on a `CLIENT` matching target. Defaults to `false`.
     */
    matchMac: boolean;
    /**
     * Invert the IP match: when `true`, the endpoint matches every address **except** those in `ips` / `ip_group_id`. Corresponds to the "Match Opposite" toggle on an `IP` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeIps: boolean;
    /**
     * Invert the network match: when `true`, the endpoint matches every network **except** those in `network_ids`. Corresponds to the "Match Opposite" toggle on a `NETWORK` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeNetworks: boolean;
    /**
     * Invert the port match: when `true`, the endpoint matches every port **except** those in `port` / `port_group_id`. Corresponds to the "Match Opposite" toggle on the port selector in the UniFi UI. Defaults to `false`.
     */
    matchOppositePorts: boolean;
    /**
     * What to match: `ANY`, `NETWORK`, `CLIENT`, `IP`, `DEVICE`, `MAC`, `WEB` (domains/FQDN), or `REGION` (country codes, set `regions`). The controller only accepts `REGION` on an external zone.
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
     * Two-letter ISO country codes to match (for example `["DE", "US"]`). Used when `matching_target` is `REGION`, which the controller only accepts on an external zone. The controller rejects an update that leaves the list empty, so a policy matching on region must always carry at least one code.
     */
    regions: string[];
    /**
     * List of domains/FQDNs to match. Used when `matching_target` is `WEB`.
     */
    webDomains: string[];
    /**
     * The ID of the firewall zone this endpoint belongs to. Use the `unifi.FirewallZone` data source to look up zone IDs by name.
     */
    zoneId: string;
}
export interface FirewallPolicyIcmp {
    /**
     * ICMP type matching mode. Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    typename: string;
    /**
     * ICMPv6 type matching mode. Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    v6Typename: string;
}
export interface FirewallPolicySchedule {
    /**
     * Date used by `ONE_TIME_ONLY`, in `YYYY-MM-DD` format.
     */
    date: string;
    /**
     * End date used by `CUSTOM`, in `YYYY-MM-DD` format.
     */
    dateEnd: string;
    /**
     * Start date used by `CUSTOM`, in `YYYY-MM-DD` format.
     */
    dateStart: string;
    /**
     * Schedule mode.
     */
    mode: string;
    /**
     * Clear inherited fields that are unused by the selected mode.
     */
    normalize: boolean;
    /**
     * Weekdays on which the policy is active.
     */
    repeatOnDays: string[];
    /**
     * Time of day during which a timed schedule is active.
     */
    time: outputs.FirewallPolicyScheduleTime;
}
export interface FirewallPolicyScheduleTime {
    /**
     * Whether the policy is active all day.
     */
    allDay: boolean;
    /**
     * Time range during which the policy is active when `all_day` is false.
     */
    range: outputs.FirewallPolicyScheduleTimeRange;
}
export interface FirewallPolicyScheduleTimeRange {
    /**
     * End time in 24-hour `HH:MM` format.
     */
    end: string;
    /**
     * Start time in 24-hour `HH:MM` format.
     */
    start: string;
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
     * Match the clients in `client_macs` by MAC address rather than by their current IP address. Corresponds to the controller's `match_mac` flag on a `CLIENT` matching target. Defaults to `false`.
     */
    matchMac: boolean;
    /**
     * Invert the IP match: when `true`, the endpoint matches every address **except** those in `ips` / `ip_group_id`. Corresponds to the "Match Opposite" toggle on an `IP` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeIps: boolean;
    /**
     * Invert the network match: when `true`, the endpoint matches every network **except** those in `network_ids`. Corresponds to the "Match Opposite" toggle on a `NETWORK` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeNetworks: boolean;
    /**
     * Invert the port match: when `true`, the endpoint matches every port **except** those in `port` / `port_group_id`. Corresponds to the "Match Opposite" toggle on the port selector in the UniFi UI. Defaults to `false`.
     */
    matchOppositePorts: boolean;
    /**
     * What to match: `ANY`, `NETWORK`, `CLIENT`, `IP`, `DEVICE`, `MAC`, `WEB` (domains/FQDN), or `REGION` (country codes, set `regions`). The controller only accepts `REGION` on an external zone.
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
     * Two-letter ISO country codes to match (for example `["DE", "US"]`). Used when `matching_target` is `REGION`, which the controller only accepts on an external zone. The controller rejects an update that leaves the list empty, so a policy matching on region must always carry at least one code.
     */
    regions: string[];
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
export interface FirewallRuleDestination {
    /**
     * The destination address of the firewall rule.
     */
    address?: string;
    /**
     * The IPv6 destination address of the firewall rule.
     */
    addressIpv6?: string;
    /**
     * The destination firewall group IDs of the firewall rule.
     */
    firewallGroupIds?: string[];
    /**
     * The destination network ID of the firewall rule.
     */
    networkId?: string;
    /**
     * The destination network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    networkType: string;
    /**
     * The destination port of the firewall rule.
     */
    port?: string;
}
export interface FirewallRuleIcmp {
    /**
     * ICMP type name.
     */
    typename?: string;
    /**
     * ICMPv6 type name.
     */
    v6Typename?: string;
}
export interface FirewallRuleSource {
    /**
     * The source address for the firewall rule.
     */
    address?: string;
    /**
     * The IPv6 source address for the firewall rule.
     */
    addressIpv6?: string;
    /**
     * The source firewall group IDs for the firewall rule.
     */
    firewallGroupIds?: string[];
    /**
     * The source MAC address of the firewall rule.
     */
    mac?: string;
    /**
     * The source network ID for the firewall rule.
     */
    networkId?: string;
    /**
     * The source network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    networkType: string;
    /**
     * The source port of the firewall rule.
     */
    port?: string;
}
export interface FirewallRuleState {
    /**
     * Match where the state is established.
     */
    established: boolean;
    /**
     * Match where the state is invalid.
     */
    invalid: boolean;
    /**
     * Match where the state is new.
     */
    new: boolean;
    /**
     * Match where the state is related.
     */
    related: boolean;
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
export interface GetAccountTunnel {
    /**
     * See RFC2868 section 3.2.
     */
    mediumType: number;
    /**
     * See RFC2868 section 3.1.
     */
    type: number;
}
export interface GetApGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientInfoLastConnectionNetwork {
    /**
     * The network ID of the last connection.
     */
    id: string;
    /**
     * The network name of the last connection.
     */
    name: string;
}
export interface GetClientInfoLastUplink {
    /**
     * The MAC address of the last uplink device.
     */
    mac: string;
    /**
     * The name of the last uplink device.
     */
    name: string;
    /**
     * The remote port of the last uplink device.
     */
    remotePort: number;
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
     * The network of the client's last connection.
     */
    lastConnectionNetwork: outputs.GetClientInfoListClientLastConnectionNetwork;
    /**
     * Unix timestamp when the client was last seen.
     */
    lastSeen: number;
    /**
     * The last uplink device the client was seen on.
     */
    lastUplink: outputs.GetClientInfoListClientLastUplink;
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
     * The network this client is on.
     */
    network: outputs.GetClientInfoListClientNetwork;
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
     * Receive statistics for the client.
     */
    rx: outputs.GetClientInfoListClientRx;
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
     * Transmit statistics for the client.
     */
    tx: outputs.GetClientInfoListClientTx;
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
export interface GetClientInfoListClientLastConnectionNetwork {
    /**
     * The network ID of the last connection.
     */
    id: string;
    /**
     * The network name of the last connection.
     */
    name: string;
}
export interface GetClientInfoListClientLastUplink {
    /**
     * The MAC address of the last uplink device.
     */
    mac: string;
    /**
     * The name of the last uplink device.
     */
    name: string;
    /**
     * The remote port of the last uplink device.
     */
    remotePort: number;
}
export interface GetClientInfoListClientNetwork {
    /**
     * The network ID for this client.
     */
    id: string;
    /**
     * The network name for this client.
     */
    name: string;
}
export interface GetClientInfoListClientRx {
    /**
     * Total bytes received.
     */
    bytes: number;
    /**
     * The receive rate in kbps.
     */
    rate: number;
}
export interface GetClientInfoListClientTx {
    /**
     * Total bytes transmitted.
     */
    bytes: number;
    /**
     * The transmit rate in kbps.
     */
    rate: number;
}
export interface GetClientInfoListTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientInfoNetwork {
    /**
     * The network ID for this client.
     */
    id: string;
    /**
     * The network name for this client.
     */
    name: string;
}
export interface GetClientInfoRx {
    /**
     * Total bytes received.
     */
    bytes: number;
    /**
     * The receive rate in kbps.
     */
    rate: number;
}
export interface GetClientInfoTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientInfoTx {
    /**
     * Total bytes transmitted.
     */
    bytes: number;
    /**
     * The transmit rate in kbps.
     */
    rate: number;
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
     * The network of the client's last connection.
     */
    lastConnectionNetwork: outputs.GetClientListClientLastConnectionNetwork;
    /**
     * Unix timestamp when the client was last seen.
     */
    lastSeen: number;
    /**
     * The last uplink device the client was seen on.
     */
    lastUplink: outputs.GetClientListClientLastUplink;
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
     * The network this client is on.
     */
    network: outputs.GetClientListClientNetwork;
    /**
     * List of network member group IDs for this client.
     */
    networkMembersGroupIds: string[];
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
     * Receive statistics for the client.
     */
    rx: outputs.GetClientListClientRx;
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
     * Transmit statistics for the client.
     */
    tx: outputs.GetClientListClientTx;
    /**
     * The uptime of the client in seconds.
     */
    uptime: number;
    /**
     * The wired connection rate in Mbps.
     */
    wiredRateMbps: number;
}
export interface GetClientListClientLastConnectionNetwork {
    /**
     * The network ID of the last connection.
     */
    id: string;
    /**
     * The network name of the last connection.
     */
    name: string;
}
export interface GetClientListClientLastUplink {
    /**
     * The MAC address of the last uplink device.
     */
    mac: string;
    /**
     * The name of the last uplink device.
     */
    name: string;
}
export interface GetClientListClientNetwork {
    /**
     * The network ID for this client.
     */
    id: string;
    /**
     * The network name for this client.
     */
    name: string;
}
export interface GetClientListClientRx {
    /**
     * Total bytes received.
     */
    bytes: number;
    /**
     * The receive rate in kbps.
     */
    rate: number;
}
export interface GetClientListClientTx {
    /**
     * Total bytes transmitted.
     */
    bytes: number;
    /**
     * The transmit rate in kbps.
     */
    rate: number;
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
export interface GetClientQosRateQosRate {
    /**
     * The maximum download rate.
     */
    maxDown: number;
    /**
     * The maximum upload rate.
     */
    maxUp: number;
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
     * DNS servers handed out to DHCP clients.
     */
    dns: outputs.GetNetworkDhcpServerDns;
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
     * NTP servers handed out to DHCP clients.
     */
    ntp: outputs.GetNetworkDhcpServerNtp;
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
export interface GetNetworkDhcpServerDns {
    /**
     * Specifies whether DHCP DNS is enabled.
     */
    enabled: boolean;
    /**
     * List of DNS server addresses for DHCP clients.
     */
    servers: string[];
}
export interface GetNetworkDhcpServerNtp {
    /**
     * Specifies whether DHCP NTP is enabled.
     */
    enabled: boolean;
    /**
     * List of NTP server addresses for DHCP clients.
     */
    servers: string[];
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
     * DNS servers handed out to DHCPv6 clients.
     */
    dns: outputs.GetNetworkDhcpV6ServerDns;
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
export interface GetNetworkDhcpV6ServerDns {
    /**
     * When true, upstream DNS entries are propagated. When false, `servers` are used.
     */
    auto: boolean;
    /**
     * IPv6 DNS server addresses for DHCPv6 clients.
     */
    servers: string[];
}
export interface GetNetworkIpv6 {
    /**
     * List of IPv6 aliases for the network.
     */
    aliases: string[];
    /**
     * Specifies which type of IPv6 connection to use.
     */
    interfaceType: string;
    /**
     * IPv6 Prefix Delegation (PD) settings.
     */
    pd: outputs.GetNetworkIpv6Pd;
    /**
     * IPv6 Router Advertisement (RA) settings.
     */
    ra: outputs.GetNetworkIpv6Ra;
    /**
     * The static IPv6 subnet (when `interface_type` is `static`).
     */
    staticSubnet: string;
}
export interface GetNetworkIpv6Pd {
    /**
     * Specifies which WAN interface to use for IPv6 PD. One of `wan` or `wan2`.
     */
    interface: string;
    /**
     * Specifies the IPv6 Prefix ID.
     */
    prefixid: string;
    /**
     * Start address of the DHCPv6 range when `ipv6.interface_type` is `pd`.
     */
    start: string;
    /**
     * End address of the DHCPv6 range when `ipv6.interface_type` is `pd`.
     */
    stop: string;
}
export interface GetNetworkIpv6Ra {
    /**
     * Specifies whether to enable IPv6 router advertisements.
     */
    enabled: boolean;
    /**
     * Preferred lifetime for IPv6 RA, as a Go duration string.
     */
    preferredLifetime: string;
    /**
     * IPv6 router advertisement priority. One of `high`, `medium`, or `low`.
     */
    priority: string;
    /**
     * Total lifetime for the IPv6 RA address, as a Go duration string.
     */
    validLifetime: string;
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
export interface GetNetworkWan {
    /**
     * DNS server IPs of the WAN.
     */
    dns: string[];
    /**
     * Specifies the WAN egress quality of service.
     */
    egressQos: number;
    /**
     * The IPv4 gateway of the WAN.
     */
    gateway: string;
    /**
     * The IPv6 gateway of the WAN.
     */
    gatewayV6: string;
    /**
     * The IPv4 address of the WAN.
     */
    ip: string;
    /**
     * The IPv4 netmask of the WAN.
     */
    netmask: string;
    /**
     * Specifies the WAN network group. One of `WAN`, `WAN2` or `WAN_LTE_FAILOVER`.
     */
    networkGroup: string;
    /**
     * Specifies the IPv4 WAN connection type. One of `disabled`, `static`, `dhcp`, or `pppoe`.
     */
    type: string;
    /**
     * Specifies the IPv6 WAN connection type. One of `disabled`, `static`, or `dhcpv6`.
     */
    typeV6: string;
    /**
     * Specifies the IPv4 WAN username.
     */
    username: string;
}
export interface GetPortProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusProfileInterimUpdate {
    /**
     * Whether interim updates are enabled.
     */
    enabled: boolean;
    /**
     * The interim update interval, as a Go duration string.
     */
    interval: string;
}
export interface GetRadiusProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusProfileVlan {
    /**
     * Whether VLAN is enabled.
     */
    enabled: boolean;
    /**
     * The VLAN WLAN mode.
     */
    wlanMode: string;
}
export interface GetRadiusUserTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusUserTunnel {
    /**
     * See RFC2868 section 3.2.
     */
    mediumType: number;
    /**
     * See RFC2868 section 3.1.
     */
    type: number;
}
export interface NetworkDhcpGuarding {
    /**
     * Specifies whether DHCP guarding is enabled.
     */
    enabled: boolean;
    /**
     * List of allowed DHCP server IP addresses (maximum 3). On `corporate` and `guest` networks the controller only honors DHCP guarding with `setting_preference = "manual"`; when `setting_preference` is not configured, the provider sets it to `manual` automatically whenever `dhcp_guarding.enabled` is `true`.
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
     * DNS servers handed out to DHCP clients.
     */
    dns: outputs.NetworkDhcpServerDns;
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
     * NTP servers handed out to DHCP clients.
     */
    ntp: outputs.NetworkDhcpServerNtp;
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
export interface NetworkDhcpServerDns {
    /**
     * Specifies whether DHCP DNS is enabled.
     */
    enabled: boolean;
    /**
     * List of DNS server addresses for DHCP clients.
     */
    servers?: string[];
}
export interface NetworkDhcpServerNtp {
    /**
     * Specifies whether DHCP NTP is enabled.
     */
    enabled: boolean;
    /**
     * List of NTP server addresses for DHCP clients.
     */
    servers?: string[];
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
     * DNS servers handed out to DHCPv6 clients.
     */
    dns: outputs.NetworkDhcpV6ServerDns;
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
export interface NetworkDhcpV6ServerDns {
    /**
     * Specifies whether DNS auto-discovery is enabled for DHCPv6.
     */
    auto: boolean;
    /**
     * List of DNS server addresses for DHCPv6 clients (maximum 4).
     */
    servers?: string[];
}
export interface NetworkIpv6 {
    /**
     * List of IPv6 aliases for the network. Not currently supported: the underlying UniFi API client has no field for this value, so a non-empty list is rejected at plan time (#413).
     */
    aliases?: string[];
    /**
     * How clients on this network obtain an IPv6 address (UI: Networks → IPv6 → Client Address Assignment). One of `slaac` (SLAAC only), `dhcpv6` (DHCPv6 only), or `slaac-dhcpv6` (both). Computed from the controller when not set.
     */
    clientAddressAssignment: string;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`. Taken from the controller when not set; an adopted network keeps the type it already has (#544).
     */
    interfaceType: string;
    /**
     * IPv6 Prefix Delegation (PD) settings, used when `interface_type` is `pd`.
     */
    pd: outputs.NetworkIpv6Pd;
    /**
     * IPv6 Router Advertisement (RA) settings.
     */
    ra: outputs.NetworkIpv6Ra;
    /**
     * The IPv6 static subnet of the network. Only used when `interface_type` is `static`.
     */
    staticSubnet?: string;
}
export interface NetworkIpv6Pd {
    /**
     * Specifies whether automatic prefix ID assignment is enabled for IPv6 Prefix Delegation.
     */
    autoPrefixidEnabled: boolean;
    /**
     * The IPv6 Prefix Delegation WAN interface (e.g., `wan`, `wan2`).
     */
    interface?: string;
    /**
     * The IPv6 Prefix Delegation prefix ID (hex string, e.g., `0`, `1a`).
     */
    prefixid?: string;
    /**
     * The start of the IPv6 Prefix Delegation range (e.g. `::2`). Required together with `stop` when `ipv6.interface_type` is `pd`, otherwise the controller rejects the network with `api.err.InvalidIpv6Addr`.
     */
    start: string;
    /**
     * The end of the IPv6 Prefix Delegation range (e.g. `::7d1`). Required together with `start` when `ipv6.interface_type` is `pd`.
     */
    stop: string;
}
export interface NetworkIpv6Ra {
    /**
     * Specifies whether IPv6 Router Advertisement (RA) is enabled.
     */
    enabled: boolean;
    /**
     * The IPv6 Router Advertisement preferred lifetime, as a Go duration string (e.g. `14400s`, `4h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    preferredLifetime: string;
    /**
     * The IPv6 Router Advertisement priority. Must be one of `high`, `medium`, or `low`.
     */
    priority: string;
    /**
     * The IPv6 Router Advertisement valid lifetime, as a Go duration string (e.g. `86400s`, `24h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    validLifetime: string;
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
export interface PortProfileDot1x {
    /**
     * The type of 802.1X control to use. Can be `auto`, `force_authorized`, `force_unauthorized`, `mac_based` or `multi_host`.
     */
    ctrl: string;
    /**
     * The idle timeout to use when using MAC Based 802.1X control, as a Go duration string (e.g. `5m`, `300s`). Defaults to `5m0s`.
     */
    idleTimeout: string;
}
export interface PortProfileEgressRateLimit {
    /**
     * Enable egress rate limiting for the port profile. Computed from the controller when not set.
     */
    enabled: boolean;
    /**
     * The egress rate limit, in kbps, for the port profile. Can be between `64` and `9999999`.
     */
    kbps: number;
}
export interface PortProfileLldpmed {
    /**
     * Enable LLDP-MED for the port profile.
     */
    enabled: boolean;
    /**
     * Enable LLDP-MED topology change notifications for the port profile.
     */
    notifyEnabled?: boolean;
}
export interface PortProfilePortSecurity {
    /**
     * Enable port security for the port profile. Computed from the controller when not set.
     */
    enabled: boolean;
    /**
     * The MAC addresses associated with the port security for the port profile.
     */
    macAddresses: string[];
}
export interface PortProfileStormctrl {
    /**
     * broadcast Storm Control for the port profile.
     */
    bcast: outputs.PortProfileStormctrlBcast;
    /**
     * multicast Storm Control for the port profile.
     */
    mcast: outputs.PortProfileStormctrlMcast;
    /**
     * The type of Storm Control to use for the port profile. Can be `level` or `rate`.
     */
    type: string;
    /**
     * unknown unicast Storm Control for the port profile.
     */
    ucast: outputs.PortProfileStormctrlUcast;
}
export interface PortProfileStormctrlBcast {
    /**
     * Enable broadcast Storm Control for the port profile. Computed from the controller when not set.
     */
    enabled: boolean;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    level: number;
    /**
     * The broadcast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    rate: number;
}
export interface PortProfileStormctrlMcast {
    /**
     * Enable multicast Storm Control for the port profile. Computed from the controller when not set.
     */
    enabled: boolean;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    level: number;
    /**
     * The multicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    rate: number;
}
export interface PortProfileStormctrlUcast {
    /**
     * Enable unknown unicast Storm Control for the port profile. Computed from the controller when not set.
     */
    enabled: boolean;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    level: number;
    /**
     * The unknown unicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    rate: number;
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
export interface RadiusProfileInterimUpdate {
    /**
     * Specifies whether to use interim_update.
     */
    enabled: boolean;
    /**
     * Specifies the RADIUS interim update interval, as a Go duration string (e.g. `1h`, `3600s`). Defaults to `1h0m0s`.
     */
    interval: string;
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
export interface RadiusProfileVlan {
    /**
     * Specifies whether to use vlan on wired connections.
     */
    enabled: boolean;
    /**
     * Specifies whether to use vlan on wireless connections. Must be one of `disabled`, `optional`, or `required`.
     */
    wlanMode: string;
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
export interface RadiusUserTunnel {
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    configType?: string;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    mediumType: number;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    type: number;
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
export interface SettingConnectivity {
    /**
     * Enable Wireless Meshing for the site.
     */
    enabled: boolean;
    /**
     * Enable Multi-Link Operation (MLO) for the mesh backhaul. Requires WiFi 7 hardware.
     */
    mloMeshEnabled: boolean;
    /**
     * Host the site uses to verify connectivity when `uplink_type` is `internet`.
     */
    uplinkHost: string;
    /**
     * How the site reaches the controller: `gateway` or `internet`.
     */
    uplinkType: string;
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
export interface SettingGlobalSwitch {
    /**
     * Network IDs with Client Device Isolation enabled (Settings > Networks > "Device Isolation (ACL)"), which blocks all communication between devices in the same network. This is a switch ACL: it covers same-network traffic across access points, which `unifi_wlan.l2_isolation` (one access point) and `unifi_network.network_isolation` (between networks) do not. The controller only offers it for networks routed by a UniFi gateway or L3 switch, and some switch models do not support ACLs at all - it rejects an unsupported network rather than silently ignoring it.
     */
    aclDeviceIsolations: string[];
    /**
     * Enable Rogue DHCP Server Detection (DHCP snooping).
     */
    dhcpSnoop: boolean;
    /**
     * Enable 802.1X port control.
     */
    dot1xPortctrlEnabled: boolean;
    /**
     * Enable jumbo frames on all switches.
     */
    jumboframeEnabled: boolean;
    /**
     * Spanning Tree Protocol mode for all switches: `stp`, `rstp`, or `disabled`.
     */
    stpVersion: string;
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
     * IPS suppression: signature alert suppression entries and whitelisted sources/destinations.
     */
    suppression: outputs.SettingIpsSuppression;
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
export interface SettingIpsSuppression {
    /**
     * IPS signature alert suppression entries — silence specific signatures or categories.
     */
    alerts: outputs.SettingIpsSuppressionAlert[];
    /**
     * IPS suppression whitelist entries — sources/destinations to exclude from inspection.
     */
    whitelists: outputs.SettingIpsSuppressionWhitelist[];
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
     * Automatic device firmware upgrade settings.
     */
    autoUpgrade: outputs.SettingMgmtAutoUpgrade;
    /**
     * Enable debug tools.
     */
    debugToolsEnabled: boolean;
    /**
     * Enable Direct Connect (remote access).
     */
    directConnectEnabled: boolean;
    /**
     * Device SSH access settings.
     */
    ssh: outputs.SettingMgmtSsh;
    /**
     * Enable the UniFi Identity Provider.
     */
    unifiIdpEnabled: boolean;
    /**
     * Enable WiFiman.
     */
    wifimanEnabled: boolean;
}
export interface SettingMgmtAutoUpgrade {
    /**
     * Automatically upgrade device firmware.
     */
    enabled: boolean;
    /**
     * Hour of day (0-23) for automatic firmware upgrades.
     */
    hour: number;
}
export interface SettingMgmtSsh {
    /**
     * Allow SSH password authentication (in addition to keys).
     */
    authPasswordEnabled: boolean;
    /**
     * Enable SSH authentication.
     */
    enabled: boolean;
    /**
     * SSH keys.
     */
    keys: outputs.SettingMgmtSshKey[];
    /**
     * SSH password for device access. Sensitive — the controller stores only a hash, so this value is kept from configuration and not read back.
     */
    password?: string;
    /**
     * SSH username for device access.
     */
    username: string;
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
     * Netconsole logging settings.
     */
    netconsole: outputs.SettingSyslogNetconsole;
    /**
     * Remote syslog server port (1-65535).
     */
    port: number;
    /**
     * Forwarding of this controller's own events to the remote syslog server.
     */
    thisController: outputs.SettingSyslogThisController;
}
export interface SettingSyslogNetconsole {
    /**
     * Whether netconsole logging is enabled. Defaults to `false` when `syslog` is configured and this is not set.
     */
    enabled: boolean;
    /**
     * Netconsole host.
     */
    host: string;
    /**
     * Netconsole port (1-65535).
     */
    port: number;
}
export interface SettingSyslogThisController {
    /**
     * Also log this controller's events.
     */
    enabled: boolean;
    /**
     * Only send this controller's logs over an encrypted channel.
     */
    encryptedOnly: boolean;
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
     * Geo IP filtering (Region Blocking) settings.
     */
    geoIpFiltering: outputs.SettingUsgGeoIpFiltering;
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
     * Hardware offload settings.
     */
    offload: outputs.SettingUsgOffload;
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
     * TCP connection tracking timeouts.
     */
    tcp: outputs.SettingUsgTcp;
    /**
     * Enable TFTP module.
     */
    tftpModule: boolean;
    /**
     * Timeout setting preference: auto or manual.
     */
    timeoutSettingPreference: string;
    /**
     * UDP connection tracking timeouts.
     */
    udp: outputs.SettingUsgUdp;
    /**
     * Unbind WAN monitors.
     */
    unbindWanMonitors: boolean;
    /**
     * UPnP settings.
     */
    upnp: outputs.SettingUsgUpnp;
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
export interface SettingUsgGeoIpFiltering {
    /**
     * Geo IP filtering action: block or allow.
     */
    block: string;
    /**
     * Comma-separated list of country codes for geo IP filtering.
     */
    countries: string;
    /**
     * Enable geo IP filtering.
     */
    enabled: boolean;
    /**
     * Geo IP filtering traffic direction: both, ingress, or egress.
     */
    trafficDirection: string;
}
export interface SettingUsgOffload {
    /**
     * Enable hardware offload for accounting.
     */
    accounting: boolean;
    /**
     * Enable hardware offload for L2 blocking.
     */
    l2Blocking: boolean;
    /**
     * Enable hardware offload for scheduling.
     */
    sch: boolean;
}
export interface SettingUsgTcp {
    /**
     * TCP close timeout, as a Go duration string (e.g. `10s`).
     */
    closeTimeout: string;
    /**
     * TCP close wait timeout, as a Go duration string (e.g. `60s`, `1m`).
     */
    closeWaitTimeout: string;
    /**
     * TCP established connection timeout, as a Go duration string (e.g. `7440s`, `2h4m`).
     */
    establishedTimeout: string;
    /**
     * TCP fin wait timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    finWaitTimeout: string;
    /**
     * TCP last ACK timeout, as a Go duration string (e.g. `30s`).
     */
    lastAckTimeout: string;
    /**
     * TCP SYN received timeout, as a Go duration string (e.g. `60s`, `1m`).
     */
    synRecvTimeout: string;
    /**
     * TCP SYN sent timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    synSentTimeout: string;
    /**
     * TCP time wait timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    timeWaitTimeout: string;
}
export interface SettingUsgUdp {
    /**
     * UDP other timeout, as a Go duration string (e.g. `30s`).
     */
    otherTimeout: string;
    /**
     * UDP stream timeout, as a Go duration string (e.g. `180s`, `3m`).
     */
    streamTimeout: string;
}
export interface SettingUsgUpnp {
    /**
     * Enable UPnP.
     */
    enabled: boolean;
    /**
     * Enable UPnP NAT-PMP.
     */
    natPmpEnabled: boolean;
    /**
     * Enable UPnP secure mode.
     */
    secureMode: boolean;
    /**
     * UPnP WAN interface (e.g., WAN, WAN2).
     */
    wanInterface: string;
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
export interface SiteToSiteVpnEsp {
    /**
     * ESP (phase 2) Diffie-Hellman group (PFS). Only used when `profile = customized`.
     */
    dhGroup: number;
    /**
     * ESP (phase 2) encryption. Only used when `profile = customized`.
     */
    encryption: string;
    /**
     * ESP (phase 2) hash. Only used when `profile = customized`.
     */
    hash: string;
    /**
     * ESP (phase 2) security-association lifetime, as a Go duration string (e.g. `1h`, `3600s`). Must be a whole number of seconds between `30s` and `86400s` (24h).
     */
    lifetime: string;
}
export interface SiteToSiteVpnIke {
    /**
     * IKE (phase 1) Diffie-Hellman group. Only used when `profile = customized`.
     */
    dhGroup: number;
    /**
     * IKE (phase 1) encryption. Only used when `profile = customized`.
     */
    encryption: string;
    /**
     * IKE (phase 1) hash. Only used when `profile = customized`.
     */
    hash: string;
    /**
     * IKE (phase 1) security-association lifetime, as a Go duration string (e.g. `8h`, `28800s`). Must be a whole number of seconds between `30s` and `86400s` (24h).
     */
    lifetime: string;
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
export interface StaticRouteGateway {
    /**
     * The MAC address of the gateway device, used when `type` is `switch`.
     */
    device?: string;
    /**
     * The type of gateway for the static route. Can be `default` or `switch`.
     */
    type: string;
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
     * WireGuard private key for this client. Stored in state; use `private_key_wo` to avoid persisting the secret.
     */
    privateKey?: string;
    privateKeyWo?: string;
    /**
     * Version counter for `private_key_wo`. Increment this value to trigger a private key update.
     */
    privateKeyWoVersion?: number;
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
     * CA certificate and private key generated by the controller.
     */
    ca: outputs.VpnServerOpenvpnCa;
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
     * Server certificate and private key generated by the controller.
     */
    server: outputs.VpnServerOpenvpnServer;
    /**
     * Shared client certificate and private key generated by the controller.
     */
    sharedClient: outputs.VpnServerOpenvpnSharedClient;
}
export interface VpnServerOpenvpnCa {
    /**
     * CA certificate generated by the controller.
     */
    crt: string;
    /**
     * CA private key generated by the controller.
     */
    key: string;
}
export interface VpnServerOpenvpnServer {
    /**
     * Server certificate generated by the controller.
     */
    crt: string;
    /**
     * Server private key generated by the controller.
     */
    key: string;
}
export interface VpnServerOpenvpnSharedClient {
    /**
     * Shared client certificate generated by the controller.
     */
    crt: string;
    /**
     * Shared client private key generated by the controller.
     */
    key: string;
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
     * DHCPv6 prefix delegation configuration
     */
    pd: outputs.WanDhcpv6Pd;
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
export interface WanDhcpv6Pd {
    /**
     * DHCPv6 prefix delegation size
     */
    size: number;
    /**
     * Whether DHCPv6 PD size is automatic
     */
    sizeAuto: boolean;
}
export interface WanDns {
    /**
     * IPv6 DNS configuration
     */
    ipv6: outputs.WanDnsIpv6;
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
export interface WanDnsIpv6 {
    /**
     * IPv6 DNS preference (auto, manual)
     */
    preference: string;
    /**
     * Primary IPv6 DNS server
     */
    primary?: string;
    /**
     * Secondary IPv6 DNS server
     */
    secondary?: string;
}
export interface WanDslite {
    /**
     * The DS-Lite AFTR remote host. Only used when `remote_host_auto` is disabled.
     */
    remoteHost: string;
    /**
     * Whether the DS-Lite AFTR remote host is detected automatically.
     */
    remoteHostAuto: boolean;
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
export interface WlanApGroup {
    /**
     * List of AP group IDs to apply this WLAN to.
     */
    ids?: string[];
    /**
     * Access point group mode.
     */
    mode: string;
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
export interface WlanRadius {
    /**
     * Enable RADIUS MAC authentication. Defaults to `false` when not set.
     */
    macAuthEnabled: boolean;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. The controller may assign a default profile, so this is computed when unset.
     */
    profileId: string;
}
export interface WlanRoamingAssistant6e {
    /**
     * Enable the 6 GHz roaming assistant.
     */
    enabled: boolean;
    /**
     * Signal strength threshold in dBm, `-90` to `-70`. The controller supplies a value when unset.
     */
    rssi: number;
}
export interface WlanRoamingAssistantNa {
    /**
     * Enable the 5 GHz roaming assistant.
     */
    enabled: boolean;
    /**
     * Signal strength threshold in dBm, `-80` to `-60`. The controller supplies a value when unset.
     */
    rssi: number;
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
     * Start time of the block.
     */
    start: outputs.WlanScheduleStart;
}
export interface WlanScheduleStart {
    /**
     * Start hour for the block (0-23).
     */
    hour: number;
    /**
     * Start minute for the block (0-59).
     */
    minute: number;
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
export interface WlanWpa {
    /**
     * WPA encryption. Can be one of `auto`, `ccmp`, `gcmp`, `ccmp-256`, or `gcmp-256`. Computed from the controller when not set.
     */
    enc: string;
    /**
     * WPA mode. Can be one of `auto`, `wpa1`, or `wpa2`.
     */
    mode: string;
}
export interface WlanWpa3 {
    /**
     * Enable WPA3 Enterprise 192-bit mode.
     */
    enhanced192: boolean;
    /**
     * Enable WPA3 fast roaming (802.11r).
     */
    fastRoaming: boolean;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    support: boolean;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3.support` must be true).
     */
    transition: boolean;
}
//# sourceMappingURL=output.d.ts.map
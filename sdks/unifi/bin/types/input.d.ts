import * as pulumi from "@pulumi/pulumi";
import * as inputs from "../types/input";
export interface AccountTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface AccountTunnel {
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    configType?: pulumi.Input<string | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    mediumType?: pulumi.Input<number | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    type?: pulumi.Input<number | undefined>;
}
export interface ApGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface BgpPeer {
    /**
     * Description of this peer group.
     */
    description?: pulumi.Input<string | undefined>;
    /**
     * The peer group name.
     */
    name: pulumi.Input<string>;
    /**
     * List of network CIDR ranges to listen on for this peer group.
     */
    networks?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The remote Autonomous System Number for this peer group.
     */
    remoteAs: pulumi.Input<number>;
}
export interface BgpTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface ClientQosRate {
    /**
     * The ID of the client group (usergroup). If set, this group is used directly.
     */
    id?: pulumi.Input<string | undefined>;
    /**
     * Maximum download rate in kbps.
     */
    maxDown?: pulumi.Input<number | undefined>;
    /**
     * Maximum upload rate in kbps.
     */
    maxUp?: pulumi.Input<number | undefined>;
    /**
     * The name of the client group. If set, the group is looked up or created by name.
     */
    name?: pulumi.Input<string | undefined>;
}
export interface ClientQosRateQosRate {
    /**
     * The QOS maximum download rate.
     */
    maxDown?: pulumi.Input<number | undefined>;
    /**
     * The QOS maximum upload rate.
     */
    maxUp?: pulumi.Input<number | undefined>;
}
export interface ClientQosRateTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface ClientTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface DeviceConfigNetwork {
    /**
     * Enable network bonding.
     */
    bondingEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Primary DNS server.
     */
    dns1?: pulumi.Input<string | undefined>;
    /**
     * Secondary DNS server.
     */
    dns2?: pulumi.Input<string | undefined>;
    /**
     * DNS suffix.
     */
    dnssuffix?: pulumi.Input<string | undefined>;
    /**
     * Gateway address (for static configuration).
     */
    gateway?: pulumi.Input<string | undefined>;
    /**
     * IP address (for static configuration).
     */
    ip?: pulumi.Input<string | undefined>;
    /**
     * Network mask (for static configuration).
     */
    netmask?: pulumi.Input<string | undefined>;
    /**
     * Network configuration type (dhcp or static).
     */
    type?: pulumi.Input<string | undefined>;
}
export interface DeviceLcm {
    /**
     * LCM brightness (1-100).
     */
    brightness?: pulumi.Input<number | undefined>;
    /**
     * Override the site-wide LCM brightness with `brightness`.
     */
    brightnessOverride?: pulumi.Input<boolean | undefined>;
    /**
     * LCM idle timeout, as a Go duration string (e.g. `10m`, `600s`).
     */
    idleTimeout?: pulumi.Input<string | undefined>;
    /**
     * Override the site-wide LCM idle timeout with `idle_timeout`.
     */
    idleTimeoutOverride?: pulumi.Input<boolean | undefined>;
    /**
     * Window during which the display is dimmed.
     */
    nightMode?: pulumi.Input<inputs.DeviceLcmNightMode | undefined>;
}
export interface DeviceLcmNightMode {
    /**
     * Night mode start time, 24-hour `HH:MM`.
     */
    begins?: pulumi.Input<string | undefined>;
    /**
     * Night mode end time, 24-hour `HH:MM`.
     */
    ends?: pulumi.Input<string | undefined>;
}
export interface DeviceLed {
    /**
     * LED brightness (0-100).
     */
    brightness?: pulumi.Input<number | undefined>;
    /**
     * LED color override (hex color code).
     */
    color?: pulumi.Input<string | undefined>;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    override?: pulumi.Input<string | undefined>;
}
export interface DeviceOutletOverride {
    /**
     * Enable power cycle.
     */
    cycleEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Outlet index.
     */
    index: pulumi.Input<number>;
    /**
     * Outlet name.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Relay state (on/off).
     */
    relayState?: pulumi.Input<boolean | undefined>;
}
export interface DevicePortOverride {
    /**
     * Port indices that make up this link-aggregation (LAG) group. Only takes effect when `op_mode` is `aggregate` on this port.
     */
    aggregateMembers?: pulumi.Input<pulumi.Input<number>[] | undefined>;
    /**
     * Enable auto-negotiation for port speed.
     */
    autoneg?: pulumi.Input<boolean | undefined>;
    /**
     * 802.1X port authentication settings.
     */
    dot1x?: pulumi.Input<inputs.DevicePortOverrideDot1x | undefined>;
    /**
     * Egress rate limiting.
     */
    egressRateLimit?: pulumi.Input<inputs.DevicePortOverrideEgressRateLimit | undefined>;
    /**
     * List of network IDs to exclude from this port.
     */
    excludedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Forward Error Correction mode.
     */
    fecMode?: pulumi.Input<string | undefined>;
    /**
     * Enable flow control.
     */
    flowControlEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Forwarding mode.
     */
    forward?: pulumi.Input<string | undefined>;
    /**
     * Enable full duplex mode.
     */
    fullDuplex?: pulumi.Input<boolean | undefined>;
    /**
     * Switch port index.
     */
    index: pulumi.Input<number>;
    /**
     * Enable port isolation.
     */
    isolation?: pulumi.Input<boolean | undefined>;
    /**
     * LLDP-MED settings.
     */
    lldpmed?: pulumi.Input<inputs.DevicePortOverrideLldpmed | undefined>;
    /**
     * Mirror port index.
     */
    mirrorPortIdx?: pulumi.Input<number | undefined>;
    /**
     * List of network IDs for multicast router.
     */
    multicastRouterNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Human-readable name of the port.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Native network ID (VLAN).
     */
    nativeNetworkconfId?: pulumi.Input<string | undefined>;
    /**
     * Operating mode of the port: `switch` (default), `mirror`, or `aggregate`. Set `aggregate` on the lead port of an SFP+/link-aggregation (LAG) group and list the member ports in `aggregate_members`. Only written when not `switch`, as gateway devices (UDM) reject op_mode on update.
     */
    opMode?: pulumi.Input<string | undefined>;
    /**
     * PoE mode of the port; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: pulumi.Input<string | undefined>;
    /**
     * Enable port keepalive.
     */
    portKeepaliveEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * ID of the Port Profile used on this port.
     */
    portProfileId?: pulumi.Input<string | undefined>;
    /**
     * Port security (MAC allow-list) settings.
     */
    portSecurity?: pulumi.Input<inputs.DevicePortOverridePortSecurity | undefined>;
    /**
     * Priority queue 1 level.
     */
    priorityQueue1Level?: pulumi.Input<number | undefined>;
    /**
     * Priority queue 2 level.
     */
    priorityQueue2Level?: pulumi.Input<number | undefined>;
    /**
     * Priority queue 3 level.
     */
    priorityQueue3Level?: pulumi.Input<number | undefined>;
    /**
     * Priority queue 4 level.
     */
    priorityQueue4Level?: pulumi.Input<number | undefined>;
    /**
     * Setting preference.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * Port speed in Mbps.
     */
    speed?: pulumi.Input<number | undefined>;
    /**
     * Storm control settings.
     */
    stormctrl?: pulumi.Input<inputs.DevicePortOverrideStormctrl | undefined>;
    /**
     * STP port mode.
     */
    stpPortMode?: pulumi.Input<boolean | undefined>;
    /**
     * List of network IDs to tag on this port.
     */
    taggedNetworkconfIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Tagged VLAN management.
     */
    taggedVlanMgmt?: pulumi.Input<string | undefined>;
    /**
     * Voice network ID.
     */
    voiceNetworkconfId?: pulumi.Input<string | undefined>;
}
export interface DevicePortOverrideDot1x {
    /**
     * 802.1X control mode.
     */
    ctrl?: pulumi.Input<string | undefined>;
    /**
     * 802.1X idle timeout, as a Go duration string (e.g. `5m`, `300s`).
     */
    idleTimeout?: pulumi.Input<string | undefined>;
}
export interface DevicePortOverrideEgressRateLimit {
    /**
     * Enable egress rate limiting.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Egress rate limit in kbps.
     */
    kbps?: pulumi.Input<number | undefined>;
}
export interface DevicePortOverrideLldpmed {
    /**
     * Enable LLDP-MED.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable LLDP-MED topology change notifications.
     */
    notifyEnabled?: pulumi.Input<boolean | undefined>;
}
export interface DevicePortOverridePortSecurity {
    /**
     * Enable port security.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * List of MAC addresses allowed when port security is enabled.
     */
    macAddresses?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface DevicePortOverrideStormctrl {
    /**
     * Broadcast storm control.
     */
    bcast?: pulumi.Input<inputs.DevicePortOverrideStormctrlBcast | undefined>;
    /**
     * Multicast storm control.
     */
    mcast?: pulumi.Input<inputs.DevicePortOverrideStormctrlMcast | undefined>;
    /**
     * Storm control type; `level` or `rate`.
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * Unknown unicast storm control.
     */
    ucast?: pulumi.Input<inputs.DevicePortOverrideStormctrlUcast | undefined>;
}
export interface DevicePortOverrideStormctrlBcast {
    /**
     * Enable Broadcast storm control.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Broadcast storm control level (percent), used when `type` is `level`.
     */
    level?: pulumi.Input<number | undefined>;
    /**
     * Broadcast storm control rate (packets per second), used when `type` is `rate`.
     */
    rate?: pulumi.Input<number | undefined>;
}
export interface DevicePortOverrideStormctrlMcast {
    /**
     * Enable Multicast storm control.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Multicast storm control level (percent), used when `type` is `level`.
     */
    level?: pulumi.Input<number | undefined>;
    /**
     * Multicast storm control rate (packets per second), used when `type` is `rate`.
     */
    rate?: pulumi.Input<number | undefined>;
}
export interface DevicePortOverrideStormctrlUcast {
    /**
     * Enable Unknown unicast storm control.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Unknown unicast storm control level (percent), used when `type` is `level`.
     */
    level?: pulumi.Input<number | undefined>;
    /**
     * Unknown unicast storm control rate (packets per second), used when `type` is `rate`.
     */
    rate?: pulumi.Input<number | undefined>;
}
export interface DeviceRadioTable {
    /**
     * Antenna gain.
     */
    antennaGain?: pulumi.Input<number | undefined>;
    /**
     * Antenna ID.
     */
    antennaId?: pulumi.Input<number | undefined>;
    /**
     * **Moved to `unifi_wlan.roaming_assistant_na.enabled`** (and `roaming_assistant_6e.enabled` for 6 GHz). UniFi Network 10.x moved assisted roaming from the device's radio table onto the WLAN, so this attribute no longer reaches the controller. Still accepted and preserved in state for one release.
     *
     * @deprecated Deprecated
     */
    assistedRoamingEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * **Moved to `unifi_wlan.roaming_assistant_na.rssi`** (and `roaming_assistant_6e.rssi` for 6 GHz). UniFi Network 10.x moved assisted roaming from the device's radio table onto the WLAN, so this attribute no longer reaches the controller. Still accepted and preserved in state for one release.
     *
     * @deprecated Deprecated
     */
    assistedRoamingRssi?: pulumi.Input<number | undefined>;
    /**
     * Channel number or 'auto'.
     */
    channel?: pulumi.Input<string | undefined>;
    /**
     * Enable DFS (Dynamic Frequency Selection).
     */
    dfs?: pulumi.Input<boolean | undefined>;
    /**
     * Enable hard noise floor.
     */
    hardNoiseFloorEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Channel width (20, 40, 80, 160).
     */
    ht?: pulumi.Input<number | undefined>;
    /**
     * Enable load balancing.
     */
    loadbalanceEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Maximum number of stations.
     */
    maxsta?: pulumi.Input<number | undefined>;
    /**
     * Minimum RSSI value.
     */
    minRssi?: pulumi.Input<number | undefined>;
    /**
     * Enable minimum RSSI.
     */
    minRssiEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Radio name.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Radio band (ng, na, ad, 6e).
     */
    radio?: pulumi.Input<string | undefined>;
    /**
     * Sensitivity level.
     */
    sensLevel?: pulumi.Input<number | undefined>;
    /**
     * Enable sensitivity level.
     */
    sensLevelEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Transmit power or 'auto'.
     */
    txPower?: pulumi.Input<string | undefined>;
    /**
     * Transmit power mode (auto, medium, high, low, custom).
     */
    txPowerMode?: pulumi.Input<string | undefined>;
    /**
     * Enable virtual wire.
     */
    vwireEnabled?: pulumi.Input<boolean | undefined>;
}
export interface DeviceStp {
    /**
     * STP bridge priority.
     */
    priority?: pulumi.Input<number | undefined>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    version?: pulumi.Input<string | undefined>;
}
export interface DeviceTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface DnsRecordTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface DynamicDnsTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface FirewallGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface FirewallPolicyDestination {
    /**
     * List of client MAC addresses to match. Used when `matching_target` is `CLIENT`.
     */
    clientMacs?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * ID of a `unifi.FirewallGroup` (address-group type) to match. Used when `matching_target` is `IP` with `matching_target_type = OBJECT`.
     */
    ipGroupId?: pulumi.Input<string | undefined>;
    /**
     * List of IP addresses or CIDR ranges to match. Used when `matching_target` is `IP`.
     */
    ips?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Match the clients in `client_macs` by MAC address rather than by their current IP address. Corresponds to the controller's `match_mac` flag on a `CLIENT` matching target. Defaults to `false`.
     */
    matchMac?: pulumi.Input<boolean | undefined>;
    /**
     * Invert the IP match: when `true`, the endpoint matches every address **except** those in `ips` / `ip_group_id`. Corresponds to the "Match Opposite" toggle on an `IP` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeIps?: pulumi.Input<boolean | undefined>;
    /**
     * Invert the network match: when `true`, the endpoint matches every network **except** those in `network_ids`. Corresponds to the "Match Opposite" toggle on a `NETWORK` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeNetworks?: pulumi.Input<boolean | undefined>;
    /**
     * Invert the port match: when `true`, the endpoint matches every port **except** those in `port` / `port_group_id`. Corresponds to the "Match Opposite" toggle on the port selector in the UniFi UI. Defaults to `false`.
     */
    matchOppositePorts?: pulumi.Input<boolean | undefined>;
    /**
     * What to match: `ANY`, `NETWORK`, `CLIENT`, `IP`, `DEVICE`, `MAC`, `WEB` (domains/FQDN), or `REGION` (country codes, set `regions`). The controller only accepts `REGION` on an external zone.
     */
    matchingTarget: pulumi.Input<string>;
    /**
     * How the matching target is specified (`ANY`, `SPECIFIC`, `LIST`, `OBJECT`). Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    matchingTargetType?: pulumi.Input<string | undefined>;
    /**
     * List of UniFi network IDs to match. Used when `matching_target` is `NETWORK`.
     */
    networkIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Port(s) to match when `port_matching_type` is `SPECIFIC`. A single port (`161`) or a comma-separated list of ports/ranges (`80,443`, `8000-8100`). Leave unset for no port match.
     */
    port?: pulumi.Input<string | undefined>;
    /**
     * ID of a `unifi.FirewallGroup` (port-group type) to match. Used when `port_matching_type` is `OBJECT`.
     */
    portGroupId?: pulumi.Input<string | undefined>;
    /**
     * How to match ports: `ANY`, `SPECIFIC`, or `OBJECT` (port group).
     */
    portMatchingType?: pulumi.Input<string | undefined>;
    /**
     * Two-letter ISO country codes to match (for example `["DE", "US"]`). Used when `matching_target` is `REGION`, which the controller only accepts on an external zone. The controller rejects an update that leaves the list empty, so a policy matching on region must always carry at least one code.
     */
    regions?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * List of domains/FQDNs to match. Used when `matching_target` is `WEB`.
     */
    webDomains?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The ID of the firewall zone this endpoint belongs to. Use the `unifi.FirewallZone` data source to look up zone IDs by name.
     */
    zoneId: pulumi.Input<string>;
}
export interface FirewallPolicyIcmp {
    /**
     * ICMP type matching mode. Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    typename?: pulumi.Input<string | undefined>;
    /**
     * ICMPv6 type matching mode. Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    v6Typename?: pulumi.Input<string | undefined>;
}
export interface FirewallPolicySchedule {
    /**
     * Date used by `ONE_TIME_ONLY`, in `YYYY-MM-DD` format.
     */
    date?: pulumi.Input<string | undefined>;
    /**
     * End date used by `CUSTOM`, in `YYYY-MM-DD` format.
     */
    dateEnd?: pulumi.Input<string | undefined>;
    /**
     * Start date used by `CUSTOM`, in `YYYY-MM-DD` format.
     */
    dateStart?: pulumi.Input<string | undefined>;
    /**
     * Schedule mode.
     */
    mode?: pulumi.Input<string | undefined>;
    /**
     * Clear inherited fields that are unused by the selected mode.
     */
    normalize?: pulumi.Input<boolean | undefined>;
    /**
     * Weekdays on which the policy is active.
     */
    repeatOnDays?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Time of day during which a timed schedule is active.
     */
    time?: pulumi.Input<inputs.FirewallPolicyScheduleTime | undefined>;
}
export interface FirewallPolicyScheduleTime {
    /**
     * Whether the policy is active all day.
     */
    allDay?: pulumi.Input<boolean | undefined>;
    /**
     * Time range during which the policy is active when `all_day` is false.
     */
    range?: pulumi.Input<inputs.FirewallPolicyScheduleTimeRange | undefined>;
}
export interface FirewallPolicyScheduleTimeRange {
    /**
     * End time in 24-hour `HH:MM` format.
     */
    end?: pulumi.Input<string | undefined>;
    /**
     * Start time in 24-hour `HH:MM` format.
     */
    start?: pulumi.Input<string | undefined>;
}
export interface FirewallPolicySource {
    /**
     * List of client MAC addresses to match. Used when `matching_target` is `CLIENT`.
     */
    clientMacs?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * ID of a `unifi.FirewallGroup` (address-group type) to match. Used when `matching_target` is `IP` with `matching_target_type = OBJECT`.
     */
    ipGroupId?: pulumi.Input<string | undefined>;
    /**
     * List of IP addresses or CIDR ranges to match. Used when `matching_target` is `IP`.
     */
    ips?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Match the clients in `client_macs` by MAC address rather than by their current IP address. Corresponds to the controller's `match_mac` flag on a `CLIENT` matching target. Defaults to `false`.
     */
    matchMac?: pulumi.Input<boolean | undefined>;
    /**
     * Invert the IP match: when `true`, the endpoint matches every address **except** those in `ips` / `ip_group_id`. Corresponds to the "Match Opposite" toggle on an `IP` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeIps?: pulumi.Input<boolean | undefined>;
    /**
     * Invert the network match: when `true`, the endpoint matches every network **except** those in `network_ids`. Corresponds to the "Match Opposite" toggle on a `NETWORK` matching target in the UniFi UI. Defaults to `false`.
     */
    matchOppositeNetworks?: pulumi.Input<boolean | undefined>;
    /**
     * Invert the port match: when `true`, the endpoint matches every port **except** those in `port` / `port_group_id`. Corresponds to the "Match Opposite" toggle on the port selector in the UniFi UI. Defaults to `false`.
     */
    matchOppositePorts?: pulumi.Input<boolean | undefined>;
    /**
     * What to match: `ANY`, `NETWORK`, `CLIENT`, `IP`, `DEVICE`, `MAC`, `WEB` (domains/FQDN), or `REGION` (country codes, set `regions`). The controller only accepts `REGION` on an external zone.
     */
    matchingTarget: pulumi.Input<string>;
    /**
     * How the matching target is specified (`ANY`, `SPECIFIC`, `LIST`, `OBJECT`). Managed by the UniFi controller; the provider round-trips it so updates are accepted.
     */
    matchingTargetType?: pulumi.Input<string | undefined>;
    /**
     * List of UniFi network IDs to match. Used when `matching_target` is `NETWORK`.
     */
    networkIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Port(s) to match when `port_matching_type` is `SPECIFIC`. A single port (`161`) or a comma-separated list of ports/ranges (`80,443`, `8000-8100`). Leave unset for no port match.
     */
    port?: pulumi.Input<string | undefined>;
    /**
     * ID of a `unifi.FirewallGroup` (port-group type) to match. Used when `port_matching_type` is `OBJECT`.
     */
    portGroupId?: pulumi.Input<string | undefined>;
    /**
     * How to match ports: `ANY`, `SPECIFIC`, or `OBJECT` (port group).
     */
    portMatchingType?: pulumi.Input<string | undefined>;
    /**
     * Two-letter ISO country codes to match (for example `["DE", "US"]`). Used when `matching_target` is `REGION`, which the controller only accepts on an external zone. The controller rejects an update that leaves the list empty, so a policy matching on region must always carry at least one code.
     */
    regions?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * List of domains/FQDNs to match. Used when `matching_target` is `WEB`.
     */
    webDomains?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The ID of the firewall zone this endpoint belongs to. Use the `unifi.FirewallZone` data source to look up zone IDs by name.
     */
    zoneId: pulumi.Input<string>;
}
export interface FirewallPolicyTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface FirewallRuleDestination {
    /**
     * The destination address of the firewall rule.
     */
    address?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 destination address of the firewall rule.
     */
    addressIpv6?: pulumi.Input<string | undefined>;
    /**
     * The destination firewall group IDs of the firewall rule.
     */
    firewallGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The destination network ID of the firewall rule.
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * The destination network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    networkType?: pulumi.Input<string | undefined>;
    /**
     * The destination port of the firewall rule.
     */
    port?: pulumi.Input<string | undefined>;
}
export interface FirewallRuleIcmp {
    /**
     * ICMP type name.
     */
    typename?: pulumi.Input<string | undefined>;
    /**
     * ICMPv6 type name.
     */
    v6Typename?: pulumi.Input<string | undefined>;
}
export interface FirewallRuleSource {
    /**
     * The source address for the firewall rule.
     */
    address?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 source address for the firewall rule.
     */
    addressIpv6?: pulumi.Input<string | undefined>;
    /**
     * The source firewall group IDs for the firewall rule.
     */
    firewallGroupIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The source MAC address of the firewall rule.
     */
    mac?: pulumi.Input<string | undefined>;
    /**
     * The source network ID for the firewall rule.
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * The source network type of the firewall rule. Can be one of `ADDRv4` or `NETv4`.
     */
    networkType?: pulumi.Input<string | undefined>;
    /**
     * The source port of the firewall rule.
     */
    port?: pulumi.Input<string | undefined>;
}
export interface FirewallRuleState {
    /**
     * Match where the state is established.
     */
    established?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is invalid.
     */
    invalid?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is new.
     */
    new?: pulumi.Input<boolean | undefined>;
    /**
     * Match where the state is related.
     */
    related?: pulumi.Input<boolean | undefined>;
}
export interface FirewallRuleTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface FirewallZoneTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface GetAccountTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetAccountTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetApGroupTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetApGroupTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetClientInfoListTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientInfoListTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetClientInfoTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientInfoTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetClientListTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientListTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetClientQosRateTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientQosRateTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetClientTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetClientTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetDnsRecordTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetDnsRecordTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetFirewallZoneTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetFirewallZoneTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetNetworkTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetNetworkTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetPortProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetPortProfileTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetRadiusProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusProfileTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface GetRadiusUserTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: string;
}
export interface GetRadiusUserTimeoutsArgs {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    read?: pulumi.Input<string | undefined>;
}
export interface NetworkDhcpGuarding {
    /**
     * Specifies whether DHCP guarding is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * List of allowed DHCP server IP addresses (maximum 3). On `corporate` and `guest` networks the controller only honors DHCP guarding with `setting_preference = "manual"`; when `setting_preference` is not configured, the provider sets it to `manual` automatically whenever `dhcp_guarding.enabled` is `true`.
     */
    servers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface NetworkDhcpRelay {
    /**
     * Specifies whether DHCP relay is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * List of DHCP relay server addresses.
     */
    servers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface NetworkDhcpServer {
    /**
     * DHCP boot settings.
     */
    boot?: pulumi.Input<inputs.NetworkDhcpServerBoot | undefined>;
    /**
     * Specifies whether DHCP conflict checking is enabled.
     */
    conflictChecking?: pulumi.Input<boolean | undefined>;
    /**
     * DNS servers handed out to DHCP clients.
     */
    dns?: pulumi.Input<inputs.NetworkDhcpServerDns | undefined>;
    /**
     * Specifies whether DHCP server is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether DHCP gateway is enabled.
     */
    gatewayEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies the DHCP lease time, as a Go duration string (e.g. `24h`, `86400s`). Defaults to `24h0m0s`.
     */
    leasetime?: pulumi.Input<string | undefined>;
    /**
     * NTP servers handed out to DHCP clients.
     */
    ntp?: pulumi.Input<inputs.NetworkDhcpServerNtp | undefined>;
    /**
     * The IPv4 address where the DHCP range starts.
     */
    start?: pulumi.Input<string | undefined>;
    /**
     * The IPv4 address where the DHCP range stops.
     */
    stop?: pulumi.Input<string | undefined>;
    /**
     * TFTP server address.
     */
    tftpServer?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether DHCP time offset is enabled.
     */
    timeOffsetEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * UniFi controller IP address.
     */
    unifiController?: pulumi.Input<string | undefined>;
    /**
     * WINS server configuration.
     */
    wins?: pulumi.Input<inputs.NetworkDhcpServerWins | undefined>;
    /**
     * WPAD URL for proxy auto-configuration.
     */
    wpadUrl?: pulumi.Input<string | undefined>;
}
export interface NetworkDhcpServerBoot {
    /**
     * Toggles DHCP boot options.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Boot filename.
     */
    filename?: pulumi.Input<string | undefined>;
    /**
     * TFTP server for boot options.
     */
    server?: pulumi.Input<string | undefined>;
}
export interface NetworkDhcpServerDns {
    /**
     * Specifies whether DHCP DNS is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * List of DNS server addresses for DHCP clients.
     */
    servers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface NetworkDhcpServerNtp {
    /**
     * Specifies whether DHCP NTP is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * List of NTP server addresses for DHCP clients.
     */
    servers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface NetworkDhcpServerWins {
    /**
     * List of WINS server addresses (maximum 2).
     */
    addresses?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Specifies whether DHCP WINS is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
}
export interface NetworkDhcpV6Server {
    /**
     * DNS servers handed out to DHCPv6 clients.
     */
    dns?: pulumi.Input<inputs.NetworkDhcpV6ServerDns | undefined>;
    /**
     * Specifies whether the DHCPv6 server is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The lease time for DHCPv6 addresses in seconds.
     */
    lease?: pulumi.Input<number | undefined>;
    /**
     * The start of the DHCPv6 address range.
     */
    start?: pulumi.Input<string | undefined>;
    /**
     * The end of the DHCPv6 address range.
     */
    stop?: pulumi.Input<string | undefined>;
}
export interface NetworkDhcpV6ServerDns {
    /**
     * Specifies whether DNS auto-discovery is enabled for DHCPv6.
     */
    auto?: pulumi.Input<boolean | undefined>;
    /**
     * List of DNS server addresses for DHCPv6 clients (maximum 4).
     */
    servers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface NetworkIpv6 {
    /**
     * List of IPv6 aliases for the network. Not currently supported: the underlying UniFi API client has no field for this value, so a non-empty list is rejected at plan time (#413).
     */
    aliases?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * How clients on this network obtain an IPv6 address (UI: Networks → IPv6 → Client Address Assignment). One of `slaac` (SLAAC only), `dhcpv6` (DHCPv6 only), or `slaac-dhcpv6` (both). Computed from the controller when not set.
     */
    clientAddressAssignment?: pulumi.Input<string | undefined>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`. Taken from the controller when not set; an adopted network keeps the type it already has (#544).
     */
    interfaceType?: pulumi.Input<string | undefined>;
    /**
     * IPv6 Prefix Delegation (PD) settings, used when `interface_type` is `pd`.
     */
    pd?: pulumi.Input<inputs.NetworkIpv6Pd | undefined>;
    /**
     * IPv6 Router Advertisement (RA) settings.
     */
    ra?: pulumi.Input<inputs.NetworkIpv6Ra | undefined>;
    /**
     * The IPv6 static subnet of the network. Only used when `interface_type` is `static`.
     */
    staticSubnet?: pulumi.Input<string | undefined>;
}
export interface NetworkIpv6Pd {
    /**
     * Specifies whether automatic prefix ID assignment is enabled for IPv6 Prefix Delegation.
     */
    autoPrefixidEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 Prefix Delegation WAN interface (e.g., `wan`, `wan2`).
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Prefix Delegation prefix ID (hex string, e.g., `0`, `1a`).
     */
    prefixid?: pulumi.Input<string | undefined>;
    /**
     * The start of the IPv6 Prefix Delegation range (e.g. `::2`). Required together with `stop` when `ipv6.interface_type` is `pd`, otherwise the controller rejects the network with `api.err.InvalidIpv6Addr`.
     */
    start?: pulumi.Input<string | undefined>;
    /**
     * The end of the IPv6 Prefix Delegation range (e.g. `::7d1`). Required together with `start` when `ipv6.interface_type` is `pd`.
     */
    stop?: pulumi.Input<string | undefined>;
}
export interface NetworkIpv6Ra {
    /**
     * Specifies whether IPv6 Router Advertisement (RA) is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 Router Advertisement preferred lifetime, as a Go duration string (e.g. `14400s`, `4h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    preferredLifetime?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Router Advertisement priority. Must be one of `high`, `medium`, or `low`.
     */
    priority?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Router Advertisement valid lifetime, as a Go duration string (e.g. `86400s`, `24h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    validLifetime?: pulumi.Input<string | undefined>;
}
export interface NetworkNatOutboundIpAddress {
    /**
     * The IP address.
     */
    ipAddress?: pulumi.Input<string | undefined>;
    /**
     * The IP address pool.
     */
    ipAddressPools?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The mode.
     */
    mode?: pulumi.Input<string | undefined>;
    /**
     * The WAN network group.
     */
    wanNetworkGroup?: pulumi.Input<string | undefined>;
}
export interface NetworkTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface PortForwardDestinationIp {
    /**
     * The destination IPv4 address. Use `any` for all addresses.
     */
    destinationIp?: pulumi.Input<string | undefined>;
    /**
     * The WAN interface for this destination (e.g. `wan`, `wan2`).
     */
    interface?: pulumi.Input<string | undefined>;
}
export interface PortForwardForward {
    /**
     * The forward IPv4 address to send traffic to.
     */
    ip?: pulumi.Input<string | undefined>;
    /**
     * The forward port or port range (e.g. `1-10,11,12`).
     */
    port?: pulumi.Input<string | undefined>;
}
export interface PortForwardSourceLimiting {
    /**
     * Specifies whether source limiting is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The ID of the firewall group to use for source limiting.
     */
    firewallGroupId?: pulumi.Input<string | undefined>;
    /**
     * The source IPv4 address (or CIDR) of the port forwarding rule. For all traffic, specify `any`.
     */
    ip?: pulumi.Input<string | undefined>;
    /**
     * The source limiting type. Can be `ip` or `firewall_group`. Inferred automatically when only one of `ip` or `firewall_group_id` is set.
     */
    type?: pulumi.Input<string | undefined>;
}
export interface PortForwardTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface PortForwardWan {
    /**
     * The WAN interface. Can be `wan`, `wan2`, or `both`.
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * The WAN IP address for the port forwarding rule. Use `any` for all addresses.
     */
    ipAddress?: pulumi.Input<string | undefined>;
    /**
     * The WAN port or port range (e.g. `1-10,11,12`).
     */
    port?: pulumi.Input<string | undefined>;
}
export interface PortProfileDot1x {
    /**
     * The type of 802.1X control to use. Can be `auto`, `force_authorized`, `force_unauthorized`, `mac_based` or `multi_host`.
     */
    ctrl?: pulumi.Input<string | undefined>;
    /**
     * The idle timeout to use when using MAC Based 802.1X control, as a Go duration string (e.g. `5m`, `300s`). Defaults to `5m0s`.
     */
    idleTimeout?: pulumi.Input<string | undefined>;
}
export interface PortProfileEgressRateLimit {
    /**
     * Enable egress rate limiting for the port profile. Computed from the controller when not set.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The egress rate limit, in kbps, for the port profile. Can be between `64` and `9999999`.
     */
    kbps?: pulumi.Input<number | undefined>;
}
export interface PortProfileLldpmed {
    /**
     * Enable LLDP-MED for the port profile.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable LLDP-MED topology change notifications for the port profile.
     */
    notifyEnabled?: pulumi.Input<boolean | undefined>;
}
export interface PortProfilePortSecurity {
    /**
     * Enable port security for the port profile. Computed from the controller when not set.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The MAC addresses associated with the port security for the port profile.
     */
    macAddresses?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface PortProfileStormctrl {
    /**
     * broadcast Storm Control for the port profile.
     */
    bcast?: pulumi.Input<inputs.PortProfileStormctrlBcast | undefined>;
    /**
     * multicast Storm Control for the port profile.
     */
    mcast?: pulumi.Input<inputs.PortProfileStormctrlMcast | undefined>;
    /**
     * The type of Storm Control to use for the port profile. Can be `level` or `rate`.
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * unknown unicast Storm Control for the port profile.
     */
    ucast?: pulumi.Input<inputs.PortProfileStormctrlUcast | undefined>;
}
export interface PortProfileStormctrlBcast {
    /**
     * Enable broadcast Storm Control for the port profile. Computed from the controller when not set.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The broadcast Storm Control level for the port profile. Can be between 0 and 100.
     */
    level?: pulumi.Input<number | undefined>;
    /**
     * The broadcast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    rate?: pulumi.Input<number | undefined>;
}
export interface PortProfileStormctrlMcast {
    /**
     * Enable multicast Storm Control for the port profile. Computed from the controller when not set.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The multicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    level?: pulumi.Input<number | undefined>;
    /**
     * The multicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    rate?: pulumi.Input<number | undefined>;
}
export interface PortProfileStormctrlUcast {
    /**
     * Enable unknown unicast Storm Control for the port profile. Computed from the controller when not set.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The unknown unicast Storm Control level for the port profile. Can be between 0 and 100.
     */
    level?: pulumi.Input<number | undefined>;
    /**
     * The unknown unicast Storm Control rate for the port profile. Can be between 0 and 14880000.
     */
    rate?: pulumi.Input<number | undefined>;
}
export interface PortProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface PowerSupervisorPowerSource {
    /**
     * Index of the supervised device's PSU.
     */
    clientPsuIndex?: pulumi.Input<number | undefined>;
    /**
     * Port/outlet index on the upstream source.
     */
    powerSourceIndex?: pulumi.Input<number | undefined>;
    /**
     * MAC of the upstream source (e.g. the PoE switch).
     */
    powerSourceMac?: pulumi.Input<string | undefined>;
    /**
     * Type of the upstream source (e.g. `poe_port`).
     */
    powerSourceType?: pulumi.Input<string | undefined>;
}
export interface PowerSupervisorTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface RadiusProfileAcctServer {
    /**
     * IP address of the accounting server. Optional: the controller-managed default profile returns a server entry without an IP, so importing it must not force one.
     */
    ip?: pulumi.Input<string | undefined>;
    /**
     * Port of accounting service.
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * Shared secret for accounting server.
     */
    secret: pulumi.Input<string>;
}
export interface RadiusProfileAuthServer {
    /**
     * IP address of the authentication server. Optional: the controller-managed default profile (e.g. the one created when a gateway RADIUS/VPN service is enabled, with `use_usg_auth_server = true`) returns a server entry without an IP, so importing it must not force one.
     */
    ip?: pulumi.Input<string | undefined>;
    /**
     * Port of authentication service.
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * Shared secret for authentication server.
     */
    secret: pulumi.Input<string>;
}
export interface RadiusProfileInterimUpdate {
    /**
     * Specifies whether to use interim_update.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies the RADIUS interim update interval, as a Go duration string (e.g. `1h`, `3600s`). Defaults to `1h0m0s`.
     */
    interval?: pulumi.Input<string | undefined>;
}
export interface RadiusProfileTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface RadiusProfileVlan {
    /**
     * Specifies whether to use vlan on wired connections.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether to use vlan on wireless connections. Must be one of `disabled`, `optional`, or `required`.
     */
    wlanMode?: pulumi.Input<string | undefined>;
}
export interface RadiusUserTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface RadiusUserTunnel {
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    configType?: pulumi.Input<string | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    mediumType?: pulumi.Input<number | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    type?: pulumi.Input<number | undefined>;
}
export interface SettingAutoSpeedtest {
    /**
     * Cron expression controlling when the speed test runs (e.g. `0 * * * *`).
     */
    cronExpr?: pulumi.Input<string | undefined>;
    /**
     * Whether periodic automated speed tests are enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
}
export interface SettingConnectivity {
    /**
     * Enable Wireless Meshing for the site.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable Multi-Link Operation (MLO) for the mesh backhaul. Requires WiFi 7 hardware.
     */
    mloMeshEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Host the site uses to verify connectivity when `uplink_type` is `internet`.
     */
    uplinkHost?: pulumi.Input<string | undefined>;
    /**
     * How the site reaches the controller: `gateway` or `internet`.
     */
    uplinkType?: pulumi.Input<string | undefined>;
}
export interface SettingCountry {
    /**
     * Regulatory country code (ISO 3166-1 numeric).
     */
    code: pulumi.Input<number>;
}
export interface SettingDoh {
    /**
     * Custom DNS servers specified via DNS stamp.
     */
    customServers?: pulumi.Input<pulumi.Input<inputs.SettingDohCustomServer>[] | undefined>;
    /**
     * Predefined DNS provider names (e.g. "cloudflare", "google").
     */
    serverNames?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Encrypted DNS state: off, auto, manual, or custom.
     */
    state?: pulumi.Input<string | undefined>;
}
export interface SettingDohCustomServer {
    /**
     * Enable this custom server. Defaults to true.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * DNS stamp (sdns://) for the custom resolver.
     */
    sdnsStamp: pulumi.Input<string>;
    /**
     * Human-readable name for this custom server.
     */
    serverName: pulumi.Input<string>;
}
export interface SettingDpi {
    /**
     * Whether DPI is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Whether device fingerprinting is enabled.
     */
    fingerprintingEnabled?: pulumi.Input<boolean | undefined>;
}
export interface SettingGlobalSwitch {
    /**
     * Network IDs with Client Device Isolation enabled (Settings > Networks > "Device Isolation (ACL)"), which blocks all communication between devices in the same network. This is a switch ACL: it covers same-network traffic across access points, which `unifi_wlan.l2_isolation` (one access point) and `unifi_network.network_isolation` (between networks) do not. The controller only offers it for networks routed by a UniFi gateway or L3 switch, and some switch models do not support ACLs at all - it rejects an unsupported network rather than silently ignoring it.
     */
    aclDeviceIsolations?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Enable Rogue DHCP Server Detection (DHCP snooping).
     */
    dhcpSnoop?: pulumi.Input<boolean | undefined>;
    /**
     * Enable 802.1X port control.
     */
    dot1xPortctrlEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable jumbo frames on all switches.
     */
    jumboframeEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Spanning Tree Protocol mode for all switches: `stp`, `rstp`, or `disabled`.
     */
    stpVersion?: pulumi.Input<string | undefined>;
}
export interface SettingIgmpSnooping {
    /**
     * Whether IGMP snooping is enabled for the site.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * IDs of the networks IGMP snooping applies to.
     */
    networkIds?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface SettingIps {
    /**
     * Advanced filtering mode: manual or disabled.
     */
    advancedFilteringPreference?: pulumi.Input<string | undefined>;
    /**
     * Show a blocking page when content filtering blocks a request.
     */
    contentFilteringBlockingPageEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Emerging Threats ruleset categories to enable (e.g. "emerging-malware", "tor", "phishing").
     */
    enabledCategories?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Network IDs to apply IPS inspection to.
     */
    enabledNetworks?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Enable honeypot to detect internal port scans.
     */
    honeypotEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Honeypot IP addresses per network.
     */
    honeypots?: pulumi.Input<pulumi.Input<inputs.SettingIpsHoneypot>[] | undefined>;
    /**
     * IPS operating mode: ids (detect only), ips (detect and block), ipsInline, or disabled.
     */
    ipsMode?: pulumi.Input<string | undefined>;
    /**
     * Use memory-optimized IPS ruleset (reduced rule set for low-memory devices).
     */
    memoryOptimized?: pulumi.Input<boolean | undefined>;
    /**
     * Block BitTorrent traffic.
     */
    restrictTorrents?: pulumi.Input<boolean | undefined>;
    /**
     * IPS suppression: signature alert suppression entries and whitelisted sources/destinations.
     */
    suppression?: pulumi.Input<inputs.SettingIpsSuppression | undefined>;
}
export interface SettingIpsHoneypot {
    /**
     * IP address to use as a honeypot.
     */
    ipAddress: pulumi.Input<string>;
    /**
     * Network ID this honeypot IP belongs to.
     */
    networkId: pulumi.Input<string>;
    /**
     * IP version: v4 or v6.
     */
    version: pulumi.Input<string>;
}
export interface SettingIpsSuppression {
    /**
     * IPS signature alert suppression entries — silence specific signatures or categories.
     */
    alerts?: pulumi.Input<pulumi.Input<inputs.SettingIpsSuppressionAlert>[] | undefined>;
    /**
     * IPS suppression whitelist entries — sources/destinations to exclude from inspection.
     */
    whitelists?: pulumi.Input<pulumi.Input<inputs.SettingIpsSuppressionWhitelist>[] | undefined>;
}
export interface SettingIpsSuppressionAlert {
    /**
     * Alert suppression signature category.
     */
    category?: pulumi.Input<string | undefined>;
    /**
     * Signature Generator ID (GID).
     */
    gid?: pulumi.Input<number | undefined>;
    /**
     * Signature ID.
     */
    id?: pulumi.Input<number | undefined>;
    /**
     * Suppression signature name.
     */
    signature?: pulumi.Input<string | undefined>;
    /**
     * Tracking specifications (used when `type` is `track`).
     */
    trackings?: pulumi.Input<pulumi.Input<inputs.SettingIpsSuppressionAlertTracking>[] | undefined>;
    /**
     * Suppression type: `all` (everywhere) or `track` (only the tracked sources/destinations).
     */
    type?: pulumi.Input<string | undefined>;
}
export interface SettingIpsSuppressionAlertTracking {
    /**
     * Match direction: both, src, or dest.
     */
    direction: pulumi.Input<string>;
    /**
     * Match mode: ip, subnet, or network.
     */
    mode: pulumi.Input<string>;
    /**
     * IP address, CIDR subnet, or network ID to match.
     */
    value: pulumi.Input<string>;
}
export interface SettingIpsSuppressionWhitelist {
    /**
     * Match direction: both, src, or dest.
     */
    direction: pulumi.Input<string>;
    /**
     * Match mode: ip, subnet, or network.
     */
    mode: pulumi.Input<string>;
    /**
     * IP address, CIDR subnet, or network ID to whitelist.
     */
    value: pulumi.Input<string>;
}
export interface SettingLcm {
    /**
     * Display brightness (1-100).
     */
    brightness?: pulumi.Input<number | undefined>;
    /**
     * Whether the device display is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Seconds of inactivity before the display turns off (10-3600).
     */
    idleTimeout?: pulumi.Input<number | undefined>;
    /**
     * Sync display settings across devices.
     */
    sync?: pulumi.Input<boolean | undefined>;
    /**
     * Whether touch events on the display are enabled.
     */
    touchEvent?: pulumi.Input<boolean | undefined>;
}
export interface SettingMgmt {
    /**
     * Enable advanced features.
     */
    advancedFeatureEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Automatic device firmware upgrade settings.
     */
    autoUpgrade?: pulumi.Input<inputs.SettingMgmtAutoUpgrade | undefined>;
    /**
     * Enable debug tools.
     */
    debugToolsEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable Direct Connect (remote access).
     */
    directConnectEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Device SSH access settings.
     */
    ssh?: pulumi.Input<inputs.SettingMgmtSsh | undefined>;
    /**
     * Enable the UniFi Identity Provider.
     */
    unifiIdpEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WiFiman.
     */
    wifimanEnabled?: pulumi.Input<boolean | undefined>;
}
export interface SettingMgmtAutoUpgrade {
    /**
     * Automatically upgrade device firmware.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Hour of day (0-23) for automatic firmware upgrades.
     */
    hour?: pulumi.Input<number | undefined>;
}
export interface SettingMgmtSsh {
    /**
     * Allow SSH password authentication (in addition to keys).
     */
    authPasswordEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable SSH authentication.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * SSH keys.
     */
    keys?: pulumi.Input<pulumi.Input<inputs.SettingMgmtSshKey>[] | undefined>;
    /**
     * SSH password for device access. Sensitive — the controller stores only a hash, so this value is kept from configuration and not read back.
     */
    password?: pulumi.Input<string | undefined>;
    /**
     * SSH username for device access.
     */
    username?: pulumi.Input<string | undefined>;
}
export interface SettingMgmtSshKey {
    /**
     * Comment.
     */
    comment?: pulumi.Input<string | undefined>;
    /**
     * Public SSH key.
     */
    key?: pulumi.Input<string | undefined>;
    /**
     * Name of SSH key.
     */
    name: pulumi.Input<string>;
    /**
     * Type of SSH key, e.g. ssh-rsa.
     */
    type: pulumi.Input<string>;
}
export interface SettingNetworkOptimization {
    /**
     * Whether automated network optimization is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
}
export interface SettingNtp {
    /**
     * Primary NTP server.
     */
    ntpServer1?: pulumi.Input<string | undefined>;
    /**
     * Second NTP server.
     */
    ntpServer2?: pulumi.Input<string | undefined>;
    /**
     * Third NTP server.
     */
    ntpServer3?: pulumi.Input<string | undefined>;
    /**
     * Fourth NTP server.
     */
    ntpServer4?: pulumi.Input<string | undefined>;
    /**
     * Configuration mode: `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
}
export interface SettingRadius {
    /**
     * Enable RADIUS accounting.
     */
    accountingEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * RADIUS accounting port.
     */
    acctPort?: pulumi.Input<number | undefined>;
    /**
     * RADIUS authentication port.
     */
    authPort?: pulumi.Input<number | undefined>;
    /**
     * Interim update interval, as a Go duration string (e.g. `1h`, `3600s`).
     */
    interimUpdateInterval?: pulumi.Input<string | undefined>;
    /**
     * RADIUS shared secret.
     */
    secret?: pulumi.Input<string | undefined>;
}
export interface SettingSyslog {
    /**
     * Logged facilities (e.g. `device`, `client`, `firewall_default_policy`, `triggers`, `updates`, `admin_activity`, `critical`, `security_detections`, `vpn`).
     */
    contents?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Enable debug logging.
     */
    debug?: pulumi.Input<boolean | undefined>;
    /**
     * Whether remote syslog is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Remote syslog server IP address.
     */
    ip?: pulumi.Input<string | undefined>;
    /**
     * Log all available facilities.
     */
    logAllContents?: pulumi.Input<boolean | undefined>;
    /**
     * Netconsole logging settings.
     */
    netconsole?: pulumi.Input<inputs.SettingSyslogNetconsole | undefined>;
    /**
     * Remote syslog server port (1-65535).
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * Forwarding of this controller's own events to the remote syslog server.
     */
    thisController?: pulumi.Input<inputs.SettingSyslogThisController | undefined>;
}
export interface SettingSyslogNetconsole {
    /**
     * Whether netconsole logging is enabled. Defaults to `false` when `syslog` is configured and this is not set.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Netconsole host.
     */
    host?: pulumi.Input<string | undefined>;
    /**
     * Netconsole port (1-65535).
     */
    port?: pulumi.Input<number | undefined>;
}
export interface SettingSyslogThisController {
    /**
     * Also log this controller's events.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Only send this controller's logs over an encrypted channel.
     */
    encryptedOnly?: pulumi.Input<boolean | undefined>;
}
export interface SettingTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface SettingUsg {
    /**
     * Enable broadcast ping.
     */
    broadcastPing?: pulumi.Input<boolean | undefined>;
    /**
     * DNS verification settings.
     */
    dnsVerification?: pulumi.Input<inputs.SettingUsgDnsVerification | undefined>;
    /**
     * Enable FTP module.
     */
    ftpModule?: pulumi.Input<boolean | undefined>;
    /**
     * Geo IP filtering (Region Blocking) settings.
     */
    geoIpFiltering?: pulumi.Input<inputs.SettingUsgGeoIpFiltering | undefined>;
    /**
     * Enable GRE module.
     */
    greModule?: pulumi.Input<boolean | undefined>;
    /**
     * Enable H.323 module.
     */
    h323Module?: pulumi.Input<boolean | undefined>;
    /**
     * ICMP connection timeout, as a Go duration string (e.g. `30s`, `1m`).
     */
    icmpTimeout?: pulumi.Input<string | undefined>;
    /**
     * MSS clamping mode: auto, custom, or disabled.
     */
    mssClamp?: pulumi.Input<string | undefined>;
    /**
     * Hardware offload settings.
     */
    offload?: pulumi.Input<inputs.SettingUsgOffload | undefined>;
    /**
     * Other connections timeout, as a Go duration string (e.g. `600s`, `10m`).
     */
    otherTimeout?: pulumi.Input<string | undefined>;
    /**
     * Enable PPTP module.
     */
    pptpModule?: pulumi.Input<boolean | undefined>;
    /**
     * Accept ICMP redirects.
     */
    receiveRedirects?: pulumi.Input<boolean | undefined>;
    /**
     * Send ICMP redirects.
     */
    sendRedirects?: pulumi.Input<boolean | undefined>;
    /**
     * Enable SIP module.
     */
    sipModule?: pulumi.Input<boolean | undefined>;
    /**
     * Enable SYN cookies.
     */
    synCookies?: pulumi.Input<boolean | undefined>;
    /**
     * TCP connection tracking timeouts.
     */
    tcp?: pulumi.Input<inputs.SettingUsgTcp | undefined>;
    /**
     * Enable TFTP module.
     */
    tftpModule?: pulumi.Input<boolean | undefined>;
    /**
     * Timeout setting preference: auto or manual.
     */
    timeoutSettingPreference?: pulumi.Input<string | undefined>;
    /**
     * UDP connection tracking timeouts.
     */
    udp?: pulumi.Input<inputs.SettingUsgUdp | undefined>;
    /**
     * Unbind WAN monitors.
     */
    unbindWanMonitors?: pulumi.Input<boolean | undefined>;
    /**
     * UPnP settings.
     */
    upnp?: pulumi.Input<inputs.SettingUsgUpnp | undefined>;
}
export interface SettingUsgDnsVerification {
    /**
     * Domain for DNS verification.
     */
    domain?: pulumi.Input<string | undefined>;
    /**
     * Primary DNS server.
     */
    primaryDnsServer?: pulumi.Input<string | undefined>;
    /**
     * Secondary DNS server.
     */
    secondaryDnsServer?: pulumi.Input<string | undefined>;
    /**
     * Setting preference: auto or manual.
     */
    settingPreference?: pulumi.Input<string | undefined>;
}
export interface SettingUsgGeoIpFiltering {
    /**
     * Geo IP filtering action: block or allow.
     */
    block?: pulumi.Input<string | undefined>;
    /**
     * Comma-separated list of country codes for geo IP filtering.
     */
    countries?: pulumi.Input<string | undefined>;
    /**
     * Enable geo IP filtering.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Geo IP filtering traffic direction: both, ingress, or egress.
     */
    trafficDirection?: pulumi.Input<string | undefined>;
}
export interface SettingUsgOffload {
    /**
     * Enable hardware offload for accounting.
     */
    accounting?: pulumi.Input<boolean | undefined>;
    /**
     * Enable hardware offload for L2 blocking.
     */
    l2Blocking?: pulumi.Input<boolean | undefined>;
    /**
     * Enable hardware offload for scheduling.
     */
    sch?: pulumi.Input<boolean | undefined>;
}
export interface SettingUsgTcp {
    /**
     * TCP close timeout, as a Go duration string (e.g. `10s`).
     */
    closeTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP close wait timeout, as a Go duration string (e.g. `60s`, `1m`).
     */
    closeWaitTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP established connection timeout, as a Go duration string (e.g. `7440s`, `2h4m`).
     */
    establishedTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP fin wait timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    finWaitTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP last ACK timeout, as a Go duration string (e.g. `30s`).
     */
    lastAckTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP SYN received timeout, as a Go duration string (e.g. `60s`, `1m`).
     */
    synRecvTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP SYN sent timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    synSentTimeout?: pulumi.Input<string | undefined>;
    /**
     * TCP time wait timeout, as a Go duration string (e.g. `120s`, `2m`).
     */
    timeWaitTimeout?: pulumi.Input<string | undefined>;
}
export interface SettingUsgUdp {
    /**
     * UDP other timeout, as a Go duration string (e.g. `30s`).
     */
    otherTimeout?: pulumi.Input<string | undefined>;
    /**
     * UDP stream timeout, as a Go duration string (e.g. `180s`, `3m`).
     */
    streamTimeout?: pulumi.Input<string | undefined>;
}
export interface SettingUsgUpnp {
    /**
     * Enable UPnP.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable UPnP NAT-PMP.
     */
    natPmpEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable UPnP secure mode.
     */
    secureMode?: pulumi.Input<boolean | undefined>;
    /**
     * UPnP WAN interface (e.g., WAN, WAN2).
     */
    wanInterface?: pulumi.Input<string | undefined>;
}
export interface SiteTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface SiteToSiteVpnEsp {
    /**
     * ESP (phase 2) Diffie-Hellman group (PFS). Only used when `profile = customized`.
     */
    dhGroup?: pulumi.Input<number | undefined>;
    /**
     * ESP (phase 2) encryption. Only used when `profile = customized`.
     */
    encryption?: pulumi.Input<string | undefined>;
    /**
     * ESP (phase 2) hash. Only used when `profile = customized`.
     */
    hash?: pulumi.Input<string | undefined>;
    /**
     * ESP (phase 2) security-association lifetime, as a Go duration string (e.g. `1h`, `3600s`). Must be a whole number of seconds between `30s` and `86400s` (24h).
     */
    lifetime?: pulumi.Input<string | undefined>;
}
export interface SiteToSiteVpnIke {
    /**
     * IKE (phase 1) Diffie-Hellman group. Only used when `profile = customized`.
     */
    dhGroup?: pulumi.Input<number | undefined>;
    /**
     * IKE (phase 1) encryption. Only used when `profile = customized`.
     */
    encryption?: pulumi.Input<string | undefined>;
    /**
     * IKE (phase 1) hash. Only used when `profile = customized`.
     */
    hash?: pulumi.Input<string | undefined>;
    /**
     * IKE (phase 1) security-association lifetime, as a Go duration string (e.g. `8h`, `28800s`). Must be a whole number of seconds between `30s` and `86400s` (24h).
     */
    lifetime?: pulumi.Input<string | undefined>;
}
export interface SiteToSiteVpnTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface StaticRouteGateway {
    /**
     * The MAC address of the gateway device, used when `type` is `switch`.
     */
    device?: pulumi.Input<string | undefined>;
    /**
     * The type of gateway for the static route. Can be `default` or `switch`.
     */
    type?: pulumi.Input<string | undefined>;
}
export interface StaticRouteTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface TrafficRouteDestination {
    /**
     * List of domain names to match.
     */
    domains?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * List of IP address, subnet, or IP range entries to match. Use CIDR notation (e.g. `10.0.0.0/8`) for subnets, or a hyphenated range (e.g. `192.168.10.1-192.168.10.255`) for IP ranges.
     */
    ips?: pulumi.Input<pulumi.Input<inputs.TrafficRouteDestinationIp>[] | undefined>;
    /**
     * List of regions to match.
     */
    regions?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface TrafficRouteDestinationIp {
    /**
     * An IP address, CIDR subnet, or hyphenated IP range to match.
     */
    address: pulumi.Input<string>;
    /**
     * List of ports or port ranges to match. Use a single number (e.g. `80`) for individual ports, or a hyphenated range (e.g. `8080-8090`) for port ranges. Only supported for IP addresses and subnets, not IP ranges.
     */
    ports?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface TrafficRouteSource {
    /**
     * List of client devices whose traffic this route applies to.
     */
    clients?: pulumi.Input<pulumi.Input<inputs.TrafficRouteSourceClient>[] | undefined>;
    /**
     * List of networks whose traffic this route applies to.
     */
    networks?: pulumi.Input<pulumi.Input<inputs.TrafficRouteSourceNetwork>[] | undefined>;
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
export interface TrafficRouteTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface VpnClientTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface VpnClientWireguard {
    /**
     * File-based WireGuard configuration. Provide a complete WireGuard .conf file.
     */
    configuration?: pulumi.Input<inputs.VpnClientWireguardConfiguration | undefined>;
    /**
     * DNS servers for the WireGuard interface. Required for manual mode. Must specify 1-2 DNS server addresses.
     */
    dnsServers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * WAN interface to use for the VPN connection (e.g., `wan`, `wan2`).
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * Manual WireGuard peer configuration. Specify peer endpoint and public key.
     */
    peer?: pulumi.Input<inputs.VpnClientWireguardPeer | undefined>;
    /**
     * WireGuard preshared key. Required when preshared_key_enabled is true.
     */
    presharedKey?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether to use a preshared key for additional security.
     */
    presharedKeyEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * WireGuard private key for this client. Stored in state; use `private_key_wo` to avoid persisting the secret.
     */
    privateKey?: pulumi.Input<string | undefined>;
    privateKeyWo?: pulumi.Input<string | undefined>;
    /**
     * Version counter for `private_key_wo`. Increment this value to trigger a private key update.
     */
    privateKeyWoVersion?: pulumi.Input<number | undefined>;
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
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * DNS servers to push to VPN clients.
     */
    servers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
export interface VpnServerL2tp {
    /**
     * Allow weak ciphers for L2TP connections.
     */
    allowWeakCiphers?: pulumi.Input<boolean | undefined>;
    /**
     * IPsec pre-shared key for L2TP. Required by the UniFi controller.
     */
    preSharedKey: pulumi.Input<string>;
}
export interface VpnServerOpenvpn {
    /**
     * OpenVPN static authentication key generated by the controller.
     */
    authKey?: pulumi.Input<string | undefined>;
    /**
     * CA certificate and private key generated by the controller.
     */
    ca?: pulumi.Input<inputs.VpnServerOpenvpnCa | undefined>;
    /**
     * Diffie-Hellman parameters generated by the controller.
     */
    dhKey?: pulumi.Input<string | undefined>;
    /**
     * Encryption cipher for OpenVPN.
     */
    encryptionCipher?: pulumi.Input<string | undefined>;
    /**
     * OpenVPN mode.
     */
    mode?: pulumi.Input<string | undefined>;
    /**
     * Port for the OpenVPN server to listen on.
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * Server certificate and private key generated by the controller.
     */
    server?: pulumi.Input<inputs.VpnServerOpenvpnServer | undefined>;
    /**
     * Shared client certificate and private key generated by the controller.
     */
    sharedClient?: pulumi.Input<inputs.VpnServerOpenvpnSharedClient | undefined>;
}
export interface VpnServerOpenvpnCa {
    /**
     * CA certificate generated by the controller.
     */
    crt?: pulumi.Input<string | undefined>;
    /**
     * CA private key generated by the controller.
     */
    key?: pulumi.Input<string | undefined>;
}
export interface VpnServerOpenvpnServer {
    /**
     * Server certificate generated by the controller.
     */
    crt?: pulumi.Input<string | undefined>;
    /**
     * Server private key generated by the controller.
     */
    key?: pulumi.Input<string | undefined>;
}
export interface VpnServerOpenvpnSharedClient {
    /**
     * Shared client certificate generated by the controller.
     */
    crt?: pulumi.Input<string | undefined>;
    /**
     * Shared client private key generated by the controller.
     */
    key?: pulumi.Input<string | undefined>;
}
export interface VpnServerTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface VpnServerWan {
    /**
     * WAN interface to use for the VPN server (e.g., `wan`, `wan2`).
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * Local WAN IP to bind the VPN server to. Use `any` to listen on all addresses.
     */
    ip?: pulumi.Input<string | undefined>;
}
export interface VpnServerWireguard {
    /**
     * UDP port for the WireGuard server to listen on.
     */
    port?: pulumi.Input<number | undefined>;
    /**
     * WireGuard private key for this server (base64). If not specified, the provider generates one at create time (the controller does not generate it and rejects a server without a key).
     */
    privateKey?: pulumi.Input<string | undefined>;
    /**
     * WireGuard public key for this server. Computed from the private key.
     */
    publicKey?: pulumi.Input<string | undefined>;
}
export interface WanDhcp {
    /**
     * DHCP Class of Service
     */
    cos?: pulumi.Input<number | undefined>;
    /**
     * DHCP options
     */
    options?: pulumi.Input<pulumi.Input<inputs.WanDhcpOption>[] | undefined>;
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
    cos?: pulumi.Input<number | undefined>;
    /**
     * DHCPv6 options
     */
    options?: pulumi.Input<pulumi.Input<inputs.WanDhcpv6Option>[] | undefined>;
    /**
     * DHCPv6 prefix delegation configuration
     */
    pd?: pulumi.Input<inputs.WanDhcpv6Pd | undefined>;
    /**
     * IPv6 WAN delegation type (pd, single_network, none)
     */
    wanDelegationType?: pulumi.Input<string | undefined>;
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
export interface WanDhcpv6Pd {
    /**
     * DHCPv6 prefix delegation size
     */
    size?: pulumi.Input<number | undefined>;
    /**
     * Whether DHCPv6 PD size is automatic
     */
    sizeAuto?: pulumi.Input<boolean | undefined>;
}
export interface WanDns {
    /**
     * IPv6 DNS configuration
     */
    ipv6?: pulumi.Input<inputs.WanDnsIpv6 | undefined>;
    /**
     * DNS preference (auto, manual)
     */
    preference?: pulumi.Input<string | undefined>;
    /**
     * Primary DNS server
     */
    primary?: pulumi.Input<string | undefined>;
    /**
     * Secondary DNS server
     */
    secondary?: pulumi.Input<string | undefined>;
}
export interface WanDnsIpv6 {
    /**
     * IPv6 DNS preference (auto, manual)
     */
    preference?: pulumi.Input<string | undefined>;
    /**
     * Primary IPv6 DNS server
     */
    primary?: pulumi.Input<string | undefined>;
    /**
     * Secondary IPv6 DNS server
     */
    secondary?: pulumi.Input<string | undefined>;
}
export interface WanDslite {
    /**
     * The DS-Lite AFTR remote host. Only used when `remote_host_auto` is disabled.
     */
    remoteHost?: pulumi.Input<string | undefined>;
    /**
     * Whether the DS-Lite AFTR remote host is detected automatically.
     */
    remoteHostAuto?: pulumi.Input<boolean | undefined>;
}
export interface WanEgressQos {
    /**
     * Whether egress QoS is enabled
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Egress QoS priority
     */
    priority?: pulumi.Input<number | undefined>;
}
export interface WanIgmpProxy {
    /**
     * IGMP proxy downstream target (none, lan, guest)
     */
    downstream?: pulumi.Input<string | undefined>;
    /**
     * Whether IGMP proxy upstream is enabled
     */
    upstream?: pulumi.Input<boolean | undefined>;
}
export interface WanLoadBalance {
    /**
     * Failover priority
     */
    failoverPriority?: pulumi.Input<number | undefined>;
    /**
     * Load balance type (failover-only, weighted)
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * Load balance weight
     */
    weight?: pulumi.Input<number | undefined>;
}
export interface WanProviderCapabilities {
    /**
     * Download speed in kilobits per second
     */
    downloadKilobitsPerSecond?: pulumi.Input<number | undefined>;
    /**
     * Upload speed in kilobits per second
     */
    uploadKilobitsPerSecond?: pulumi.Input<number | undefined>;
}
export interface WanSmartq {
    /**
     * Smart Queue download rate in kbps
     */
    downRate?: pulumi.Input<number | undefined>;
    /**
     * Whether Smart Queue is enabled
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Smart Queue upload rate in kbps
     */
    upRate?: pulumi.Input<number | undefined>;
}
export interface WanTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface WanUpnp {
    /**
     * Whether UPnP is enabled
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Whether UPnP NAT-PMP is enabled
     */
    natPmpEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Whether UPnP secure mode is enabled
     */
    secureMode?: pulumi.Input<boolean | undefined>;
    /**
     * UPnP WAN interface
     */
    wanInterface?: pulumi.Input<string | undefined>;
}
export interface WanVlan {
    /**
     * Whether VLAN is enabled
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The VLAN ID
     */
    id?: pulumi.Input<number | undefined>;
}
export interface WireguardPeerTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface WlanApGroup {
    /**
     * List of AP group IDs to apply this WLAN to.
     */
    ids?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Access point group mode.
     */
    mode?: pulumi.Input<string | undefined>;
}
export interface WlanMacFilter {
    /**
     * Indicates whether or not the MAC filter is turned on for the network.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * List of MAC addresses to filter (only valid if `enabled` is `true`).
     */
    lists?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * MAC address filter policy (only valid if `enabled` is `true`).
     */
    policy?: pulumi.Input<string | undefined>;
}
export interface WlanPrivatePresharedKey {
    /**
     * ID of the network/VLAN this key is bound to. Leave unset to use the WLAN's default network.
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * The passphrase for this key (8-255 characters).
     */
    password: pulumi.Input<string>;
}
export interface WlanRadius {
    /**
     * Enable RADIUS MAC authentication. Defaults to `false` when not set.
     */
    macAuthEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * ID of the RADIUS profile to use when security `wpaeap`. The controller may assign a default profile, so this is computed when unset.
     */
    profileId?: pulumi.Input<string | undefined>;
}
export interface WlanRoamingAssistant6e {
    /**
     * Enable the 6 GHz roaming assistant.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Signal strength threshold in dBm, `-90` to `-70`. The controller supplies a value when unset.
     */
    rssi?: pulumi.Input<number | undefined>;
}
export interface WlanRoamingAssistantNa {
    /**
     * Enable the 5 GHz roaming assistant.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Signal strength threshold in dBm, `-80` to `-60`. The controller supplies a value when unset.
     */
    rssi?: pulumi.Input<number | undefined>;
}
export interface WlanSchedule {
    /**
     * Day of week for the block.
     */
    dayOfWeek: pulumi.Input<string>;
    /**
     * Length of the block, as a Go duration string. The controller stores this value with one-minute resolution, so the duration must be at least `1m` and a whole multiple of one minute (e.g. `30m`, `2h`).
     */
    duration: pulumi.Input<string>;
    /**
     * Name of the block.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Start time of the block.
     */
    start: pulumi.Input<inputs.WlanScheduleStart>;
}
export interface WlanScheduleStart {
    /**
     * Start hour for the block (0-23).
     */
    hour: pulumi.Input<number>;
    /**
     * Start minute for the block (0-59).
     */
    minute?: pulumi.Input<number | undefined>;
}
export interface WlanTimeouts {
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    create?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Setting a timeout for a Delete operation is only applicable if changes are saved into state before the destroy operation occurs.
     */
    delete?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours). Read operations occur during any refresh or planning operation when refresh is enabled.
     */
    read?: pulumi.Input<string | undefined>;
    /**
     * A string that can be [parsed as a duration](https://pkg.go.dev/time#ParseDuration) consisting of numbers and unit suffixes, such as "30s" or "2h45m". Valid time units are "s" (seconds), "m" (minutes), "h" (hours).
     */
    update?: pulumi.Input<string | undefined>;
}
export interface WlanWpa {
    /**
     * WPA encryption. Can be one of `auto`, `ccmp`, `gcmp`, `ccmp-256`, or `gcmp-256`. Computed from the controller when not set.
     */
    enc?: pulumi.Input<string | undefined>;
    /**
     * WPA mode. Can be one of `auto`, `wpa1`, or `wpa2`.
     */
    mode?: pulumi.Input<string | undefined>;
}
export interface WlanWpa3 {
    /**
     * Enable WPA3 Enterprise 192-bit mode.
     */
    enhanced192?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA3 fast roaming (802.11r).
     */
    fastRoaming?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA 3 support (security must be `wpapsk` and PMF must be turned on).
     */
    support?: pulumi.Input<boolean | undefined>;
    /**
     * Enable WPA 3 and WPA 2 support (security must be `wpapsk` and `wpa3.support` must be true).
     */
    transition?: pulumi.Input<boolean | undefined>;
}
//# sourceMappingURL=input.d.ts.map
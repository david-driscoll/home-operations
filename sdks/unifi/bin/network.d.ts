import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * Specifies whether auto-scaling is enabled.
     */
    readonly autoScale: pulumi.Output<boolean>;
    /**
     * DHCP guarding configuration. Specifies allowed DHCP server IPs to prevent rogue DHCP servers on the network.
     */
    readonly dhcpGuarding: pulumi.Output<outputs.NetworkDhcpGuarding | undefined>;
    /**
     * DHCP relay configuration.
     */
    readonly dhcpRelay: pulumi.Output<outputs.NetworkDhcpRelay | undefined>;
    /**
     * DHCP server configuration.
     */
    readonly dhcpServer: pulumi.Output<outputs.NetworkDhcpServer | undefined>;
    /**
     * DHCPv6 server configuration.
     */
    readonly dhcpV6Server: pulumi.Output<outputs.NetworkDhcpV6Server | undefined>;
    /**
     * The domain name for the network.
     */
    readonly domainName: pulumi.Output<string>;
    /**
     * Specifies whether the network is enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * The gateway type. Must be one of `default` or `switch`.
     */
    readonly gatewayType: pulumi.Output<string>;
    /**
     * Specifies whether IGMP snooping is enabled.
     */
    readonly igmpSnooping: pulumi.Output<boolean>;
    /**
     * Specifies whether internet access is enabled.
     */
    readonly internetAccess: pulumi.Output<boolean>;
    /**
     * List of IP aliases for the network.
     */
    readonly ipAliases: pulumi.Output<string[] | undefined>;
    /**
     * List of IPv6 aliases for the network.
     */
    readonly ipv6Aliases: pulumi.Output<string[] | undefined>;
    /**
     * How clients on this network obtain an IPv6 address (UI: Networks → IPv6 → Client Address Assignment). One of `slaac` (SLAAC only), `dhcpv6` (DHCPv6 only), or `slaac-dhcpv6` (both). Computed from the controller when not set.
     */
    readonly ipv6ClientAddressAssignment: pulumi.Output<string>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`.
     */
    readonly ipv6InterfaceType: pulumi.Output<string>;
    /**
     * Specifies whether automatic prefix ID assignment is enabled for IPv6 Prefix Delegation.
     */
    readonly ipv6PdAutoPrefixidEnabled: pulumi.Output<boolean>;
    /**
     * The IPv6 Prefix Delegation WAN interface (e.g., `wan`, `wan2`).
     */
    readonly ipv6PdInterface: pulumi.Output<string | undefined>;
    /**
     * The IPv6 Prefix Delegation prefix ID (hex string, e.g., `0`, `1a`).
     */
    readonly ipv6PdPrefixid: pulumi.Output<string | undefined>;
    /**
     * The start of the IPv6 Prefix Delegation range (e.g. `::2`). Required together with `ipv6_pd_stop` when `ipv6_interface_type` is `pd`, otherwise the controller rejects the network with `api.err.InvalidIpv6Addr`.
     */
    readonly ipv6PdStart: pulumi.Output<string>;
    /**
     * The end of the IPv6 Prefix Delegation range (e.g. `::7d1`). Required together with `ipv6_pd_start` when `ipv6_interface_type` is `pd`.
     */
    readonly ipv6PdStop: pulumi.Output<string>;
    /**
     * Specifies whether IPv6 Router Advertisement (RA) is enabled.
     */
    readonly ipv6Ra: pulumi.Output<boolean>;
    /**
     * The IPv6 Router Advertisement preferred lifetime, as a Go duration string (e.g. `14400s`, `4h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    readonly ipv6RaPreferredLifetime: pulumi.Output<string>;
    /**
     * The IPv6 Router Advertisement priority. Must be one of `high`, `medium`, or `low`.
     */
    readonly ipv6RaPriority: pulumi.Output<string>;
    /**
     * The IPv6 Router Advertisement valid lifetime, as a Go duration string (e.g. `86400s`, `24h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    readonly ipv6RaValidLifetime: pulumi.Output<string>;
    /**
     * The IPv6 static subnet of the network. Only used when `ipv6_interface_type` is `static`.
     */
    readonly ipv6StaticSubnet: pulumi.Output<string | undefined>;
    /**
     * Whether this network/VLAN stays active when the gateway fails over to a UniFi LTE (cellular) backup WAN. Maps to the controller's `lte_lan_enabled` flag and only matters when a UniFi LTE failover device is in use; otherwise it is cosmetic. Defaults to `true` (network stays available during LTE failover); set to `false` to disable it while on the LTE backup link. The controller may set this automatically, which is why existing networks can show differing values.
     */
    readonly lteLan: pulumi.Output<boolean>;
    /**
     * Specifies whether mDNS is enabled. This is read back from the controller rather than defaulted: some controllers (notably UniFi OS gateways) ignore `mdns_enabled` at create/update time and always store `false`, so forcing a `true` default produced a "provider produced inconsistent result after apply" error.
     */
    readonly multicastDns: pulumi.Output<boolean>;
    /**
     * The name of the network.
     */
    readonly name: pulumi.Output<string>;
    /**
     * List of NAT outbound IP addresses.
     */
    readonly natOutboundIpAddresses: pulumi.Output<outputs.NetworkNatOutboundIpAddress[] | undefined>;
    /**
     * Specifies whether network isolation is enabled.
     */
    readonly networkIsolation: pulumi.Output<boolean>;
    /**
     * The network purpose: `corporate` (default), `guest`, or `vlan-only`. Leave unset to let the controller manage it (a `third_party_gateway` network is always `vlan-only`). **Note:** on Zone-Based-Firewall controllers the purpose is coupled to the firewall zone — a `guest` network only keeps `purpose = "guest"` while it belongs to the guest/Hotspot zone (assign it there via `unifi.FirewallZone`), otherwise the controller rewrites it back to `corporate` and the apply fails with an inconsistent-result error.
     */
    readonly purpose: pulumi.Output<string>;
    /**
     * Setting preference. Must be one of `auto` or `manual`.
     */
    readonly settingPreference: pulumi.Output<string>;
    /**
     * The name of the site to associate the network with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The network's gateway IP and prefix in CIDR notation. The host portion is the gateway address the controller assigns — it need not be the first usable address: `10.0.10.1/24` uses gateway `10.0.10.1`, while `10.0.10.254/24` uses gateway `10.0.10.254` on the same subnet. Optional: it is not required for `vlan_only` networks (`third_party_gateway = true`), where the UniFi controller does not manage the subnet.
     */
    readonly subnet: pulumi.Output<string | undefined>;
    /**
     * Specifies whether this network uses a third-party gateway. When enabled, the network purpose is set to `vlan-only` and only VLAN ID, DHCP guarding, and basic network settings are configured.
     */
    readonly thirdPartyGateway: pulumi.Output<boolean>;
    readonly timeouts: pulumi.Output<outputs.NetworkTimeouts | undefined>;
    /**
     * The VLAN ID for the network.
     */
    readonly vlan: pulumi.Output<number | undefined>;
    /**
     * Create a Network resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: NetworkArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Network resources.
 */
export interface NetworkState {
    /**
     * Specifies whether auto-scaling is enabled.
     */
    autoScale?: pulumi.Input<boolean | undefined>;
    /**
     * DHCP guarding configuration. Specifies allowed DHCP server IPs to prevent rogue DHCP servers on the network.
     */
    dhcpGuarding?: pulumi.Input<inputs.NetworkDhcpGuarding | undefined>;
    /**
     * DHCP relay configuration.
     */
    dhcpRelay?: pulumi.Input<inputs.NetworkDhcpRelay | undefined>;
    /**
     * DHCP server configuration.
     */
    dhcpServer?: pulumi.Input<inputs.NetworkDhcpServer | undefined>;
    /**
     * DHCPv6 server configuration.
     */
    dhcpV6Server?: pulumi.Input<inputs.NetworkDhcpV6Server | undefined>;
    /**
     * The domain name for the network.
     */
    domainName?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether the network is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The gateway type. Must be one of `default` or `switch`.
     */
    gatewayType?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether IGMP snooping is enabled.
     */
    igmpSnooping?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether internet access is enabled.
     */
    internetAccess?: pulumi.Input<boolean | undefined>;
    /**
     * List of IP aliases for the network.
     */
    ipAliases?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * List of IPv6 aliases for the network.
     */
    ipv6Aliases?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * How clients on this network obtain an IPv6 address (UI: Networks → IPv6 → Client Address Assignment). One of `slaac` (SLAAC only), `dhcpv6` (DHCPv6 only), or `slaac-dhcpv6` (both). Computed from the controller when not set.
     */
    ipv6ClientAddressAssignment?: pulumi.Input<string | undefined>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`.
     */
    ipv6InterfaceType?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether automatic prefix ID assignment is enabled for IPv6 Prefix Delegation.
     */
    ipv6PdAutoPrefixidEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 Prefix Delegation WAN interface (e.g., `wan`, `wan2`).
     */
    ipv6PdInterface?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Prefix Delegation prefix ID (hex string, e.g., `0`, `1a`).
     */
    ipv6PdPrefixid?: pulumi.Input<string | undefined>;
    /**
     * The start of the IPv6 Prefix Delegation range (e.g. `::2`). Required together with `ipv6_pd_stop` when `ipv6_interface_type` is `pd`, otherwise the controller rejects the network with `api.err.InvalidIpv6Addr`.
     */
    ipv6PdStart?: pulumi.Input<string | undefined>;
    /**
     * The end of the IPv6 Prefix Delegation range (e.g. `::7d1`). Required together with `ipv6_pd_start` when `ipv6_interface_type` is `pd`.
     */
    ipv6PdStop?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether IPv6 Router Advertisement (RA) is enabled.
     */
    ipv6Ra?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 Router Advertisement preferred lifetime, as a Go duration string (e.g. `14400s`, `4h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    ipv6RaPreferredLifetime?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Router Advertisement priority. Must be one of `high`, `medium`, or `low`.
     */
    ipv6RaPriority?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Router Advertisement valid lifetime, as a Go duration string (e.g. `86400s`, `24h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    ipv6RaValidLifetime?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 static subnet of the network. Only used when `ipv6_interface_type` is `static`.
     */
    ipv6StaticSubnet?: pulumi.Input<string | undefined>;
    /**
     * Whether this network/VLAN stays active when the gateway fails over to a UniFi LTE (cellular) backup WAN. Maps to the controller's `lte_lan_enabled` flag and only matters when a UniFi LTE failover device is in use; otherwise it is cosmetic. Defaults to `true` (network stays available during LTE failover); set to `false` to disable it while on the LTE backup link. The controller may set this automatically, which is why existing networks can show differing values.
     */
    lteLan?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether mDNS is enabled. This is read back from the controller rather than defaulted: some controllers (notably UniFi OS gateways) ignore `mdns_enabled` at create/update time and always store `false`, so forcing a `true` default produced a "provider produced inconsistent result after apply" error.
     */
    multicastDns?: pulumi.Input<boolean | undefined>;
    /**
     * The name of the network.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * List of NAT outbound IP addresses.
     */
    natOutboundIpAddresses?: pulumi.Input<pulumi.Input<inputs.NetworkNatOutboundIpAddress>[] | undefined>;
    /**
     * Specifies whether network isolation is enabled.
     */
    networkIsolation?: pulumi.Input<boolean | undefined>;
    /**
     * The network purpose: `corporate` (default), `guest`, or `vlan-only`. Leave unset to let the controller manage it (a `third_party_gateway` network is always `vlan-only`). **Note:** on Zone-Based-Firewall controllers the purpose is coupled to the firewall zone — a `guest` network only keeps `purpose = "guest"` while it belongs to the guest/Hotspot zone (assign it there via `unifi.FirewallZone`), otherwise the controller rewrites it back to `corporate` and the apply fails with an inconsistent-result error.
     */
    purpose?: pulumi.Input<string | undefined>;
    /**
     * Setting preference. Must be one of `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * The network's gateway IP and prefix in CIDR notation. The host portion is the gateway address the controller assigns — it need not be the first usable address: `10.0.10.1/24` uses gateway `10.0.10.1`, while `10.0.10.254/24` uses gateway `10.0.10.254` on the same subnet. Optional: it is not required for `vlan_only` networks (`third_party_gateway = true`), where the UniFi controller does not manage the subnet.
     */
    subnet?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether this network uses a third-party gateway. When enabled, the network purpose is set to `vlan-only` and only VLAN ID, DHCP guarding, and basic network settings are configured.
     */
    thirdPartyGateway?: pulumi.Input<boolean | undefined>;
    timeouts?: pulumi.Input<inputs.NetworkTimeouts | undefined>;
    /**
     * The VLAN ID for the network.
     */
    vlan?: pulumi.Input<number | undefined>;
}
/**
 * The set of arguments for constructing a Network resource.
 */
export interface NetworkArgs {
    /**
     * Specifies whether auto-scaling is enabled.
     */
    autoScale?: pulumi.Input<boolean | undefined>;
    /**
     * DHCP guarding configuration. Specifies allowed DHCP server IPs to prevent rogue DHCP servers on the network.
     */
    dhcpGuarding?: pulumi.Input<inputs.NetworkDhcpGuarding | undefined>;
    /**
     * DHCP relay configuration.
     */
    dhcpRelay?: pulumi.Input<inputs.NetworkDhcpRelay | undefined>;
    /**
     * DHCP server configuration.
     */
    dhcpServer?: pulumi.Input<inputs.NetworkDhcpServer | undefined>;
    /**
     * DHCPv6 server configuration.
     */
    dhcpV6Server?: pulumi.Input<inputs.NetworkDhcpV6Server | undefined>;
    /**
     * The domain name for the network.
     */
    domainName?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether the network is enabled.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * The gateway type. Must be one of `default` or `switch`.
     */
    gatewayType?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether IGMP snooping is enabled.
     */
    igmpSnooping?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether internet access is enabled.
     */
    internetAccess?: pulumi.Input<boolean | undefined>;
    /**
     * List of IP aliases for the network.
     */
    ipAliases?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * List of IPv6 aliases for the network.
     */
    ipv6Aliases?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * How clients on this network obtain an IPv6 address (UI: Networks → IPv6 → Client Address Assignment). One of `slaac` (SLAAC only), `dhcpv6` (DHCPv6 only), or `slaac-dhcpv6` (both). Computed from the controller when not set.
     */
    ipv6ClientAddressAssignment?: pulumi.Input<string | undefined>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`.
     */
    ipv6InterfaceType?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether automatic prefix ID assignment is enabled for IPv6 Prefix Delegation.
     */
    ipv6PdAutoPrefixidEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 Prefix Delegation WAN interface (e.g., `wan`, `wan2`).
     */
    ipv6PdInterface?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Prefix Delegation prefix ID (hex string, e.g., `0`, `1a`).
     */
    ipv6PdPrefixid?: pulumi.Input<string | undefined>;
    /**
     * The start of the IPv6 Prefix Delegation range (e.g. `::2`). Required together with `ipv6_pd_stop` when `ipv6_interface_type` is `pd`, otherwise the controller rejects the network with `api.err.InvalidIpv6Addr`.
     */
    ipv6PdStart?: pulumi.Input<string | undefined>;
    /**
     * The end of the IPv6 Prefix Delegation range (e.g. `::7d1`). Required together with `ipv6_pd_start` when `ipv6_interface_type` is `pd`.
     */
    ipv6PdStop?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether IPv6 Router Advertisement (RA) is enabled.
     */
    ipv6Ra?: pulumi.Input<boolean | undefined>;
    /**
     * The IPv6 Router Advertisement preferred lifetime, as a Go duration string (e.g. `14400s`, `4h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    ipv6RaPreferredLifetime?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Router Advertisement priority. Must be one of `high`, `medium`, or `low`.
     */
    ipv6RaPriority?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 Router Advertisement valid lifetime, as a Go duration string (e.g. `86400s`, `24h`). Must be a whole number of seconds between `0s` and `31536000s` (1 year).
     */
    ipv6RaValidLifetime?: pulumi.Input<string | undefined>;
    /**
     * The IPv6 static subnet of the network. Only used when `ipv6_interface_type` is `static`.
     */
    ipv6StaticSubnet?: pulumi.Input<string | undefined>;
    /**
     * Whether this network/VLAN stays active when the gateway fails over to a UniFi LTE (cellular) backup WAN. Maps to the controller's `lte_lan_enabled` flag and only matters when a UniFi LTE failover device is in use; otherwise it is cosmetic. Defaults to `true` (network stays available during LTE failover); set to `false` to disable it while on the LTE backup link. The controller may set this automatically, which is why existing networks can show differing values.
     */
    lteLan?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether mDNS is enabled. This is read back from the controller rather than defaulted: some controllers (notably UniFi OS gateways) ignore `mdns_enabled` at create/update time and always store `false`, so forcing a `true` default produced a "provider produced inconsistent result after apply" error.
     */
    multicastDns?: pulumi.Input<boolean | undefined>;
    /**
     * The name of the network.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * List of NAT outbound IP addresses.
     */
    natOutboundIpAddresses?: pulumi.Input<pulumi.Input<inputs.NetworkNatOutboundIpAddress>[] | undefined>;
    /**
     * Specifies whether network isolation is enabled.
     */
    networkIsolation?: pulumi.Input<boolean | undefined>;
    /**
     * The network purpose: `corporate` (default), `guest`, or `vlan-only`. Leave unset to let the controller manage it (a `third_party_gateway` network is always `vlan-only`). **Note:** on Zone-Based-Firewall controllers the purpose is coupled to the firewall zone — a `guest` network only keeps `purpose = "guest"` while it belongs to the guest/Hotspot zone (assign it there via `unifi.FirewallZone`), otherwise the controller rewrites it back to `corporate` and the apply fails with an inconsistent-result error.
     */
    purpose?: pulumi.Input<string | undefined>;
    /**
     * Setting preference. Must be one of `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * The network's gateway IP and prefix in CIDR notation. The host portion is the gateway address the controller assigns — it need not be the first usable address: `10.0.10.1/24` uses gateway `10.0.10.1`, while `10.0.10.254/24` uses gateway `10.0.10.254` on the same subnet. Optional: it is not required for `vlan_only` networks (`third_party_gateway = true`), where the UniFi controller does not manage the subnet.
     */
    subnet?: pulumi.Input<string | undefined>;
    /**
     * Specifies whether this network uses a third-party gateway. When enabled, the network purpose is set to `vlan-only` and only VLAN ID, DHCP guarding, and basic network settings are configured.
     */
    thirdPartyGateway?: pulumi.Input<boolean | undefined>;
    timeouts?: pulumi.Input<inputs.NetworkTimeouts | undefined>;
    /**
     * The VLAN ID for the network.
     */
    vlan?: pulumi.Input<number | undefined>;
}
//# sourceMappingURL=network.d.ts.map
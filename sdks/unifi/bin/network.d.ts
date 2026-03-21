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
     * DHCP guarding configuration. When `third_party_gateway` is enabled, the `servers` list specifies the allowed DHCP server IPs.
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
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`.
     */
    readonly ipv6InterfaceType: pulumi.Output<string>;
    /**
     * Specifies whether LTE LAN is enabled.
     */
    readonly lteLan: pulumi.Output<boolean>;
    /**
     * Specifies whether mDNS is enabled.
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
     * Setting preference. Must be one of `auto` or `manual`.
     */
    readonly settingPreference: pulumi.Output<string>;
    /**
     * The name of the site to associate the network with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The IP subnet of the network in CIDR notation.
     */
    readonly subnet: pulumi.Output<string>;
    /**
     * Specifies whether this network uses a third-party gateway. When enabled, the network purpose is set to `vlan-only` and only VLAN ID, DHCP guarding, and basic network settings are configured.
     */
    readonly thirdPartyGateway: pulumi.Output<boolean>;
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
    constructor(name: string, args: NetworkArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Network resources.
 */
export interface NetworkState {
    /**
     * Specifies whether auto-scaling is enabled.
     */
    autoScale?: pulumi.Input<boolean>;
    /**
     * DHCP guarding configuration. When `third_party_gateway` is enabled, the `servers` list specifies the allowed DHCP server IPs.
     */
    dhcpGuarding?: pulumi.Input<inputs.NetworkDhcpGuarding>;
    /**
     * DHCP relay configuration.
     */
    dhcpRelay?: pulumi.Input<inputs.NetworkDhcpRelay>;
    /**
     * DHCP server configuration.
     */
    dhcpServer?: pulumi.Input<inputs.NetworkDhcpServer>;
    /**
     * The domain name for the network.
     */
    domainName?: pulumi.Input<string>;
    /**
     * Specifies whether the network is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The gateway type. Must be one of `default` or `switch`.
     */
    gatewayType?: pulumi.Input<string>;
    /**
     * Specifies whether IGMP snooping is enabled.
     */
    igmpSnooping?: pulumi.Input<boolean>;
    /**
     * Specifies whether internet access is enabled.
     */
    internetAccess?: pulumi.Input<boolean>;
    /**
     * List of IP aliases for the network.
     */
    ipAliases?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * List of IPv6 aliases for the network.
     */
    ipv6Aliases?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`.
     */
    ipv6InterfaceType?: pulumi.Input<string>;
    /**
     * Specifies whether LTE LAN is enabled.
     */
    lteLan?: pulumi.Input<boolean>;
    /**
     * Specifies whether mDNS is enabled.
     */
    multicastDns?: pulumi.Input<boolean>;
    /**
     * The name of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * List of NAT outbound IP addresses.
     */
    natOutboundIpAddresses?: pulumi.Input<pulumi.Input<inputs.NetworkNatOutboundIpAddress>[]>;
    /**
     * Specifies whether network isolation is enabled.
     */
    networkIsolation?: pulumi.Input<boolean>;
    /**
     * Setting preference. Must be one of `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string>;
    /**
     * The IP subnet of the network in CIDR notation.
     */
    subnet?: pulumi.Input<string>;
    /**
     * Specifies whether this network uses a third-party gateway. When enabled, the network purpose is set to `vlan-only` and only VLAN ID, DHCP guarding, and basic network settings are configured.
     */
    thirdPartyGateway?: pulumi.Input<boolean>;
    /**
     * The VLAN ID for the network.
     */
    vlan?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a Network resource.
 */
export interface NetworkArgs {
    /**
     * Specifies whether auto-scaling is enabled.
     */
    autoScale?: pulumi.Input<boolean>;
    /**
     * DHCP guarding configuration. When `third_party_gateway` is enabled, the `servers` list specifies the allowed DHCP server IPs.
     */
    dhcpGuarding?: pulumi.Input<inputs.NetworkDhcpGuarding>;
    /**
     * DHCP relay configuration.
     */
    dhcpRelay?: pulumi.Input<inputs.NetworkDhcpRelay>;
    /**
     * DHCP server configuration.
     */
    dhcpServer?: pulumi.Input<inputs.NetworkDhcpServer>;
    /**
     * The domain name for the network.
     */
    domainName?: pulumi.Input<string>;
    /**
     * Specifies whether the network is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The gateway type. Must be one of `default` or `switch`.
     */
    gatewayType?: pulumi.Input<string>;
    /**
     * Specifies whether IGMP snooping is enabled.
     */
    igmpSnooping?: pulumi.Input<boolean>;
    /**
     * Specifies whether internet access is enabled.
     */
    internetAccess?: pulumi.Input<boolean>;
    /**
     * List of IP aliases for the network.
     */
    ipAliases?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * List of IPv6 aliases for the network.
     */
    ipv6Aliases?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of `none`, `pd`, or `static`.
     */
    ipv6InterfaceType?: pulumi.Input<string>;
    /**
     * Specifies whether LTE LAN is enabled.
     */
    lteLan?: pulumi.Input<boolean>;
    /**
     * Specifies whether mDNS is enabled.
     */
    multicastDns?: pulumi.Input<boolean>;
    /**
     * The name of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * List of NAT outbound IP addresses.
     */
    natOutboundIpAddresses?: pulumi.Input<pulumi.Input<inputs.NetworkNatOutboundIpAddress>[]>;
    /**
     * Specifies whether network isolation is enabled.
     */
    networkIsolation?: pulumi.Input<boolean>;
    /**
     * Setting preference. Must be one of `auto` or `manual`.
     */
    settingPreference?: pulumi.Input<string>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string>;
    /**
     * The IP subnet of the network in CIDR notation.
     */
    subnet: pulumi.Input<string>;
    /**
     * Specifies whether this network uses a third-party gateway. When enabled, the network purpose is set to `vlan-only` and only VLAN ID, DHCP guarding, and basic network settings are configured.
     */
    thirdPartyGateway?: pulumi.Input<boolean>;
    /**
     * The VLAN ID for the network.
     */
    vlan?: pulumi.Input<number>;
}

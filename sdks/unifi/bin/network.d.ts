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
     * Specifies the IPv4 addresses for the DNS server to be returned from the DHCP server. Leave blank to disable this feature.
     */
    readonly dhcpDns: pulumi.Output<string[] | undefined>;
    /**
     * Specifies whether DHCP is enabled or not on this network.
     */
    readonly dhcpEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies the lease time for DHCP addresses in seconds. Defaults to `86400`.
     */
    readonly dhcpLease: pulumi.Output<number | undefined>;
    /**
     * Specifies whether DHCP relay is enabled or not on this network.
     */
    readonly dhcpRelayEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The IPv4 address where the DHCP range of addresses starts.
     */
    readonly dhcpStart: pulumi.Output<string | undefined>;
    /**
     * The IPv4 address where the DHCP range of addresses stops.
     */
    readonly dhcpStop: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPv6 addresses for the DNS server to be returned from the DHCP server. Used if `dhcp_v6_dns_auto` is set to `false`.
     */
    readonly dhcpV6Dns: pulumi.Output<string[] | undefined>;
    /**
     * Specifies DNS source to propagate. If set `false` the entries in `dhcp_v6_dns` are used, the upstream entries otherwise Defaults to `true`.
     */
    readonly dhcpV6DnsAuto: pulumi.Output<boolean | undefined>;
    /**
     * Enable stateful DHCPv6 for static configuration.
     */
    readonly dhcpV6Enabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies the lease time for DHCPv6 addresses in seconds. Defaults to `86400`.
     */
    readonly dhcpV6Lease: pulumi.Output<number | undefined>;
    /**
     * Start address of the DHCPv6 range. Used in static DHCPv6 configuration.
     */
    readonly dhcpV6Start: pulumi.Output<string | undefined>;
    /**
     * End address of the DHCPv6 range. Used in static DHCPv6 configuration.
     */
    readonly dhcpV6Stop: pulumi.Output<string | undefined>;
    /**
     * Toggles on the DHCP boot options. Should be set to true when you want to have dhcpd_boot_filename, and dhcpd_boot_server to take effect.
     */
    readonly dhcpdBootEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies the file to PXE boot from on the dhcpd_boot_server.
     */
    readonly dhcpdBootFilename: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPv4 address of a TFTP server to network boot from.
     */
    readonly dhcpdBootServer: pulumi.Output<string | undefined>;
    /**
     * The domain name of this network.
     */
    readonly domainName: pulumi.Output<string | undefined>;
    /**
     * Specifies whether this network is enabled or not. Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether IGMP snooping is enabled or not.
     */
    readonly igmpSnooping: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether this network should be allowed to access the internet or not. Defaults to `true`.
     */
    readonly internetAccessEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether this network should be allowed to access other local networks or not. Defaults to `true`.
     */
    readonly intraNetworkAccessEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of either `static`, `pd`, or `none`. Defaults to `none`.
     */
    readonly ipv6InterfaceType: pulumi.Output<string | undefined>;
    /**
     * Specifies which WAN interface to use for IPv6 PD. Must be one of either `wan` or `wan2`.
     */
    readonly ipv6PdInterface: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPv6 Prefix ID.
     */
    readonly ipv6PdPrefixid: pulumi.Output<string | undefined>;
    /**
     * Start address of the DHCPv6 range. Used if `ipv6_interface_type` is set to `pd`.
     */
    readonly ipv6PdStart: pulumi.Output<string | undefined>;
    /**
     * End address of the DHCPv6 range. Used if `ipv6_interface_type` is set to `pd`.
     */
    readonly ipv6PdStop: pulumi.Output<string | undefined>;
    /**
     * Specifies whether to enable router advertisements or not.
     */
    readonly ipv6RaEnable: pulumi.Output<boolean | undefined>;
    /**
     * Lifetime in which the address can be used. Address becomes deprecated afterwards. Must be lower than or equal to `ipv6_ra_valid_lifetime` Defaults to `14400`.
     */
    readonly ipv6RaPreferredLifetime: pulumi.Output<number | undefined>;
    /**
     * IPv6 router advertisement priority. Must be one of either `high`, `medium`, or `low`
     */
    readonly ipv6RaPriority: pulumi.Output<string | undefined>;
    /**
     * Total lifetime in which the address can be used. Must be equal to or greater than `ipv6_ra_preferred_lifetime`. Defaults to `86400`.
     */
    readonly ipv6RaValidLifetime: pulumi.Output<number | undefined>;
    /**
     * Specifies the static IPv6 subnet when `ipv6_interface_type` is 'static'.
     */
    readonly ipv6StaticSubnet: pulumi.Output<string | undefined>;
    /**
     * Specifies whether Multicast DNS (mDNS) is enabled or not on the network (Controller >=v7).
     */
    readonly multicastDns: pulumi.Output<boolean | undefined>;
    /**
     * The name of the network.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The group of the network. Defaults to `LAN`.
     */
    readonly networkGroup: pulumi.Output<string | undefined>;
    /**
     * The purpose of the network. Must be one of `corporate`, `guest`, `wan`, `vlan-only`, or `vpn-client`.
     */
    readonly purpose: pulumi.Output<string>;
    /**
     * The name of the site to associate the network with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The subnet of the network. Must be a valid CIDR address.
     */
    readonly subnet: pulumi.Output<string | undefined>;
    /**
     * The VLAN ID of the network.
     */
    readonly vlanId: pulumi.Output<number | undefined>;
    /**
     * Specifies the VPN type. Must be one of either `auto`, `l2tp`, `openvpn`, or `pptp`.
     */
    readonly vpnType: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPv6 prefix size to request from ISP. Must be between 48 and 64.
     */
    readonly wanDhcpV6PdSize: pulumi.Output<number | undefined>;
    /**
     * DNS servers IPs of the WAN.
     */
    readonly wanDns: pulumi.Output<string[] | undefined>;
    /**
     * Specifies the WAN egress quality of service. Defaults to `0`.
     */
    readonly wanEgressQos: pulumi.Output<number | undefined>;
    /**
     * The IPv4 gateway of the WAN.
     */
    readonly wanGateway: pulumi.Output<string | undefined>;
    /**
     * The IPv6 gateway of the WAN.
     */
    readonly wanGatewayV6: pulumi.Output<string | undefined>;
    /**
     * The IPv4 address of the WAN.
     */
    readonly wanIp: pulumi.Output<string | undefined>;
    /**
     * The IPv6 address of the WAN.
     */
    readonly wanIpv6: pulumi.Output<string | undefined>;
    /**
     * The IPv4 netmask of the WAN.
     */
    readonly wanNetmask: pulumi.Output<string | undefined>;
    /**
     * Specifies the WAN network group. Must be one of either `WAN`, `WAN2` or `WAN_LTE_FAILOVER`.
     */
    readonly wanNetworkgroup: pulumi.Output<string | undefined>;
    /**
     * The IPv6 prefix length of the WAN. Must be between 1 and 128.
     */
    readonly wanPrefixlen: pulumi.Output<number | undefined>;
    /**
     * Specifies the IPV4 WAN connection type. Must be one of either `disabled`, `static`, `dhcp`, or `pppoe`.
     */
    readonly wanType: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPV6 WAN connection type. Must be one of either `disabled`, `static`, or `dhcpv6`.
     */
    readonly wanTypeV6: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPV4 WAN username.
     */
    readonly wanUsername: pulumi.Output<string | undefined>;
    /**
     * Specifies the Wireguard client mode. Must be one of either `file` or `manual`.
     */
    readonly wireguardClientMode: pulumi.Output<string | undefined>;
    /**
     * Specifies the Wireguard client peer IP.
     */
    readonly wireguardClientPeerIp: pulumi.Output<string | undefined>;
    /**
     * Specifies the Wireguard client peer port.
     */
    readonly wireguardClientPeerPort: pulumi.Output<number | undefined>;
    /**
     * Specifies the Wireguard client peer public key.
     */
    readonly wireguardClientPeerPublicKey: pulumi.Output<string | undefined>;
    /**
     * Specifies the Wireguard client preshared key.
     */
    readonly wireguardClientPresharedKey: pulumi.Output<string | undefined>;
    /**
     * Specifies whether the Wireguard client preshared key is enabled or not.
     */
    readonly wireguardClientPresharedKeyEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies the Wireguard ID.
     */
    readonly wireguardId: pulumi.Output<number | undefined>;
    /**
     * Specifies the Wireguard private key.
     */
    readonly wireguardPrivateKey: pulumi.Output<string | undefined>;
    /**
     * Specifies the Wireguard public key.
     */
    readonly wireguardPublicKey: pulumi.Output<string | undefined>;
    /**
     * Specifies the IPV4 WAN password.
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
     * Specifies the IPv4 addresses for the DNS server to be returned from the DHCP server. Leave blank to disable this feature.
     */
    dhcpDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies whether DHCP is enabled or not on this network.
     */
    dhcpEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the lease time for DHCP addresses in seconds. Defaults to `86400`.
     */
    dhcpLease?: pulumi.Input<number>;
    /**
     * Specifies whether DHCP relay is enabled or not on this network.
     */
    dhcpRelayEnabled?: pulumi.Input<boolean>;
    /**
     * The IPv4 address where the DHCP range of addresses starts.
     */
    dhcpStart?: pulumi.Input<string>;
    /**
     * The IPv4 address where the DHCP range of addresses stops.
     */
    dhcpStop?: pulumi.Input<string>;
    /**
     * Specifies the IPv6 addresses for the DNS server to be returned from the DHCP server. Used if `dhcp_v6_dns_auto` is set to `false`.
     */
    dhcpV6Dns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies DNS source to propagate. If set `false` the entries in `dhcp_v6_dns` are used, the upstream entries otherwise Defaults to `true`.
     */
    dhcpV6DnsAuto?: pulumi.Input<boolean>;
    /**
     * Enable stateful DHCPv6 for static configuration.
     */
    dhcpV6Enabled?: pulumi.Input<boolean>;
    /**
     * Specifies the lease time for DHCPv6 addresses in seconds. Defaults to `86400`.
     */
    dhcpV6Lease?: pulumi.Input<number>;
    /**
     * Start address of the DHCPv6 range. Used in static DHCPv6 configuration.
     */
    dhcpV6Start?: pulumi.Input<string>;
    /**
     * End address of the DHCPv6 range. Used in static DHCPv6 configuration.
     */
    dhcpV6Stop?: pulumi.Input<string>;
    /**
     * Toggles on the DHCP boot options. Should be set to true when you want to have dhcpd_boot_filename, and dhcpd_boot_server to take effect.
     */
    dhcpdBootEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the file to PXE boot from on the dhcpd_boot_server.
     */
    dhcpdBootFilename?: pulumi.Input<string>;
    /**
     * Specifies the IPv4 address of a TFTP server to network boot from.
     */
    dhcpdBootServer?: pulumi.Input<string>;
    /**
     * The domain name of this network.
     */
    domainName?: pulumi.Input<string>;
    /**
     * Specifies whether this network is enabled or not. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether IGMP snooping is enabled or not.
     */
    igmpSnooping?: pulumi.Input<boolean>;
    /**
     * Specifies whether this network should be allowed to access the internet or not. Defaults to `true`.
     */
    internetAccessEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether this network should be allowed to access other local networks or not. Defaults to `true`.
     */
    intraNetworkAccessEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of either `static`, `pd`, or `none`. Defaults to `none`.
     */
    ipv6InterfaceType?: pulumi.Input<string>;
    /**
     * Specifies which WAN interface to use for IPv6 PD. Must be one of either `wan` or `wan2`.
     */
    ipv6PdInterface?: pulumi.Input<string>;
    /**
     * Specifies the IPv6 Prefix ID.
     */
    ipv6PdPrefixid?: pulumi.Input<string>;
    /**
     * Start address of the DHCPv6 range. Used if `ipv6_interface_type` is set to `pd`.
     */
    ipv6PdStart?: pulumi.Input<string>;
    /**
     * End address of the DHCPv6 range. Used if `ipv6_interface_type` is set to `pd`.
     */
    ipv6PdStop?: pulumi.Input<string>;
    /**
     * Specifies whether to enable router advertisements or not.
     */
    ipv6RaEnable?: pulumi.Input<boolean>;
    /**
     * Lifetime in which the address can be used. Address becomes deprecated afterwards. Must be lower than or equal to `ipv6_ra_valid_lifetime` Defaults to `14400`.
     */
    ipv6RaPreferredLifetime?: pulumi.Input<number>;
    /**
     * IPv6 router advertisement priority. Must be one of either `high`, `medium`, or `low`
     */
    ipv6RaPriority?: pulumi.Input<string>;
    /**
     * Total lifetime in which the address can be used. Must be equal to or greater than `ipv6_ra_preferred_lifetime`. Defaults to `86400`.
     */
    ipv6RaValidLifetime?: pulumi.Input<number>;
    /**
     * Specifies the static IPv6 subnet when `ipv6_interface_type` is 'static'.
     */
    ipv6StaticSubnet?: pulumi.Input<string>;
    /**
     * Specifies whether Multicast DNS (mDNS) is enabled or not on the network (Controller >=v7).
     */
    multicastDns?: pulumi.Input<boolean>;
    /**
     * The name of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * The group of the network. Defaults to `LAN`.
     */
    networkGroup?: pulumi.Input<string>;
    /**
     * The purpose of the network. Must be one of `corporate`, `guest`, `wan`, `vlan-only`, or `vpn-client`.
     */
    purpose?: pulumi.Input<string>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string>;
    /**
     * The subnet of the network. Must be a valid CIDR address.
     */
    subnet?: pulumi.Input<string>;
    /**
     * The VLAN ID of the network.
     */
    vlanId?: pulumi.Input<number>;
    /**
     * Specifies the VPN type. Must be one of either `auto`, `l2tp`, `openvpn`, or `pptp`.
     */
    vpnType?: pulumi.Input<string>;
    /**
     * Specifies the IPv6 prefix size to request from ISP. Must be between 48 and 64.
     */
    wanDhcpV6PdSize?: pulumi.Input<number>;
    /**
     * DNS servers IPs of the WAN.
     */
    wanDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies the WAN egress quality of service. Defaults to `0`.
     */
    wanEgressQos?: pulumi.Input<number>;
    /**
     * The IPv4 gateway of the WAN.
     */
    wanGateway?: pulumi.Input<string>;
    /**
     * The IPv6 gateway of the WAN.
     */
    wanGatewayV6?: pulumi.Input<string>;
    /**
     * The IPv4 address of the WAN.
     */
    wanIp?: pulumi.Input<string>;
    /**
     * The IPv6 address of the WAN.
     */
    wanIpv6?: pulumi.Input<string>;
    /**
     * The IPv4 netmask of the WAN.
     */
    wanNetmask?: pulumi.Input<string>;
    /**
     * Specifies the WAN network group. Must be one of either `WAN`, `WAN2` or `WAN_LTE_FAILOVER`.
     */
    wanNetworkgroup?: pulumi.Input<string>;
    /**
     * The IPv6 prefix length of the WAN. Must be between 1 and 128.
     */
    wanPrefixlen?: pulumi.Input<number>;
    /**
     * Specifies the IPV4 WAN connection type. Must be one of either `disabled`, `static`, `dhcp`, or `pppoe`.
     */
    wanType?: pulumi.Input<string>;
    /**
     * Specifies the IPV6 WAN connection type. Must be one of either `disabled`, `static`, or `dhcpv6`.
     */
    wanTypeV6?: pulumi.Input<string>;
    /**
     * Specifies the IPV4 WAN username.
     */
    wanUsername?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client mode. Must be one of either `file` or `manual`.
     */
    wireguardClientMode?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client peer IP.
     */
    wireguardClientPeerIp?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client peer port.
     */
    wireguardClientPeerPort?: pulumi.Input<number>;
    /**
     * Specifies the Wireguard client peer public key.
     */
    wireguardClientPeerPublicKey?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client preshared key.
     */
    wireguardClientPresharedKey?: pulumi.Input<string>;
    /**
     * Specifies whether the Wireguard client preshared key is enabled or not.
     */
    wireguardClientPresharedKeyEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the Wireguard ID.
     */
    wireguardId?: pulumi.Input<number>;
    /**
     * Specifies the Wireguard private key.
     */
    wireguardPrivateKey?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard public key.
     */
    wireguardPublicKey?: pulumi.Input<string>;
    /**
     * Specifies the IPV4 WAN password.
     */
    xWanPassword?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Network resource.
 */
export interface NetworkArgs {
    /**
     * Specifies the IPv4 addresses for the DNS server to be returned from the DHCP server. Leave blank to disable this feature.
     */
    dhcpDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies whether DHCP is enabled or not on this network.
     */
    dhcpEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the lease time for DHCP addresses in seconds. Defaults to `86400`.
     */
    dhcpLease?: pulumi.Input<number>;
    /**
     * Specifies whether DHCP relay is enabled or not on this network.
     */
    dhcpRelayEnabled?: pulumi.Input<boolean>;
    /**
     * The IPv4 address where the DHCP range of addresses starts.
     */
    dhcpStart?: pulumi.Input<string>;
    /**
     * The IPv4 address where the DHCP range of addresses stops.
     */
    dhcpStop?: pulumi.Input<string>;
    /**
     * Specifies the IPv6 addresses for the DNS server to be returned from the DHCP server. Used if `dhcp_v6_dns_auto` is set to `false`.
     */
    dhcpV6Dns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies DNS source to propagate. If set `false` the entries in `dhcp_v6_dns` are used, the upstream entries otherwise Defaults to `true`.
     */
    dhcpV6DnsAuto?: pulumi.Input<boolean>;
    /**
     * Enable stateful DHCPv6 for static configuration.
     */
    dhcpV6Enabled?: pulumi.Input<boolean>;
    /**
     * Specifies the lease time for DHCPv6 addresses in seconds. Defaults to `86400`.
     */
    dhcpV6Lease?: pulumi.Input<number>;
    /**
     * Start address of the DHCPv6 range. Used in static DHCPv6 configuration.
     */
    dhcpV6Start?: pulumi.Input<string>;
    /**
     * End address of the DHCPv6 range. Used in static DHCPv6 configuration.
     */
    dhcpV6Stop?: pulumi.Input<string>;
    /**
     * Toggles on the DHCP boot options. Should be set to true when you want to have dhcpd_boot_filename, and dhcpd_boot_server to take effect.
     */
    dhcpdBootEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the file to PXE boot from on the dhcpd_boot_server.
     */
    dhcpdBootFilename?: pulumi.Input<string>;
    /**
     * Specifies the IPv4 address of a TFTP server to network boot from.
     */
    dhcpdBootServer?: pulumi.Input<string>;
    /**
     * The domain name of this network.
     */
    domainName?: pulumi.Input<string>;
    /**
     * Specifies whether this network is enabled or not. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether IGMP snooping is enabled or not.
     */
    igmpSnooping?: pulumi.Input<boolean>;
    /**
     * Specifies whether this network should be allowed to access the internet or not. Defaults to `true`.
     */
    internetAccessEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether this network should be allowed to access other local networks or not. Defaults to `true`.
     */
    intraNetworkAccessEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies which type of IPv6 connection to use. Must be one of either `static`, `pd`, or `none`. Defaults to `none`.
     */
    ipv6InterfaceType?: pulumi.Input<string>;
    /**
     * Specifies which WAN interface to use for IPv6 PD. Must be one of either `wan` or `wan2`.
     */
    ipv6PdInterface?: pulumi.Input<string>;
    /**
     * Specifies the IPv6 Prefix ID.
     */
    ipv6PdPrefixid?: pulumi.Input<string>;
    /**
     * Start address of the DHCPv6 range. Used if `ipv6_interface_type` is set to `pd`.
     */
    ipv6PdStart?: pulumi.Input<string>;
    /**
     * End address of the DHCPv6 range. Used if `ipv6_interface_type` is set to `pd`.
     */
    ipv6PdStop?: pulumi.Input<string>;
    /**
     * Specifies whether to enable router advertisements or not.
     */
    ipv6RaEnable?: pulumi.Input<boolean>;
    /**
     * Lifetime in which the address can be used. Address becomes deprecated afterwards. Must be lower than or equal to `ipv6_ra_valid_lifetime` Defaults to `14400`.
     */
    ipv6RaPreferredLifetime?: pulumi.Input<number>;
    /**
     * IPv6 router advertisement priority. Must be one of either `high`, `medium`, or `low`
     */
    ipv6RaPriority?: pulumi.Input<string>;
    /**
     * Total lifetime in which the address can be used. Must be equal to or greater than `ipv6_ra_preferred_lifetime`. Defaults to `86400`.
     */
    ipv6RaValidLifetime?: pulumi.Input<number>;
    /**
     * Specifies the static IPv6 subnet when `ipv6_interface_type` is 'static'.
     */
    ipv6StaticSubnet?: pulumi.Input<string>;
    /**
     * Specifies whether Multicast DNS (mDNS) is enabled or not on the network (Controller >=v7).
     */
    multicastDns?: pulumi.Input<boolean>;
    /**
     * The name of the network.
     */
    name?: pulumi.Input<string>;
    /**
     * The group of the network. Defaults to `LAN`.
     */
    networkGroup?: pulumi.Input<string>;
    /**
     * The purpose of the network. Must be one of `corporate`, `guest`, `wan`, `vlan-only`, or `vpn-client`.
     */
    purpose: pulumi.Input<string>;
    /**
     * The name of the site to associate the network with.
     */
    site?: pulumi.Input<string>;
    /**
     * The subnet of the network. Must be a valid CIDR address.
     */
    subnet?: pulumi.Input<string>;
    /**
     * The VLAN ID of the network.
     */
    vlanId?: pulumi.Input<number>;
    /**
     * Specifies the VPN type. Must be one of either `auto`, `l2tp`, `openvpn`, or `pptp`.
     */
    vpnType?: pulumi.Input<string>;
    /**
     * Specifies the IPv6 prefix size to request from ISP. Must be between 48 and 64.
     */
    wanDhcpV6PdSize?: pulumi.Input<number>;
    /**
     * DNS servers IPs of the WAN.
     */
    wanDns?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Specifies the WAN egress quality of service. Defaults to `0`.
     */
    wanEgressQos?: pulumi.Input<number>;
    /**
     * The IPv4 gateway of the WAN.
     */
    wanGateway?: pulumi.Input<string>;
    /**
     * The IPv6 gateway of the WAN.
     */
    wanGatewayV6?: pulumi.Input<string>;
    /**
     * The IPv4 address of the WAN.
     */
    wanIp?: pulumi.Input<string>;
    /**
     * The IPv6 address of the WAN.
     */
    wanIpv6?: pulumi.Input<string>;
    /**
     * The IPv4 netmask of the WAN.
     */
    wanNetmask?: pulumi.Input<string>;
    /**
     * Specifies the WAN network group. Must be one of either `WAN`, `WAN2` or `WAN_LTE_FAILOVER`.
     */
    wanNetworkgroup?: pulumi.Input<string>;
    /**
     * The IPv6 prefix length of the WAN. Must be between 1 and 128.
     */
    wanPrefixlen?: pulumi.Input<number>;
    /**
     * Specifies the IPV4 WAN connection type. Must be one of either `disabled`, `static`, `dhcp`, or `pppoe`.
     */
    wanType?: pulumi.Input<string>;
    /**
     * Specifies the IPV6 WAN connection type. Must be one of either `disabled`, `static`, or `dhcpv6`.
     */
    wanTypeV6?: pulumi.Input<string>;
    /**
     * Specifies the IPV4 WAN username.
     */
    wanUsername?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client mode. Must be one of either `file` or `manual`.
     */
    wireguardClientMode?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client peer IP.
     */
    wireguardClientPeerIp?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client peer port.
     */
    wireguardClientPeerPort?: pulumi.Input<number>;
    /**
     * Specifies the Wireguard client peer public key.
     */
    wireguardClientPeerPublicKey?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard client preshared key.
     */
    wireguardClientPresharedKey?: pulumi.Input<string>;
    /**
     * Specifies whether the Wireguard client preshared key is enabled or not.
     */
    wireguardClientPresharedKeyEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies the Wireguard ID.
     */
    wireguardId?: pulumi.Input<number>;
    /**
     * Specifies the Wireguard private key.
     */
    wireguardPrivateKey?: pulumi.Input<string>;
    /**
     * Specifies the Wireguard public key.
     */
    wireguardPublicKey?: pulumi.Input<string>;
    /**
     * Specifies the IPV4 WAN password.
     */
    xWanPassword?: pulumi.Input<string>;
}

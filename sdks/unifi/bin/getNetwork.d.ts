import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getNetwork(args?: GetNetworkArgs, opts?: pulumi.InvokeOptions): Promise<GetNetworkResult>;
/**
 * A collection of arguments for invoking getNetwork.
 */
export interface GetNetworkArgs {
    id?: string;
    name?: string;
    site?: string;
}
/**
 * A collection of values returned by getNetwork.
 */
export interface GetNetworkResult {
    readonly autoScale: boolean;
    readonly dhcpGuarding: outputs.GetNetworkDhcpGuarding;
    readonly dhcpRelay: outputs.GetNetworkDhcpRelay;
    readonly dhcpServer: outputs.GetNetworkDhcpServer;
    readonly dhcpV6Server: outputs.GetNetworkDhcpV6Server;
    readonly domainName: string;
    readonly enabled: boolean;
    readonly gatewayType: string;
    readonly id: string;
    readonly igmpSnooping: boolean;
    readonly internetAccess: boolean;
    readonly ipAliases: string[];
    readonly ipv6Aliases: string[];
    readonly ipv6InterfaceType: string;
    readonly ipv6PdInterface: string;
    readonly ipv6PdPrefixid: string;
    readonly ipv6PdStart: string;
    readonly ipv6PdStop: string;
    readonly ipv6Ra: boolean;
    readonly ipv6RaPreferredLifetime: number;
    readonly ipv6RaPriority: string;
    readonly ipv6RaValidLifetime: number;
    readonly ipv6StaticSubnet: string;
    readonly lteLan: boolean;
    readonly multicastDns: boolean;
    readonly name: string;
    readonly natOutboundIpAddresses: outputs.GetNetworkNatOutboundIpAddress[];
    readonly networkGroup: string;
    readonly networkIsolation: boolean;
    readonly purpose: string;
    readonly settingPreference: string;
    readonly site: string;
    readonly subnet: string;
    readonly thirdPartyGateway: boolean;
    readonly vlan: number;
    readonly wanDns: string[];
    readonly wanEgressQos: number;
    readonly wanGateway: string;
    readonly wanGatewayV6: string;
    readonly wanIp: string;
    readonly wanNetmask: string;
    readonly wanNetworkGroup: string;
    readonly wanType: string;
    readonly wanTypeV6: string;
    readonly wanUsername: string;
}
export declare function getNetworkOutput(args?: GetNetworkOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetNetworkResult>;
/**
 * A collection of arguments for invoking getNetwork.
 */
export interface GetNetworkOutputArgs {
    id?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

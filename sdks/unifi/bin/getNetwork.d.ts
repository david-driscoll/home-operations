import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getNetwork(args?: GetNetworkArgs, opts?: pulumi.InvokeOptions): Promise<GetNetworkResult>;
/**
 * A collection of arguments for invoking getNetwork.
 */
export interface GetNetworkArgs {
    id?: string;
    name?: string;
    site?: string;
    timeouts?: inputs.GetNetworkTimeouts;
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
    readonly ipv6RaPreferredLifetime: string;
    readonly ipv6RaPriority: string;
    readonly ipv6RaValidLifetime: string;
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
    readonly timeouts?: outputs.GetNetworkTimeouts;
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
    id?: pulumi.Input<string | undefined>;
    name?: pulumi.Input<string | undefined>;
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.GetNetworkTimeoutsArgs | undefined>;
}
//# sourceMappingURL=getNetwork.d.ts.map
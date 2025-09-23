import * as pulumi from "@pulumi/pulumi";
export declare function getFirewallZone(args: GetFirewallZoneArgs, opts?: pulumi.InvokeOptions): Promise<GetFirewallZoneResult>;
/**
 * A collection of arguments for invoking getFirewallZone.
 */
export interface GetFirewallZoneArgs {
    name: string;
    site?: string;
}
/**
 * A collection of values returned by getFirewallZone.
 */
export interface GetFirewallZoneResult {
    readonly id: string;
    readonly name: string;
    readonly networks: string[];
    readonly site: string;
}
export declare function getFirewallZoneOutput(args: GetFirewallZoneOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetFirewallZoneResult>;
/**
 * A collection of arguments for invoking getFirewallZone.
 */
export interface GetFirewallZoneOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

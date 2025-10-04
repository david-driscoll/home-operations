import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getClient(args: GetClientArgs, opts?: pulumi.InvokeOptions): Promise<GetClientResult>;
/**
 * A collection of arguments for invoking getClient.
 */
export interface GetClientArgs {
    name: string;
}
/**
 * A collection of values returned by getClient.
 */
export interface GetClientResult {
    readonly blockedServices: string[];
    readonly blockedServicesPauseSchedule: outputs.GetClientBlockedServicesPauseSchedule;
    readonly filteringEnabled: boolean;
    readonly id: string;
    readonly ids: string[];
    readonly ignoreQuerylog: boolean;
    readonly ignoreStatistics: boolean;
    readonly lastUpdated: string;
    readonly name: string;
    readonly parentalEnabled: boolean;
    readonly safebrowsingEnabled: boolean;
    readonly safesearch: outputs.GetClientSafesearch;
    readonly tags: string[];
    readonly upstreams: string[];
    readonly upstreamsCacheEnabled: boolean;
    readonly upstreamsCacheSize: number;
    readonly useGlobalBlockedServices: boolean;
    readonly useGlobalSettings: boolean;
}
export declare function getClientOutput(args: GetClientOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetClientResult>;
/**
 * A collection of arguments for invoking getClient.
 */
export interface GetClientOutputArgs {
    name: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getConfig(opts?: pulumi.InvokeOptions): Promise<GetConfigResult>;
/**
 * A collection of values returned by getConfig.
 */
export interface GetConfigResult {
    readonly blockedServices: string[];
    readonly blockedServicesPauseSchedule: outputs.GetConfigBlockedServicesPauseSchedule;
    readonly dhcp: outputs.GetConfigDhcp;
    readonly dns: outputs.GetConfigDns;
    readonly filtering: outputs.GetConfigFiltering;
    readonly id: string;
    readonly lastUpdated: string;
    readonly parentalControl: boolean;
    readonly querylog: outputs.GetConfigQuerylog;
    readonly safebrowsing: boolean;
    readonly safesearch: outputs.GetConfigSafesearch;
    readonly stats: outputs.GetConfigStats;
    readonly tls: outputs.GetConfigTls;
}
export declare function getConfigOutput(opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetConfigResult>;

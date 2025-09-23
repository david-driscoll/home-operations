import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getDnsRecords(args?: GetDnsRecordsArgs, opts?: pulumi.InvokeOptions): Promise<GetDnsRecordsResult>;
/**
 * A collection of arguments for invoking getDnsRecords.
 */
export interface GetDnsRecordsArgs {
    site?: string;
}
/**
 * A collection of values returned by getDnsRecords.
 */
export interface GetDnsRecordsResult {
    /**
     * The provider-assigned unique ID for this managed resource.
     */
    readonly id: string;
    readonly results: outputs.GetDnsRecordsResult[];
    readonly site: string;
}
export declare function getDnsRecordsOutput(args?: GetDnsRecordsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetDnsRecordsResult>;
/**
 * A collection of arguments for invoking getDnsRecords.
 */
export interface GetDnsRecordsOutputArgs {
    site?: pulumi.Input<string>;
}

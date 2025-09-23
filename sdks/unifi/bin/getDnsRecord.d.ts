import * as pulumi from "@pulumi/pulumi";
export declare function getDnsRecord(args?: GetDnsRecordArgs, opts?: pulumi.InvokeOptions): Promise<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordArgs {
    name?: string;
    record?: string;
    site?: string;
}
/**
 * A collection of values returned by getDnsRecord.
 */
export interface GetDnsRecordResult {
    readonly enabled: boolean;
    readonly id: string;
    readonly name: string;
    readonly port: number;
    readonly priority: number;
    readonly record: string;
    readonly site: string;
    readonly ttl: number;
    readonly type: string;
    readonly weight: number;
}
export declare function getDnsRecordOutput(args?: GetDnsRecordOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordOutputArgs {
    name?: pulumi.Input<string>;
    record?: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

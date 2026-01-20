import * as pulumi from "@pulumi/pulumi";
export declare function getDnsRecord(args: GetDnsRecordArgs, opts?: pulumi.InvokeOptions): Promise<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordArgs {
    name: string;
    site?: string;
}
/**
 * A collection of values returned by getDnsRecord.
 */
export interface GetDnsRecordResult {
    readonly enabled: boolean;
    readonly id: string;
    readonly name: string;
    readonly site: string;
    readonly ttl: number;
    readonly type: string;
    readonly value: string;
}
export declare function getDnsRecordOutput(args: GetDnsRecordOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

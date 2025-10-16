import * as pulumi from "@pulumi/pulumi";
export declare function getDnsRecord(args?: GetDnsRecordArgs, opts?: pulumi.InvokeOptions): Promise<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordArgs {
    name?: string;
    port?: number;
    priority?: number;
    recordType?: string;
    site?: string;
    ttl?: number;
    value?: string;
    weight?: number;
}
/**
 * A collection of values returned by getDnsRecord.
 */
export interface GetDnsRecordResult {
    readonly id: string;
    readonly name?: string;
    readonly port?: number;
    readonly priority?: number;
    readonly recordType?: string;
    readonly site: string;
    readonly ttl?: number;
    readonly value?: string;
    readonly weight?: number;
}
export declare function getDnsRecordOutput(args?: GetDnsRecordOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordOutputArgs {
    name?: pulumi.Input<string>;
    port?: pulumi.Input<number>;
    priority?: pulumi.Input<number>;
    recordType?: pulumi.Input<string>;
    site?: pulumi.Input<string>;
    ttl?: pulumi.Input<number>;
    value?: pulumi.Input<string>;
    weight?: pulumi.Input<number>;
}

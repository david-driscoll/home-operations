import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getDnsRecord(args: GetDnsRecordArgs, opts?: pulumi.InvokeOptions): Promise<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordArgs {
    name: string;
    site?: string;
    timeouts?: inputs.GetDnsRecordTimeouts;
}
/**
 * A collection of values returned by getDnsRecord.
 */
export interface GetDnsRecordResult {
    readonly enabled: boolean;
    readonly id: string;
    readonly name: string;
    readonly site: string;
    readonly timeouts?: outputs.GetDnsRecordTimeouts;
    readonly ttl: string;
    readonly type: string;
    readonly value: string;
}
export declare function getDnsRecordOutput(args: GetDnsRecordOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetDnsRecordResult>;
/**
 * A collection of arguments for invoking getDnsRecord.
 */
export interface GetDnsRecordOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.GetDnsRecordTimeoutsArgs | undefined>;
}
//# sourceMappingURL=getDnsRecord.d.ts.map
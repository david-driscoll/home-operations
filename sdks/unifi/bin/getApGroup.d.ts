import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getApGroup(args: GetApGroupArgs, opts?: pulumi.InvokeOptions): Promise<GetApGroupResult>;
/**
 * A collection of arguments for invoking getApGroup.
 */
export interface GetApGroupArgs {
    name: string;
    site?: string;
    timeouts?: inputs.GetApGroupTimeouts;
}
/**
 * A collection of values returned by getApGroup.
 */
export interface GetApGroupResult {
    readonly deviceMacs: string[];
    readonly id: string;
    readonly name: string;
    readonly site: string;
    readonly timeouts?: outputs.GetApGroupTimeouts;
}
export declare function getApGroupOutput(args: GetApGroupOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetApGroupResult>;
/**
 * A collection of arguments for invoking getApGroup.
 */
export interface GetApGroupOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.GetApGroupTimeoutsArgs | undefined>;
}
//# sourceMappingURL=getApGroup.d.ts.map
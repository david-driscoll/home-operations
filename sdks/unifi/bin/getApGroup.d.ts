import * as pulumi from "@pulumi/pulumi";
export declare function getApGroup(args: GetApGroupArgs, opts?: pulumi.InvokeOptions): Promise<GetApGroupResult>;
/**
 * A collection of arguments for invoking getApGroup.
 */
export interface GetApGroupArgs {
    name: string;
    site?: string;
}
/**
 * A collection of values returned by getApGroup.
 */
export interface GetApGroupResult {
    readonly deviceMacs: string[];
    readonly id: string;
    readonly name: string;
    readonly site: string;
}
export declare function getApGroupOutput(args: GetApGroupOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetApGroupResult>;
/**
 * A collection of arguments for invoking getApGroup.
 */
export interface GetApGroupOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

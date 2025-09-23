import * as pulumi from "@pulumi/pulumi";
export declare function getPortProfile(args?: GetPortProfileArgs, opts?: pulumi.InvokeOptions): Promise<GetPortProfileResult>;
/**
 * A collection of arguments for invoking getPortProfile.
 */
export interface GetPortProfileArgs {
    name?: string;
    site?: string;
}
/**
 * A collection of values returned by getPortProfile.
 */
export interface GetPortProfileResult {
    readonly id: string;
    readonly name?: string;
    readonly site: string;
}
export declare function getPortProfileOutput(args?: GetPortProfileOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPortProfileResult>;
/**
 * A collection of arguments for invoking getPortProfile.
 */
export interface GetPortProfileOutputArgs {
    name?: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

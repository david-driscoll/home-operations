import * as pulumi from "@pulumi/pulumi";
export declare function getWebauthnDeviceType(args?: GetWebauthnDeviceTypeArgs, opts?: pulumi.InvokeOptions): Promise<GetWebauthnDeviceTypeResult>;
/**
 * A collection of arguments for invoking getWebauthnDeviceType.
 */
export interface GetWebauthnDeviceTypeArgs {
    description?: string;
    id?: string;
}
/**
 * A collection of values returned by getWebauthnDeviceType.
 */
export interface GetWebauthnDeviceTypeResult {
    readonly aaguid: string;
    readonly description: string;
    readonly id: string;
}
export declare function getWebauthnDeviceTypeOutput(args?: GetWebauthnDeviceTypeOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetWebauthnDeviceTypeResult>;
/**
 * A collection of arguments for invoking getWebauthnDeviceType.
 */
export interface GetWebauthnDeviceTypeOutputArgs {
    description?: pulumi.Input<string>;
    id?: pulumi.Input<string>;
}

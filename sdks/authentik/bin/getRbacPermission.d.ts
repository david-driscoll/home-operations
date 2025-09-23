import * as pulumi from "@pulumi/pulumi";
export declare function getRbacPermission(args: GetRbacPermissionArgs, opts?: pulumi.InvokeOptions): Promise<GetRbacPermissionResult>;
/**
 * A collection of arguments for invoking getRbacPermission.
 */
export interface GetRbacPermissionArgs {
    codename: string;
    id?: string;
}
/**
 * A collection of values returned by getRbacPermission.
 */
export interface GetRbacPermissionResult {
    readonly app: string;
    readonly codename: string;
    readonly id: string;
    readonly model: string;
}
export declare function getRbacPermissionOutput(args: GetRbacPermissionOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetRbacPermissionResult>;
/**
 * A collection of arguments for invoking getRbacPermission.
 */
export interface GetRbacPermissionOutputArgs {
    codename: pulumi.Input<string>;
    id?: pulumi.Input<string>;
}

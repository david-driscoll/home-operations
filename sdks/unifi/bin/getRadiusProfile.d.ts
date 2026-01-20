import * as pulumi from "@pulumi/pulumi";
export declare function getRadiusProfile(args: GetRadiusProfileArgs, opts?: pulumi.InvokeOptions): Promise<GetRadiusProfileResult>;
/**
 * A collection of arguments for invoking getRadiusProfile.
 */
export interface GetRadiusProfileArgs {
    name: string;
    site?: string;
}
/**
 * A collection of values returned by getRadiusProfile.
 */
export interface GetRadiusProfileResult {
    readonly accountingEnabled: boolean;
    readonly id: string;
    readonly interimUpdateEnabled: boolean;
    readonly interimUpdateInterval: number;
    readonly name: string;
    readonly site: string;
    readonly useUsgAcctServer: boolean;
    readonly useUsgAuthServer: boolean;
    readonly vlanEnabled: boolean;
    readonly vlanWlanMode: string;
}
export declare function getRadiusProfileOutput(args: GetRadiusProfileOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetRadiusProfileResult>;
/**
 * A collection of arguments for invoking getRadiusProfile.
 */
export interface GetRadiusProfileOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

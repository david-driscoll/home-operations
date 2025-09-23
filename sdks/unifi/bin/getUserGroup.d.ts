import * as pulumi from "@pulumi/pulumi";
export declare function getUserGroup(args?: GetUserGroupArgs, opts?: pulumi.InvokeOptions): Promise<GetUserGroupResult>;
/**
 * A collection of arguments for invoking getUserGroup.
 */
export interface GetUserGroupArgs {
    name?: string;
    site?: string;
}
/**
 * A collection of values returned by getUserGroup.
 */
export interface GetUserGroupResult {
    readonly id: string;
    readonly name?: string;
    readonly qosRateMaxDown: number;
    readonly qosRateMaxUp: number;
    readonly site: string;
}
export declare function getUserGroupOutput(args?: GetUserGroupOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUserGroupResult>;
/**
 * A collection of arguments for invoking getUserGroup.
 */
export interface GetUserGroupOutputArgs {
    name?: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

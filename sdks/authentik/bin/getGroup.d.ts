import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getGroup(args?: GetGroupArgs, opts?: pulumi.InvokeOptions): Promise<GetGroupResult>;
/**
 * A collection of arguments for invoking getGroup.
 */
export interface GetGroupArgs {
    id?: string;
    includeUsers?: boolean;
    name?: string;
    pk?: string;
}
/**
 * A collection of values returned by getGroup.
 */
export interface GetGroupResult {
    readonly attributes: string;
    readonly id: string;
    readonly includeUsers?: boolean;
    readonly isSuperuser: boolean;
    readonly name?: string;
    readonly numPk: number;
    readonly parentName: string;
    readonly parents: string[];
    readonly pk?: string;
    readonly users: number[];
    readonly usersObjs: outputs.GetGroupUsersObj[];
}
export declare function getGroupOutput(args?: GetGroupOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetGroupResult>;
/**
 * A collection of arguments for invoking getGroup.
 */
export interface GetGroupOutputArgs {
    id?: pulumi.Input<string>;
    includeUsers?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    pk?: pulumi.Input<string>;
}

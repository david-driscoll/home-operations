import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getGroups(args?: GetGroupsArgs, opts?: pulumi.InvokeOptions): Promise<GetGroupsResult>;
/**
 * A collection of arguments for invoking getGroups.
 */
export interface GetGroupsArgs {
    attributes?: string;
    id?: string;
    includeUsers?: boolean;
    isSuperuser?: boolean;
    membersByPks?: number[];
    membersByUsernames?: string[];
    name?: string;
    ordering?: string;
    search?: string;
}
/**
 * A collection of values returned by getGroups.
 */
export interface GetGroupsResult {
    readonly attributes?: string;
    readonly groups: outputs.GetGroupsGroup[];
    readonly id: string;
    readonly includeUsers?: boolean;
    readonly isSuperuser?: boolean;
    readonly membersByPks?: number[];
    readonly membersByUsernames?: string[];
    readonly name?: string;
    readonly ordering?: string;
    readonly search?: string;
}
export declare function getGroupsOutput(args?: GetGroupsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetGroupsResult>;
/**
 * A collection of arguments for invoking getGroups.
 */
export interface GetGroupsOutputArgs {
    attributes?: pulumi.Input<string>;
    id?: pulumi.Input<string>;
    includeUsers?: pulumi.Input<boolean>;
    isSuperuser?: pulumi.Input<boolean>;
    membersByPks?: pulumi.Input<pulumi.Input<number>[]>;
    membersByUsernames?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
    ordering?: pulumi.Input<string>;
    search?: pulumi.Input<string>;
}

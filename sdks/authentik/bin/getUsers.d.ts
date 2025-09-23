import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
export declare function getUsers(args?: GetUsersArgs, opts?: pulumi.InvokeOptions): Promise<GetUsersResult>;
/**
 * A collection of arguments for invoking getUsers.
 */
export interface GetUsersArgs {
    attributes?: string;
    email?: string;
    groupsByNames?: string[];
    groupsByPks?: string[];
    id?: string;
    isActive?: boolean;
    isSuperuser?: boolean;
    name?: string;
    ordering?: string;
    path?: string;
    pathStartswith?: string;
    search?: string;
    username?: string;
    uuid?: string;
}
/**
 * A collection of values returned by getUsers.
 */
export interface GetUsersResult {
    readonly attributes?: string;
    readonly email?: string;
    readonly groupsByNames?: string[];
    readonly groupsByPks?: string[];
    readonly id: string;
    readonly isActive?: boolean;
    readonly isSuperuser?: boolean;
    readonly name?: string;
    readonly ordering?: string;
    readonly path?: string;
    readonly pathStartswith?: string;
    readonly search?: string;
    readonly username?: string;
    readonly users: outputs.GetUsersUser[];
    readonly uuid?: string;
}
export declare function getUsersOutput(args?: GetUsersOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUsersResult>;
/**
 * A collection of arguments for invoking getUsers.
 */
export interface GetUsersOutputArgs {
    attributes?: pulumi.Input<string>;
    email?: pulumi.Input<string>;
    groupsByNames?: pulumi.Input<pulumi.Input<string>[]>;
    groupsByPks?: pulumi.Input<pulumi.Input<string>[]>;
    id?: pulumi.Input<string>;
    isActive?: pulumi.Input<boolean>;
    isSuperuser?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    ordering?: pulumi.Input<string>;
    path?: pulumi.Input<string>;
    pathStartswith?: pulumi.Input<string>;
    search?: pulumi.Input<string>;
    username?: pulumi.Input<string>;
    uuid?: pulumi.Input<string>;
}

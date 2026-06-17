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
    attributes?: pulumi.Input<string | undefined>;
    email?: pulumi.Input<string | undefined>;
    groupsByNames?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    groupsByPks?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    id?: pulumi.Input<string | undefined>;
    isActive?: pulumi.Input<boolean | undefined>;
    isSuperuser?: pulumi.Input<boolean | undefined>;
    name?: pulumi.Input<string | undefined>;
    ordering?: pulumi.Input<string | undefined>;
    path?: pulumi.Input<string | undefined>;
    pathStartswith?: pulumi.Input<string | undefined>;
    search?: pulumi.Input<string | undefined>;
    username?: pulumi.Input<string | undefined>;
    uuid?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getUsers.d.ts.map
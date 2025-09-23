import * as pulumi from "@pulumi/pulumi";
export declare function getUser(args?: GetUserArgs, opts?: pulumi.InvokeOptions): Promise<GetUserResult>;
/**
 * A collection of arguments for invoking getUser.
 */
export interface GetUserArgs {
    id?: string;
    pk?: number;
    username?: string;
}
/**
 * A collection of values returned by getUser.
 */
export interface GetUserResult {
    readonly attributes: string;
    readonly avatar: string;
    readonly dateJoined: string;
    readonly email: string;
    readonly groups: string[];
    readonly id: string;
    readonly isActive: boolean;
    readonly isSuperuser: boolean;
    readonly lastLogin: string;
    readonly name: string;
    readonly path: string;
    readonly pk: number;
    readonly type: string;
    readonly uid: string;
    readonly username: string;
    readonly uuid: string;
}
export declare function getUserOutput(args?: GetUserOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUserResult>;
/**
 * A collection of arguments for invoking getUser.
 */
export interface GetUserOutputArgs {
    id?: pulumi.Input<string>;
    pk?: pulumi.Input<number>;
    username?: pulumi.Input<string>;
}

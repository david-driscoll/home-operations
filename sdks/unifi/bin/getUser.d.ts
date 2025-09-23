import * as pulumi from "@pulumi/pulumi";
export declare function getUser(args: GetUserArgs, opts?: pulumi.InvokeOptions): Promise<GetUserResult>;
/**
 * A collection of arguments for invoking getUser.
 */
export interface GetUserArgs {
    mac: string;
    site?: string;
}
/**
 * A collection of values returned by getUser.
 */
export interface GetUserResult {
    readonly blocked: boolean;
    readonly devIdOverride: number;
    readonly fixedIp: string;
    readonly hostname: string;
    readonly id: string;
    readonly ip: string;
    readonly localDnsRecord: string;
    readonly mac: string;
    readonly name: string;
    readonly networkId: string;
    readonly note: string;
    readonly site: string;
    readonly userGroupId: string;
}
export declare function getUserOutput(args: GetUserOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUserResult>;
/**
 * A collection of arguments for invoking getUser.
 */
export interface GetUserOutputArgs {
    mac: pulumi.Input<string>;
    site?: pulumi.Input<string>;
}

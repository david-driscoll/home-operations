import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getAccount(args: GetAccountArgs, opts?: pulumi.InvokeOptions): Promise<GetAccountResult>;
/**
 * A collection of arguments for invoking getAccount.
 */
export interface GetAccountArgs {
    name: string;
    site?: string;
    timeouts?: inputs.GetAccountTimeouts;
}
/**
 * A collection of values returned by getAccount.
 */
export interface GetAccountResult {
    readonly id: string;
    readonly name: string;
    readonly networkId: string;
    readonly password: string;
    readonly site: string;
    readonly timeouts?: outputs.GetAccountTimeouts;
    readonly tunnelMediumType: number;
    readonly tunnelType: number;
}
export declare function getAccountOutput(args: GetAccountOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetAccountResult>;
/**
 * A collection of arguments for invoking getAccount.
 */
export interface GetAccountOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.GetAccountTimeoutsArgs | undefined>;
}
//# sourceMappingURL=getAccount.d.ts.map
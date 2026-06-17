import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getRadiusProfile(args: GetRadiusProfileArgs, opts?: pulumi.InvokeOptions): Promise<GetRadiusProfileResult>;
/**
 * A collection of arguments for invoking getRadiusProfile.
 */
export interface GetRadiusProfileArgs {
    name: string;
    site?: string;
    timeouts?: inputs.GetRadiusProfileTimeouts;
}
/**
 * A collection of values returned by getRadiusProfile.
 */
export interface GetRadiusProfileResult {
    readonly accountingEnabled: boolean;
    readonly id: string;
    readonly interimUpdateEnabled: boolean;
    readonly interimUpdateInterval: string;
    readonly name: string;
    readonly site: string;
    readonly timeouts?: outputs.GetRadiusProfileTimeouts;
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
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.GetRadiusProfileTimeoutsArgs | undefined>;
}
//# sourceMappingURL=getRadiusProfile.d.ts.map
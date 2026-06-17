import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getPortProfile(args: GetPortProfileArgs, opts?: pulumi.InvokeOptions): Promise<GetPortProfileResult>;
/**
 * A collection of arguments for invoking getPortProfile.
 */
export interface GetPortProfileArgs {
    name: string;
    site?: string;
    timeouts?: inputs.GetPortProfileTimeouts;
}
/**
 * A collection of values returned by getPortProfile.
 */
export interface GetPortProfileResult {
    readonly forward: string;
    readonly id: string;
    readonly name: string;
    readonly nativeNetworkconfId: string;
    readonly site: string;
    readonly taggedNetworkconfIds: string[];
    readonly timeouts?: outputs.GetPortProfileTimeouts;
}
export declare function getPortProfileOutput(args: GetPortProfileOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPortProfileResult>;
/**
 * A collection of arguments for invoking getPortProfile.
 */
export interface GetPortProfileOutputArgs {
    name: pulumi.Input<string>;
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.GetPortProfileTimeoutsArgs | undefined>;
}
//# sourceMappingURL=getPortProfile.d.ts.map
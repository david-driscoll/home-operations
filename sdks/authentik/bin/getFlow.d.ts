import * as pulumi from "@pulumi/pulumi";
export declare function getFlow(args?: GetFlowArgs, opts?: pulumi.InvokeOptions): Promise<GetFlowResult>;
/**
 * A collection of arguments for invoking getFlow.
 */
export interface GetFlowArgs {
    authentication?: string;
    designation?: string;
    id?: string;
    slug?: string;
}
/**
 * A collection of values returned by getFlow.
 */
export interface GetFlowResult {
    readonly authentication: string;
    readonly designation: string;
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly title: string;
}
export declare function getFlowOutput(args?: GetFlowOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetFlowResult>;
/**
 * A collection of arguments for invoking getFlow.
 */
export interface GetFlowOutputArgs {
    authentication?: pulumi.Input<string>;
    designation?: pulumi.Input<string>;
    id?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
}

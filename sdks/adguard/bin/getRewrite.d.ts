import * as pulumi from "@pulumi/pulumi";
export declare function getRewrite(args: GetRewriteArgs, opts?: pulumi.InvokeOptions): Promise<GetRewriteResult>;
/**
 * A collection of arguments for invoking getRewrite.
 */
export interface GetRewriteArgs {
    answer: string;
    domain: string;
}
/**
 * A collection of values returned by getRewrite.
 */
export interface GetRewriteResult {
    readonly answer: string;
    readonly domain: string;
    readonly id: string;
}
export declare function getRewriteOutput(args: GetRewriteOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetRewriteResult>;
/**
 * A collection of arguments for invoking getRewrite.
 */
export interface GetRewriteOutputArgs {
    answer: pulumi.Input<string>;
    domain: pulumi.Input<string>;
}

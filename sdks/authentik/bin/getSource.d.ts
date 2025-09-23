import * as pulumi from "@pulumi/pulumi";
export declare function getSource(args?: GetSourceArgs, opts?: pulumi.InvokeOptions): Promise<GetSourceResult>;
/**
 * A collection of arguments for invoking getSource.
 */
export interface GetSourceArgs {
    id?: string;
    managed?: string;
    slug?: string;
}
/**
 * A collection of values returned by getSource.
 */
export interface GetSourceResult {
    readonly id: string;
    readonly managed: string;
    readonly name: string;
    readonly slug: string;
    readonly uuid: string;
}
export declare function getSourceOutput(args?: GetSourceOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetSourceResult>;
/**
 * A collection of arguments for invoking getSource.
 */
export interface GetSourceOutputArgs {
    id?: pulumi.Input<string>;
    managed?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
export declare function getListFilter(args: GetListFilterArgs, opts?: pulumi.InvokeOptions): Promise<GetListFilterResult>;
/**
 * A collection of arguments for invoking getListFilter.
 */
export interface GetListFilterArgs {
    name: string;
    whitelist?: boolean;
}
/**
 * A collection of values returned by getListFilter.
 */
export interface GetListFilterResult {
    readonly enabled: boolean;
    readonly id: number;
    readonly lastUpdated: string;
    readonly name: string;
    readonly rulesCount: number;
    readonly url: string;
    readonly whitelist?: boolean;
}
export declare function getListFilterOutput(args: GetListFilterOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetListFilterResult>;
/**
 * A collection of arguments for invoking getListFilter.
 */
export interface GetListFilterOutputArgs {
    name: pulumi.Input<string>;
    whitelist?: pulumi.Input<boolean>;
}

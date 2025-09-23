import * as pulumi from "@pulumi/pulumi";
export declare function getStage(args?: GetStageArgs, opts?: pulumi.InvokeOptions): Promise<GetStageResult>;
/**
 * A collection of arguments for invoking getStage.
 */
export interface GetStageArgs {
    id?: string;
    name?: string;
}
/**
 * A collection of values returned by getStage.
 */
export interface GetStageResult {
    readonly id: string;
    readonly name: string;
}
export declare function getStageOutput(args?: GetStageOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetStageResult>;
/**
 * A collection of arguments for invoking getStage.
 */
export interface GetStageOutputArgs {
    id?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
}

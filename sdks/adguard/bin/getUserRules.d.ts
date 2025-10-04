import * as pulumi from "@pulumi/pulumi";
export declare function getUserRules(opts?: pulumi.InvokeOptions): Promise<GetUserRulesResult>;
/**
 * A collection of values returned by getUserRules.
 */
export interface GetUserRulesResult {
    readonly id: string;
    readonly rules: string[];
}
export declare function getUserRulesOutput(opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUserRulesResult>;

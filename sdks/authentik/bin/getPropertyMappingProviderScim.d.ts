import * as pulumi from "@pulumi/pulumi";
export declare function getPropertyMappingProviderScim(args?: GetPropertyMappingProviderScimArgs, opts?: pulumi.InvokeOptions): Promise<GetPropertyMappingProviderScimResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderScim.
 */
export interface GetPropertyMappingProviderScimArgs {
    id?: string;
    ids?: string[];
    managed?: string;
    managedLists?: string[];
    name?: string;
}
/**
 * A collection of values returned by getPropertyMappingProviderScim.
 */
export interface GetPropertyMappingProviderScimResult {
    readonly expression: string;
    readonly id: string;
    readonly ids: string[];
    readonly managed?: string;
    readonly managedLists?: string[];
    readonly name?: string;
}
export declare function getPropertyMappingProviderScimOutput(args?: GetPropertyMappingProviderScimOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPropertyMappingProviderScimResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderScim.
 */
export interface GetPropertyMappingProviderScimOutputArgs {
    id?: pulumi.Input<string>;
    ids?: pulumi.Input<pulumi.Input<string>[]>;
    managed?: pulumi.Input<string>;
    managedLists?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
}

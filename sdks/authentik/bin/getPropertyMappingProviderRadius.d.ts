import * as pulumi from "@pulumi/pulumi";
export declare function getPropertyMappingProviderRadius(args?: GetPropertyMappingProviderRadiusArgs, opts?: pulumi.InvokeOptions): Promise<GetPropertyMappingProviderRadiusResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderRadius.
 */
export interface GetPropertyMappingProviderRadiusArgs {
    id?: string;
    ids?: string[];
    managed?: string;
    managedLists?: string[];
    name?: string;
}
/**
 * A collection of values returned by getPropertyMappingProviderRadius.
 */
export interface GetPropertyMappingProviderRadiusResult {
    readonly expression: string;
    readonly id: string;
    readonly ids: string[];
    readonly managed?: string;
    readonly managedLists?: string[];
    readonly name?: string;
}
export declare function getPropertyMappingProviderRadiusOutput(args?: GetPropertyMappingProviderRadiusOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPropertyMappingProviderRadiusResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderRadius.
 */
export interface GetPropertyMappingProviderRadiusOutputArgs {
    id?: pulumi.Input<string>;
    ids?: pulumi.Input<pulumi.Input<string>[]>;
    managed?: pulumi.Input<string>;
    managedLists?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
}

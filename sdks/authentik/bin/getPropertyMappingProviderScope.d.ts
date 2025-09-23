import * as pulumi from "@pulumi/pulumi";
export declare function getPropertyMappingProviderScope(args?: GetPropertyMappingProviderScopeArgs, opts?: pulumi.InvokeOptions): Promise<GetPropertyMappingProviderScopeResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderScope.
 */
export interface GetPropertyMappingProviderScopeArgs {
    id?: string;
    ids?: string[];
    managed?: string;
    managedLists?: string[];
    name?: string;
    scopeName?: string;
}
/**
 * A collection of values returned by getPropertyMappingProviderScope.
 */
export interface GetPropertyMappingProviderScopeResult {
    readonly description: string;
    readonly expression: string;
    readonly id: string;
    readonly ids: string[];
    readonly managed?: string;
    readonly managedLists?: string[];
    readonly name?: string;
    readonly scopeName: string;
}
export declare function getPropertyMappingProviderScopeOutput(args?: GetPropertyMappingProviderScopeOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPropertyMappingProviderScopeResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderScope.
 */
export interface GetPropertyMappingProviderScopeOutputArgs {
    id?: pulumi.Input<string>;
    ids?: pulumi.Input<pulumi.Input<string>[]>;
    managed?: pulumi.Input<string>;
    managedLists?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
    scopeName?: pulumi.Input<string>;
}

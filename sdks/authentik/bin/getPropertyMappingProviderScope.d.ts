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
    id?: pulumi.Input<string | undefined>;
    ids?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    managed?: pulumi.Input<string | undefined>;
    managedLists?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    name?: pulumi.Input<string | undefined>;
    scopeName?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getPropertyMappingProviderScope.d.ts.map
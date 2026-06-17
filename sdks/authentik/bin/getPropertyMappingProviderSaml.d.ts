import * as pulumi from "@pulumi/pulumi";
export declare function getPropertyMappingProviderSaml(args?: GetPropertyMappingProviderSamlArgs, opts?: pulumi.InvokeOptions): Promise<GetPropertyMappingProviderSamlResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderSaml.
 */
export interface GetPropertyMappingProviderSamlArgs {
    expression?: string;
    friendlyName?: string;
    id?: string;
    ids?: string[];
    managed?: string;
    managedLists?: string[];
    name?: string;
    samlName?: string;
}
/**
 * A collection of values returned by getPropertyMappingProviderSaml.
 */
export interface GetPropertyMappingProviderSamlResult {
    readonly expression: string;
    readonly friendlyName: string;
    readonly id: string;
    readonly ids: string[];
    readonly managed?: string;
    readonly managedLists?: string[];
    readonly name?: string;
    readonly samlName: string;
}
export declare function getPropertyMappingProviderSamlOutput(args?: GetPropertyMappingProviderSamlOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPropertyMappingProviderSamlResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderSaml.
 */
export interface GetPropertyMappingProviderSamlOutputArgs {
    expression?: pulumi.Input<string | undefined>;
    friendlyName?: pulumi.Input<string | undefined>;
    id?: pulumi.Input<string | undefined>;
    ids?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    managed?: pulumi.Input<string | undefined>;
    managedLists?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    name?: pulumi.Input<string | undefined>;
    samlName?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getPropertyMappingProviderSaml.d.ts.map
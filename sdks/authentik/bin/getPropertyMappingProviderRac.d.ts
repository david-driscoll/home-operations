import * as pulumi from "@pulumi/pulumi";
export declare function getPropertyMappingProviderRac(args?: GetPropertyMappingProviderRacArgs, opts?: pulumi.InvokeOptions): Promise<GetPropertyMappingProviderRacResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderRac.
 */
export interface GetPropertyMappingProviderRacArgs {
    id?: string;
    ids?: string[];
    managed?: string;
    managedLists?: string[];
    name?: string;
    settings?: string;
}
/**
 * A collection of values returned by getPropertyMappingProviderRac.
 */
export interface GetPropertyMappingProviderRacResult {
    readonly expression: string;
    readonly id: string;
    readonly ids: string[];
    readonly managed?: string;
    readonly managedLists?: string[];
    readonly name?: string;
    readonly settings: string;
}
export declare function getPropertyMappingProviderRacOutput(args?: GetPropertyMappingProviderRacOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPropertyMappingProviderRacResult>;
/**
 * A collection of arguments for invoking getPropertyMappingProviderRac.
 */
export interface GetPropertyMappingProviderRacOutputArgs {
    id?: pulumi.Input<string>;
    ids?: pulumi.Input<pulumi.Input<string>[]>;
    managed?: pulumi.Input<string>;
    managedLists?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
    settings?: pulumi.Input<string>;
}

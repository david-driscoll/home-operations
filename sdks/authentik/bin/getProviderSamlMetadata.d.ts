import * as pulumi from "@pulumi/pulumi";
export declare function getProviderSamlMetadata(args?: GetProviderSamlMetadataArgs, opts?: pulumi.InvokeOptions): Promise<GetProviderSamlMetadataResult>;
/**
 * A collection of arguments for invoking getProviderSamlMetadata.
 */
export interface GetProviderSamlMetadataArgs {
    id?: string;
    name?: string;
    providerId?: number;
}
/**
 * A collection of values returned by getProviderSamlMetadata.
 */
export interface GetProviderSamlMetadataResult {
    readonly id: string;
    readonly metadata: string;
    readonly name?: string;
    readonly providerId?: number;
}
export declare function getProviderSamlMetadataOutput(args?: GetProviderSamlMetadataOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetProviderSamlMetadataResult>;
/**
 * A collection of arguments for invoking getProviderSamlMetadata.
 */
export interface GetProviderSamlMetadataOutputArgs {
    id?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    providerId?: pulumi.Input<number>;
}

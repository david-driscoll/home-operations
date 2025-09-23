import * as pulumi from "@pulumi/pulumi";
export declare function getPropertyMappingSourceLdap(args?: GetPropertyMappingSourceLdapArgs, opts?: pulumi.InvokeOptions): Promise<GetPropertyMappingSourceLdapResult>;
/**
 * A collection of arguments for invoking getPropertyMappingSourceLdap.
 */
export interface GetPropertyMappingSourceLdapArgs {
    id?: string;
    ids?: string[];
    managed?: string;
    managedLists?: string[];
    name?: string;
}
/**
 * A collection of values returned by getPropertyMappingSourceLdap.
 */
export interface GetPropertyMappingSourceLdapResult {
    readonly expression: string;
    readonly id: string;
    readonly ids: string[];
    readonly managed?: string;
    readonly managedLists?: string[];
    readonly name?: string;
}
export declare function getPropertyMappingSourceLdapOutput(args?: GetPropertyMappingSourceLdapOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPropertyMappingSourceLdapResult>;
/**
 * A collection of arguments for invoking getPropertyMappingSourceLdap.
 */
export interface GetPropertyMappingSourceLdapOutputArgs {
    id?: pulumi.Input<string>;
    ids?: pulumi.Input<pulumi.Input<string>[]>;
    managed?: pulumi.Input<string>;
    managedLists?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
}

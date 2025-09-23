import * as pulumi from "@pulumi/pulumi";
export declare function getProviderOauth2Config(args?: GetProviderOauth2ConfigArgs, opts?: pulumi.InvokeOptions): Promise<GetProviderOauth2ConfigResult>;
/**
 * A collection of arguments for invoking getProviderOauth2Config.
 */
export interface GetProviderOauth2ConfigArgs {
    id?: string;
    name?: string;
    providerId?: number;
}
/**
 * A collection of values returned by getProviderOauth2Config.
 */
export interface GetProviderOauth2ConfigResult {
    readonly authorizeUrl: string;
    readonly id: string;
    readonly issuerUrl: string;
    readonly jwksUrl: string;
    readonly logoutUrl: string;
    readonly name?: string;
    readonly providerId?: number;
    readonly providerInfoUrl: string;
    readonly tokenUrl: string;
    readonly userInfoUrl: string;
}
export declare function getProviderOauth2ConfigOutput(args?: GetProviderOauth2ConfigOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetProviderOauth2ConfigResult>;
/**
 * A collection of arguments for invoking getProviderOauth2Config.
 */
export interface GetProviderOauth2ConfigOutputArgs {
    id?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    providerId?: pulumi.Input<number>;
}

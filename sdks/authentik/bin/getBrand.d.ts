import * as pulumi from "@pulumi/pulumi";
export declare function getBrand(args?: GetBrandArgs, opts?: pulumi.InvokeOptions): Promise<GetBrandResult>;
/**
 * A collection of arguments for invoking getBrand.
 */
export interface GetBrandArgs {
    brandingCustomCss?: string;
    brandingDefaultFlowBackground?: string;
    brandingFavicon?: string;
    brandingLogo?: string;
    brandingTitle?: string;
    clientCertificates?: string[];
    default?: boolean;
    defaultApplication?: string;
    domain?: string;
    flowAuthentication?: string;
    flowDeviceCode?: string;
    flowInvalidation?: string;
    flowRecovery?: string;
    flowUnenrollment?: string;
    flowUserSettings?: string;
    id?: string;
    webCertificate?: string;
}
/**
 * A collection of values returned by getBrand.
 */
export interface GetBrandResult {
    readonly brandingCustomCss: string;
    readonly brandingDefaultFlowBackground: string;
    readonly brandingFavicon: string;
    readonly brandingLogo: string;
    readonly brandingTitle: string;
    readonly clientCertificates?: string[];
    readonly default: boolean;
    readonly defaultApplication: string;
    readonly domain: string;
    readonly flowAuthentication: string;
    readonly flowDeviceCode: string;
    readonly flowInvalidation: string;
    readonly flowRecovery: string;
    readonly flowUnenrollment: string;
    readonly flowUserSettings: string;
    readonly id: string;
    readonly webCertificate: string;
}
export declare function getBrandOutput(args?: GetBrandOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetBrandResult>;
/**
 * A collection of arguments for invoking getBrand.
 */
export interface GetBrandOutputArgs {
    brandingCustomCss?: pulumi.Input<string>;
    brandingDefaultFlowBackground?: pulumi.Input<string>;
    brandingFavicon?: pulumi.Input<string>;
    brandingLogo?: pulumi.Input<string>;
    brandingTitle?: pulumi.Input<string>;
    clientCertificates?: pulumi.Input<pulumi.Input<string>[]>;
    default?: pulumi.Input<boolean>;
    defaultApplication?: pulumi.Input<string>;
    domain?: pulumi.Input<string>;
    flowAuthentication?: pulumi.Input<string>;
    flowDeviceCode?: pulumi.Input<string>;
    flowInvalidation?: pulumi.Input<string>;
    flowRecovery?: pulumi.Input<string>;
    flowUnenrollment?: pulumi.Input<string>;
    flowUserSettings?: pulumi.Input<string>;
    id?: pulumi.Input<string>;
    webCertificate?: pulumi.Input<string>;
}

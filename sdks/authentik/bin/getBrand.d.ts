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
    brandingCustomCss?: pulumi.Input<string | undefined>;
    brandingDefaultFlowBackground?: pulumi.Input<string | undefined>;
    brandingFavicon?: pulumi.Input<string | undefined>;
    brandingLogo?: pulumi.Input<string | undefined>;
    brandingTitle?: pulumi.Input<string | undefined>;
    clientCertificates?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    default?: pulumi.Input<boolean | undefined>;
    defaultApplication?: pulumi.Input<string | undefined>;
    domain?: pulumi.Input<string | undefined>;
    flowAuthentication?: pulumi.Input<string | undefined>;
    flowDeviceCode?: pulumi.Input<string | undefined>;
    flowInvalidation?: pulumi.Input<string | undefined>;
    flowRecovery?: pulumi.Input<string | undefined>;
    flowUnenrollment?: pulumi.Input<string | undefined>;
    flowUserSettings?: pulumi.Input<string | undefined>;
    id?: pulumi.Input<string | undefined>;
    webCertificate?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getBrand.d.ts.map
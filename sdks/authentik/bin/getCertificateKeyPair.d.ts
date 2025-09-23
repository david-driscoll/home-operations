import * as pulumi from "@pulumi/pulumi";
export declare function getCertificateKeyPair(args: GetCertificateKeyPairArgs, opts?: pulumi.InvokeOptions): Promise<GetCertificateKeyPairResult>;
/**
 * A collection of arguments for invoking getCertificateKeyPair.
 */
export interface GetCertificateKeyPairArgs {
    fetchCertificate?: boolean;
    fetchKey?: boolean;
    keyData?: string;
    name: string;
}
/**
 * A collection of values returned by getCertificateKeyPair.
 */
export interface GetCertificateKeyPairResult {
    readonly certificateData: string;
    readonly expiry: string;
    readonly fetchCertificate?: boolean;
    readonly fetchKey?: boolean;
    readonly fingerprint1: string;
    readonly fingerprint256: string;
    readonly id: string;
    readonly keyData: string;
    readonly name: string;
    readonly subject: string;
}
export declare function getCertificateKeyPairOutput(args: GetCertificateKeyPairOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetCertificateKeyPairResult>;
/**
 * A collection of arguments for invoking getCertificateKeyPair.
 */
export interface GetCertificateKeyPairOutputArgs {
    fetchCertificate?: pulumi.Input<boolean>;
    fetchKey?: pulumi.Input<boolean>;
    keyData?: pulumi.Input<string>;
    name: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class S3Endpoint extends pulumi.CustomResource {
    /**
     * Get an existing S3Endpoint resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: S3EndpointState, opts?: pulumi.CustomResourceOptions): S3Endpoint;
    /**
     * Returns true if the given object is an instance of S3Endpoint.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is S3Endpoint;
    /**
     * Access key for S3 object store.
     */
    readonly accessKey: pulumi.Output<string>;
    /**
     * Endpoint to access S3 object store.
     */
    readonly endpoint: pulumi.Output<string>;
    /**
     * X509 certificate fingerprint (sha256).
     */
    readonly fingerprint: pulumi.Output<string | undefined>;
    /**
     * Use path style bucket addressing over vhost style.
     */
    readonly pathStyle: pulumi.Output<boolean | undefined>;
    /**
     * Port to access S3 object store.
     */
    readonly port: pulumi.Output<number | undefined>;
    /**
     * S3 provider-specific quirks. Use `['skip-if-none-match-header']` for Backblaze B2 compatibility to handle unsupported S3 headers.
     */
    readonly providerQuirks: pulumi.Output<string[] | undefined>;
    /**
     * Region to access S3 object store (3-32 chars, lowercase alphanumeric with dashes/underscores).
     */
    readonly region: pulumi.Output<string | undefined>;
    /**
     * ID to uniquely identify S3 client config (3-32 chars, alphanumeric with dots, dashes, underscores).
     */
    readonly s3EndpointId: pulumi.Output<string>;
    /**
     * S3 secret key.
     */
    readonly secretKey: pulumi.Output<string>;
    /**
     * Create a S3Endpoint resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: S3EndpointArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering S3Endpoint resources.
 */
export interface S3EndpointState {
    /**
     * Access key for S3 object store.
     */
    accessKey?: pulumi.Input<string>;
    /**
     * Endpoint to access S3 object store.
     */
    endpoint?: pulumi.Input<string>;
    /**
     * X509 certificate fingerprint (sha256).
     */
    fingerprint?: pulumi.Input<string>;
    /**
     * Use path style bucket addressing over vhost style.
     */
    pathStyle?: pulumi.Input<boolean>;
    /**
     * Port to access S3 object store.
     */
    port?: pulumi.Input<number>;
    /**
     * S3 provider-specific quirks. Use `['skip-if-none-match-header']` for Backblaze B2 compatibility to handle unsupported S3 headers.
     */
    providerQuirks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Region to access S3 object store (3-32 chars, lowercase alphanumeric with dashes/underscores).
     */
    region?: pulumi.Input<string>;
    /**
     * ID to uniquely identify S3 client config (3-32 chars, alphanumeric with dots, dashes, underscores).
     */
    s3EndpointId?: pulumi.Input<string>;
    /**
     * S3 secret key.
     */
    secretKey?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a S3Endpoint resource.
 */
export interface S3EndpointArgs {
    /**
     * Access key for S3 object store.
     */
    accessKey: pulumi.Input<string>;
    /**
     * Endpoint to access S3 object store.
     */
    endpoint: pulumi.Input<string>;
    /**
     * X509 certificate fingerprint (sha256).
     */
    fingerprint?: pulumi.Input<string>;
    /**
     * Use path style bucket addressing over vhost style.
     */
    pathStyle?: pulumi.Input<boolean>;
    /**
     * Port to access S3 object store.
     */
    port?: pulumi.Input<number>;
    /**
     * S3 provider-specific quirks. Use `['skip-if-none-match-header']` for Backblaze B2 compatibility to handle unsupported S3 headers.
     */
    providerQuirks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Region to access S3 object store (3-32 chars, lowercase alphanumeric with dashes/underscores).
     */
    region?: pulumi.Input<string>;
    /**
     * ID to uniquely identify S3 client config (3-32 chars, alphanumeric with dots, dashes, underscores).
     */
    s3EndpointId: pulumi.Input<string>;
    /**
     * S3 secret key.
     */
    secretKey: pulumi.Input<string>;
}

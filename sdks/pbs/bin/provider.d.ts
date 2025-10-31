import * as pulumi from "@pulumi/pulumi";
/**
 * The provider type for the pbs package. By default, resources use package-wide configuration
 * settings, however an explicit `Provider` instance may be created and passed during resource
 * construction to achieve fine-grained programmatic control over provider settings. See the
 * [documentation](https://www.pulumi.com/docs/reference/programming-model/#providers) for more information.
 */
export declare class Provider extends pulumi.ProviderResource {
    /**
     * Returns true if the given object is an instance of Provider.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Provider;
    /**
     * The API token for authentication (format: user@realm:token_name=token_value)
     */
    readonly apiToken: pulumi.Output<string | undefined>;
    /**
     * The endpoint URL for the Proxmox Backup Server API (e.g., https://pbs.example.com:8007)
     */
    readonly endpoint: pulumi.Output<string | undefined>;
    /**
     * The password for authentication (used with username)
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * The username for authentication (alternative to API token)
     */
    readonly username: pulumi.Output<string | undefined>;
    /**
     * Create a Provider resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: ProviderArgs, opts?: pulumi.ResourceOptions);
    /**
     * This function returns a Terraform config object with terraform-namecased keys,to be used with the Terraform Module Provider.
     */
    terraformConfig(): pulumi.Output<{
        [key: string]: any;
    }>;
}
/**
 * The set of arguments for constructing a Provider resource.
 */
export interface ProviderArgs {
    /**
     * The API token for authentication (format: user@realm:token_name=token_value)
     */
    apiToken?: pulumi.Input<string>;
    /**
     * The endpoint URL for the Proxmox Backup Server API (e.g., https://pbs.example.com:8007)
     */
    endpoint?: pulumi.Input<string>;
    /**
     * Whether to skip the TLS verification step. Defaults to false.
     */
    insecure?: pulumi.Input<boolean>;
    /**
     * The password for authentication (used with username)
     */
    password?: pulumi.Input<string>;
    /**
     * Timeout for API requests in seconds. Defaults to 30.
     */
    timeout?: pulumi.Input<number>;
    /**
     * The username for authentication (alternative to API token)
     */
    username?: pulumi.Input<string>;
}
export declare namespace Provider {
    /**
     * The results of the Provider.terraformConfig method.
     */
    interface TerraformConfigResult {
        readonly result: {
            [key: string]: any;
        };
    }
}

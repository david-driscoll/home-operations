import * as pulumi from "@pulumi/pulumi";
/**
 * The provider type for the authentik package. By default, resources use package-wide configuration
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
     * The authentik API token, can optionally be passed as `AUTHENTIK_TOKEN` environmental variable
     */
    readonly token: pulumi.Output<string | undefined>;
    /**
     * The authentik API endpoint, can optionally be passed as `AUTHENTIK_URL` environmental variable
     */
    readonly url: pulumi.Output<string | undefined>;
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
     * Optional HTTP headers sent with every request
     */
    headers?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>;
    /**
     * Whether to skip TLS verification, can optionally be passed as `AUTHENTIK_INSECURE` environmental variable
     */
    insecure?: pulumi.Input<boolean>;
    /**
     * The authentik API token, can optionally be passed as `AUTHENTIK_TOKEN` environmental variable
     */
    token?: pulumi.Input<string>;
    /**
     * The authentik API endpoint, can optionally be passed as `AUTHENTIK_URL` environmental variable
     */
    url?: pulumi.Input<string>;
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

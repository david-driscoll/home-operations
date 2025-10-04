import * as pulumi from "@pulumi/pulumi";
/**
 * The provider type for the adguard package. By default, resources use package-wide configuration
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
     * The hostname of the AdGuard Home instance. Include the port if not on a standard HTTP/HTTPS port
     */
    readonly host: pulumi.Output<string | undefined>;
    /**
     * The password of the AdGuard Home instance
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * The HTTP scheme of the AdGuard Home instance. Can be either `http` or `https` (default)
     */
    readonly scheme: pulumi.Output<string | undefined>;
    /**
     * The username of the AdGuard Home instance
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
     * The hostname of the AdGuard Home instance. Include the port if not on a standard HTTP/HTTPS port
     */
    host?: pulumi.Input<string>;
    /**
     * When `true`, will disable any TLS certificate checks. Defaults to `false`
     */
    insecure?: pulumi.Input<boolean>;
    /**
     * The password of the AdGuard Home instance
     */
    password?: pulumi.Input<string>;
    /**
     * The HTTP scheme of the AdGuard Home instance. Can be either `http` or `https` (default)
     */
    scheme?: pulumi.Input<string>;
    /**
     * The timeout (in seconds) for making requests to AdGuard Home. Defaults to **10**
     */
    timeout?: pulumi.Input<number>;
    /**
     * The username of the AdGuard Home instance
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

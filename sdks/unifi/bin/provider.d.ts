import * as pulumi from "@pulumi/pulumi";
/**
 * The provider type for the unifi package. By default, resources use package-wide configuration
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
     * API Key for the user accessing the API. Can be specified with the `UNIFI_API_KEY` environment variable. Controller version 9.0.108 or later is required.
     */
    readonly apiKey: pulumi.Output<string | undefined>;
    /**
     * URL of the controller API. Can be specified with the `UNIFI_API` environment variable. You should **NOT** supply the path (`/api`), the SDK will discover the appropriate paths. This is to support UDM Pro style API paths as well as more standard controller paths.
     */
    readonly apiUrl: pulumi.Output<string | undefined>;
    /**
     * Password for the user accessing the API. Can be specified with the `UNIFI_PASSWORD` environment variable.
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * The site in the Unifi controller this provider will manage. Can be specified with the `UNIFI_SITE` environment variable. Default: `default`
     */
    readonly site: pulumi.Output<string | undefined>;
    /**
     * Local user name for the Unifi controller API. Can be specified with the `UNIFI_USERNAME` environment variable.
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
     * Skip verification of TLS certificates of API requests. You may need to set this to `true` if you are using your local API without setting up a signed certificate. Can be specified with the `UNIFI_INSECURE` environment variable.
     */
    allowInsecure?: pulumi.Input<boolean>;
    /**
     * API Key for the user accessing the API. Can be specified with the `UNIFI_API_KEY` environment variable. Controller version 9.0.108 or later is required.
     */
    apiKey?: pulumi.Input<string>;
    /**
     * URL of the controller API. Can be specified with the `UNIFI_API` environment variable. You should **NOT** supply the path (`/api`), the SDK will discover the appropriate paths. This is to support UDM Pro style API paths as well as more standard controller paths.
     */
    apiUrl?: pulumi.Input<string>;
    /**
     * Password for the user accessing the API. Can be specified with the `UNIFI_PASSWORD` environment variable.
     */
    password?: pulumi.Input<string>;
    /**
     * The site in the Unifi controller this provider will manage. Can be specified with the `UNIFI_SITE` environment variable. Default: `default`
     */
    site?: pulumi.Input<string>;
    /**
     * Local user name for the Unifi controller API. Can be specified with the `UNIFI_USERNAME` environment variable.
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

import * as pulumi from "@pulumi/pulumi";
/**
 * The provider type for the proxmox package. By default, resources use package-wide configuration
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
     * API TokenID e.g. root@pam!mytesttoken
     */
    readonly pmApiTokenId: pulumi.Output<string | undefined>;
    /**
     * The secret uuid corresponding to a TokenID
     */
    readonly pmApiTokenSecret: pulumi.Output<string | undefined>;
    /**
     * https://host.fqdn:8006/api2/json
     */
    readonly pmApiUrl: pulumi.Output<string | undefined>;
    /**
     * Set custom http headers e.g. Key,Value,Key1,Value1
     */
    readonly pmHttpHeaders: pulumi.Output<string | undefined>;
    /**
     * Write logs to this specific file
     */
    readonly pmLogFile: pulumi.Output<string | undefined>;
    /**
     * OTP 2FA code (if required)
     */
    readonly pmOtp: pulumi.Output<string | undefined>;
    /**
     * Password to authenticate into proxmox
     */
    readonly pmPassword: pulumi.Output<string | undefined>;
    /**
     * Proxy Server passed to Api client(useful for debugging). Syntax: http://proxy:port
     */
    readonly pmProxyServer: pulumi.Output<string | undefined>;
    /**
     * Username e.g. myuser or myuser@pam
     */
    readonly pmUser: pulumi.Output<string | undefined>;
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
     * API TokenID e.g. root@pam!mytesttoken
     */
    pmApiTokenId?: pulumi.Input<string>;
    /**
     * The secret uuid corresponding to a TokenID
     */
    pmApiTokenSecret?: pulumi.Input<string>;
    /**
     * https://host.fqdn:8006/api2/json
     */
    pmApiUrl?: pulumi.Input<string>;
    /**
     * By default this provider will exit if an unknown attribute is found. This is to prevent the accidential destruction of VMs or Data when something in the proxmox API has changed/updated and is not confirmed to work with this provider. Set this to true at your own risk. It may allow you to proceed in cases when the provider refuses to work, but be aware of the danger in doing so.
     */
    pmDangerouslyIgnoreUnknownAttributes?: pulumi.Input<boolean>;
    /**
     * Enable or disable the verbose debug output from proxmox api
     */
    pmDebug?: pulumi.Input<boolean>;
    /**
     * Set custom http headers e.g. Key,Value,Key1,Value1
     */
    pmHttpHeaders?: pulumi.Input<string>;
    /**
     * Enable provider logging to get proxmox API logs
     */
    pmLogEnable?: pulumi.Input<boolean>;
    /**
     * Write logs to this specific file
     */
    pmLogFile?: pulumi.Input<string>;
    /**
     * Configure the logging level to display; trace, debug, info, warn, etc
     */
    pmLogLevels?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>;
    /**
     * OTP 2FA code (if required)
     */
    pmOtp?: pulumi.Input<string>;
    pmParallel?: pulumi.Input<number>;
    /**
     * Password to authenticate into proxmox
     */
    pmPassword?: pulumi.Input<string>;
    /**
     * Proxy Server passed to Api client(useful for debugging). Syntax: http://proxy:port
     */
    pmProxyServer?: pulumi.Input<string>;
    /**
     * How many seconds to wait for operations for both provider and api-client, default is 20m
     */
    pmTimeout?: pulumi.Input<number>;
    pmTlsInsecure?: pulumi.Input<boolean>;
    /**
     * Username e.g. myuser or myuser@pam
     */
    pmUser?: pulumi.Input<string>;
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

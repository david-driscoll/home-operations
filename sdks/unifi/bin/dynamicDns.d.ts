import * as pulumi from "@pulumi/pulumi";
export declare class DynamicDns extends pulumi.CustomResource {
    /**
     * Get an existing DynamicDns resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: DynamicDnsState, opts?: pulumi.CustomResourceOptions): DynamicDns;
    /**
     * Returns true if the given object is an instance of DynamicDns.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is DynamicDns;
    /**
     * The fully qualified domain name to update with your current public IP address (e.g., 'myhouse.dyndns.org' or 'myoffice.no-ip.com').
     */
    readonly hostName: pulumi.Output<string>;
    /**
     * The WAN interface to use for the dynamic DNS updates. Valid values are:
     *   * `wan` - Primary WAN interface (default)
     *   * `wan2` - Secondary WAN interface Defaults to `wan`.
     */
    readonly interface: pulumi.Output<string | undefined>;
    /**
     * The username or login for your DDNS provider account.
     */
    readonly login: pulumi.Output<string | undefined>;
    /**
     * The password or token for your DDNS provider account. This value will be stored securely and not displayed in logs.
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * The update server hostname for your DDNS provider. Usually not required as the UniFi controller knows the correct servers for common providers.
     */
    readonly server: pulumi.Output<string | undefined>;
    /**
     * The Dynamic DNS service provider. Common values include:
     *   * `dyndns` - DynDNS service
     *   * `noip` - No-IP service
     *   * `duckdns` - Duck DNS service
     * Check your UniFi controller for the complete list of supported providers.
     */
    readonly service: pulumi.Output<string>;
    /**
     * The name of the UniFi site where the dynamic DNS configuration should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a DynamicDns resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: DynamicDnsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering DynamicDns resources.
 */
export interface DynamicDnsState {
    /**
     * The fully qualified domain name to update with your current public IP address (e.g., 'myhouse.dyndns.org' or 'myoffice.no-ip.com').
     */
    hostName?: pulumi.Input<string>;
    /**
     * The WAN interface to use for the dynamic DNS updates. Valid values are:
     *   * `wan` - Primary WAN interface (default)
     *   * `wan2` - Secondary WAN interface Defaults to `wan`.
     */
    interface?: pulumi.Input<string>;
    /**
     * The username or login for your DDNS provider account.
     */
    login?: pulumi.Input<string>;
    /**
     * The password or token for your DDNS provider account. This value will be stored securely and not displayed in logs.
     */
    password?: pulumi.Input<string>;
    /**
     * The update server hostname for your DDNS provider. Usually not required as the UniFi controller knows the correct servers for common providers.
     */
    server?: pulumi.Input<string>;
    /**
     * The Dynamic DNS service provider. Common values include:
     *   * `dyndns` - DynDNS service
     *   * `noip` - No-IP service
     *   * `duckdns` - Duck DNS service
     * Check your UniFi controller for the complete list of supported providers.
     */
    service?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the dynamic DNS configuration should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a DynamicDns resource.
 */
export interface DynamicDnsArgs {
    /**
     * The fully qualified domain name to update with your current public IP address (e.g., 'myhouse.dyndns.org' or 'myoffice.no-ip.com').
     */
    hostName: pulumi.Input<string>;
    /**
     * The WAN interface to use for the dynamic DNS updates. Valid values are:
     *   * `wan` - Primary WAN interface (default)
     *   * `wan2` - Secondary WAN interface Defaults to `wan`.
     */
    interface?: pulumi.Input<string>;
    /**
     * The username or login for your DDNS provider account.
     */
    login?: pulumi.Input<string>;
    /**
     * The password or token for your DDNS provider account. This value will be stored securely and not displayed in logs.
     */
    password?: pulumi.Input<string>;
    /**
     * The update server hostname for your DDNS provider. Usually not required as the UniFi controller knows the correct servers for common providers.
     */
    server?: pulumi.Input<string>;
    /**
     * The Dynamic DNS service provider. Common values include:
     *   * `dyndns` - DynDNS service
     *   * `noip` - No-IP service
     *   * `duckdns` - Duck DNS service
     * Check your UniFi controller for the complete list of supported providers.
     */
    service: pulumi.Input<string>;
    /**
     * The name of the UniFi site where the dynamic DNS configuration should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}

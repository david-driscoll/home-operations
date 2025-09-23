import * as pulumi from "@pulumi/pulumi";
export declare class SettingNtp extends pulumi.CustomResource {
    /**
     * Get an existing SettingNtp resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingNtpState, opts?: pulumi.CustomResourceOptions): SettingNtp;
    /**
     * Returns true if the given object is an instance of SettingNtp.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingNtp;
    /**
     * NTP server configuration mode. Valid values are:
     * * `auto` - Use NTP servers configured on the controller
     * * `manual` - Use custom NTP servers specified in this resource
     *
     * When set to `auto`, all NTP server fields will be cleared. When set to `manual`, at least one NTP server must be specified.
     */
    readonly mode: pulumi.Output<string>;
    /**
     * Primary NTP server hostname or IP address. Must be a valid hostname (e.g., `pool.ntp.org`) or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    readonly ntpServer1: pulumi.Output<string>;
    /**
     * Secondary NTP server hostname or IP address. Must be a valid hostname (e.g., `time.google.com`) or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    readonly ntpServer2: pulumi.Output<string>;
    /**
     * Tertiary NTP server hostname or IP address. Must be a valid hostname or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    readonly ntpServer3: pulumi.Output<string>;
    /**
     * Quaternary NTP server hostname or IP address. Must be a valid hostname or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    readonly ntpServer4: pulumi.Output<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a SettingNtp resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingNtpArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingNtp resources.
 */
export interface SettingNtpState {
    /**
     * NTP server configuration mode. Valid values are:
     * * `auto` - Use NTP servers configured on the controller
     * * `manual` - Use custom NTP servers specified in this resource
     *
     * When set to `auto`, all NTP server fields will be cleared. When set to `manual`, at least one NTP server must be specified.
     */
    mode?: pulumi.Input<string>;
    /**
     * Primary NTP server hostname or IP address. Must be a valid hostname (e.g., `pool.ntp.org`) or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer1?: pulumi.Input<string>;
    /**
     * Secondary NTP server hostname or IP address. Must be a valid hostname (e.g., `time.google.com`) or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer2?: pulumi.Input<string>;
    /**
     * Tertiary NTP server hostname or IP address. Must be a valid hostname or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer3?: pulumi.Input<string>;
    /**
     * Quaternary NTP server hostname or IP address. Must be a valid hostname or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer4?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SettingNtp resource.
 */
export interface SettingNtpArgs {
    /**
     * NTP server configuration mode. Valid values are:
     * * `auto` - Use NTP servers configured on the controller
     * * `manual` - Use custom NTP servers specified in this resource
     *
     * When set to `auto`, all NTP server fields will be cleared. When set to `manual`, at least one NTP server must be specified.
     */
    mode?: pulumi.Input<string>;
    /**
     * Primary NTP server hostname or IP address. Must be a valid hostname (e.g., `pool.ntp.org`) or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer1?: pulumi.Input<string>;
    /**
     * Secondary NTP server hostname or IP address. Must be a valid hostname (e.g., `time.google.com`) or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer2?: pulumi.Input<string>;
    /**
     * Tertiary NTP server hostname or IP address. Must be a valid hostname or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer3?: pulumi.Input<string>;
    /**
     * Quaternary NTP server hostname or IP address. Must be a valid hostname or IPv4 address. Only applicable when `mode` is set to `manual`.
     */
    ntpServer4?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}

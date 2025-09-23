import * as pulumi from "@pulumi/pulumi";
export declare class SettingRsyslogd extends pulumi.CustomResource {
    /**
     * Get an existing SettingRsyslogd resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingRsyslogdState, opts?: pulumi.CustomResourceOptions): SettingRsyslogd;
    /**
     * Returns true if the given object is an instance of SettingRsyslogd.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingRsyslogd;
    /**
     * List of log types to include in the remote syslog. Valid values: device, client, firewall_default_policy, triggers, updates, admin_activity, critical, security_detections, vpn.
     */
    readonly contents: pulumi.Output<string[]>;
    /**
     * Whether debug logging is enabled.
     */
    readonly debug: pulumi.Output<boolean>;
    /**
     * Whether remote syslog is enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * IP address of the remote syslog server.
     */
    readonly ip: pulumi.Output<string>;
    /**
     * Whether to log all content types.
     */
    readonly logAllContents: pulumi.Output<boolean>;
    /**
     * Whether netconsole logging is enabled.
     */
    readonly netconsoleEnabled: pulumi.Output<boolean>;
    /**
     * Hostname or IP address of the netconsole server.
     */
    readonly netconsoleHost: pulumi.Output<string>;
    /**
     * Port number for the netconsole server. Valid values: 1-65535.
     */
    readonly netconsolePort: pulumi.Output<number>;
    /**
     * Port number for the remote syslog server. Valid values: 1-65535.
     */
    readonly port: pulumi.Output<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Whether to use this controller as the syslog server.
     */
    readonly thisController: pulumi.Output<boolean>;
    /**
     * Whether to only use encrypted connections to this controller for syslog.
     */
    readonly thisControllerEncryptedOnly: pulumi.Output<boolean>;
    /**
     * Create a SettingRsyslogd resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SettingRsyslogdArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingRsyslogd resources.
 */
export interface SettingRsyslogdState {
    /**
     * List of log types to include in the remote syslog. Valid values: device, client, firewall_default_policy, triggers, updates, admin_activity, critical, security_detections, vpn.
     */
    contents?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether debug logging is enabled.
     */
    debug?: pulumi.Input<boolean>;
    /**
     * Whether remote syslog is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * IP address of the remote syslog server.
     */
    ip?: pulumi.Input<string>;
    /**
     * Whether to log all content types.
     */
    logAllContents?: pulumi.Input<boolean>;
    /**
     * Whether netconsole logging is enabled.
     */
    netconsoleEnabled?: pulumi.Input<boolean>;
    /**
     * Hostname or IP address of the netconsole server.
     */
    netconsoleHost?: pulumi.Input<string>;
    /**
     * Port number for the netconsole server. Valid values: 1-65535.
     */
    netconsolePort?: pulumi.Input<number>;
    /**
     * Port number for the remote syslog server. Valid values: 1-65535.
     */
    port?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Whether to use this controller as the syslog server.
     */
    thisController?: pulumi.Input<boolean>;
    /**
     * Whether to only use encrypted connections to this controller for syslog.
     */
    thisControllerEncryptedOnly?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingRsyslogd resource.
 */
export interface SettingRsyslogdArgs {
    /**
     * List of log types to include in the remote syslog. Valid values: device, client, firewall_default_policy, triggers, updates, admin_activity, critical, security_detections, vpn.
     */
    contents?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether debug logging is enabled.
     */
    debug?: pulumi.Input<boolean>;
    /**
     * Whether remote syslog is enabled.
     */
    enabled: pulumi.Input<boolean>;
    /**
     * IP address of the remote syslog server.
     */
    ip?: pulumi.Input<string>;
    /**
     * Whether to log all content types.
     */
    logAllContents?: pulumi.Input<boolean>;
    /**
     * Whether netconsole logging is enabled.
     */
    netconsoleEnabled?: pulumi.Input<boolean>;
    /**
     * Hostname or IP address of the netconsole server.
     */
    netconsoleHost?: pulumi.Input<string>;
    /**
     * Port number for the netconsole server. Valid values: 1-65535.
     */
    netconsolePort?: pulumi.Input<number>;
    /**
     * Port number for the remote syslog server. Valid values: 1-65535.
     */
    port?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Whether to use this controller as the syslog server.
     */
    thisController?: pulumi.Input<boolean>;
    /**
     * Whether to only use encrypted connections to this controller for syslog.
     */
    thisControllerEncryptedOnly?: pulumi.Input<boolean>;
}

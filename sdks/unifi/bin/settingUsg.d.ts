import * as pulumi from "@pulumi/pulumi";
export declare class SettingUsg extends pulumi.CustomResource {
    /**
     * Get an existing SettingUsg resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingUsgState, opts?: pulumi.CustomResourceOptions): SettingUsg;
    /**
     * Returns true if the given object is an instance of SettingUsg.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingUsg;
    /**
     * The DHCP relay servers.
     */
    readonly dhcpRelayServers: pulumi.Output<string[]>;
    /**
     * Whether the guest firewall log is enabled.
     */
    readonly firewallGuestDefaultLog: pulumi.Output<boolean>;
    /**
     * Whether the LAN firewall log is enabled.
     */
    readonly firewallLanDefaultLog: pulumi.Output<boolean>;
    /**
     * Whether the WAN firewall log is enabled.
     */
    readonly firewallWanDefaultLog: pulumi.Output<boolean>;
    /**
     * Whether multicast DNS is enabled.
     */
    readonly multicastDnsEnabled: pulumi.Output<boolean>;
    /**
     * The name of the site to associate the settings with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a SettingUsg resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingUsgArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingUsg resources.
 */
export interface SettingUsgState {
    /**
     * The DHCP relay servers.
     */
    dhcpRelayServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether the guest firewall log is enabled.
     */
    firewallGuestDefaultLog?: pulumi.Input<boolean>;
    /**
     * Whether the LAN firewall log is enabled.
     */
    firewallLanDefaultLog?: pulumi.Input<boolean>;
    /**
     * Whether the WAN firewall log is enabled.
     */
    firewallWanDefaultLog?: pulumi.Input<boolean>;
    /**
     * Whether multicast DNS is enabled.
     */
    multicastDnsEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the site to associate the settings with.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SettingUsg resource.
 */
export interface SettingUsgArgs {
    /**
     * The DHCP relay servers.
     */
    dhcpRelayServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether the guest firewall log is enabled.
     */
    firewallGuestDefaultLog?: pulumi.Input<boolean>;
    /**
     * Whether the LAN firewall log is enabled.
     */
    firewallLanDefaultLog?: pulumi.Input<boolean>;
    /**
     * Whether the WAN firewall log is enabled.
     */
    firewallWanDefaultLog?: pulumi.Input<boolean>;
    /**
     * Whether multicast DNS is enabled.
     */
    multicastDnsEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the site to associate the settings with.
     */
    site?: pulumi.Input<string>;
}

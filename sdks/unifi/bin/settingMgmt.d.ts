import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class SettingMgmt extends pulumi.CustomResource {
    /**
     * Get an existing SettingMgmt resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingMgmtState, opts?: pulumi.CustomResourceOptions): SettingMgmt;
    /**
     * Returns true if the given object is an instance of SettingMgmt.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingMgmt;
    /**
     * Enable advanced features for UniFi devices at this site.
     */
    readonly advancedFeatureEnabled: pulumi.Output<boolean>;
    /**
     * Enable alerts for UniFi devices at this site.
     */
    readonly alertEnabled: pulumi.Output<boolean>;
    /**
     * Enable automatic firmware upgrades for all UniFi devices at this site. When enabled, devices will automatically update to the latest stable firmware version approved for your controller version.
     */
    readonly autoUpgrade: pulumi.Output<boolean>;
    /**
     * The hour of the day (0-23) when automatic firmware upgrades will occur.
     */
    readonly autoUpgradeHour: pulumi.Output<number>;
    /**
     * Enable the boot sound for UniFi devices at this site.
     */
    readonly bootSound: pulumi.Output<boolean>;
    /**
     * Enable debug tools for UniFi devices at this site. Requires controller version 7.3 or later.
     */
    readonly debugToolsEnabled: pulumi.Output<boolean>;
    /**
     * Enable direct connect for UniFi devices at this site.
     */
    readonly directConnectEnabled: pulumi.Output<boolean>;
    /**
     * Enable the LED light for UniFi devices at this site.
     */
    readonly ledEnabled: pulumi.Output<boolean>;
    /**
     * Enable outdoor mode for UniFi devices at this site.
     */
    readonly outdoorModeEnabled: pulumi.Output<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Enable SSH password authentication for UniFi devices at this site.
     */
    readonly sshAuthPasswordEnabled: pulumi.Output<boolean>;
    /**
     * Enable SSH bind wildcard for UniFi devices at this site.
     */
    readonly sshBindWildcard: pulumi.Output<boolean>;
    /**
     * Enable SSH access to UniFi devices at this site. When enabled, you can connect to devices using SSH for advanced configuration and troubleshooting. It's recommended to only enable this temporarily when needed.
     */
    readonly sshEnabled: pulumi.Output<boolean>;
    /**
     * List of SSH public keys that are allowed to connect to UniFi devices when SSH is enabled. Using SSH keys is more secure than password authentication.
     */
    readonly sshKeys: pulumi.Output<outputs.SettingMgmtSshKey[] | undefined>;
    /**
     * The SSH password for UniFi devices at this site.
     */
    readonly sshPassword: pulumi.Output<string>;
    /**
     * The SSH username for UniFi devices at this site.
     */
    readonly sshUsername: pulumi.Output<string>;
    /**
     * Enable UniFi IDP for UniFi devices at this site.
     */
    readonly unifiIdpEnabled: pulumi.Output<boolean>;
    /**
     * Enable WiFiman for UniFi devices at this site.
     */
    readonly wifimanEnabled: pulumi.Output<boolean>;
    /**
     * Create a SettingMgmt resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingMgmtArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingMgmt resources.
 */
export interface SettingMgmtState {
    /**
     * Enable advanced features for UniFi devices at this site.
     */
    advancedFeatureEnabled?: pulumi.Input<boolean>;
    /**
     * Enable alerts for UniFi devices at this site.
     */
    alertEnabled?: pulumi.Input<boolean>;
    /**
     * Enable automatic firmware upgrades for all UniFi devices at this site. When enabled, devices will automatically update to the latest stable firmware version approved for your controller version.
     */
    autoUpgrade?: pulumi.Input<boolean>;
    /**
     * The hour of the day (0-23) when automatic firmware upgrades will occur.
     */
    autoUpgradeHour?: pulumi.Input<number>;
    /**
     * Enable the boot sound for UniFi devices at this site.
     */
    bootSound?: pulumi.Input<boolean>;
    /**
     * Enable debug tools for UniFi devices at this site. Requires controller version 7.3 or later.
     */
    debugToolsEnabled?: pulumi.Input<boolean>;
    /**
     * Enable direct connect for UniFi devices at this site.
     */
    directConnectEnabled?: pulumi.Input<boolean>;
    /**
     * Enable the LED light for UniFi devices at this site.
     */
    ledEnabled?: pulumi.Input<boolean>;
    /**
     * Enable outdoor mode for UniFi devices at this site.
     */
    outdoorModeEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable SSH password authentication for UniFi devices at this site.
     */
    sshAuthPasswordEnabled?: pulumi.Input<boolean>;
    /**
     * Enable SSH bind wildcard for UniFi devices at this site.
     */
    sshBindWildcard?: pulumi.Input<boolean>;
    /**
     * Enable SSH access to UniFi devices at this site. When enabled, you can connect to devices using SSH for advanced configuration and troubleshooting. It's recommended to only enable this temporarily when needed.
     */
    sshEnabled?: pulumi.Input<boolean>;
    /**
     * List of SSH public keys that are allowed to connect to UniFi devices when SSH is enabled. Using SSH keys is more secure than password authentication.
     */
    sshKeys?: pulumi.Input<pulumi.Input<inputs.SettingMgmtSshKey>[]>;
    /**
     * The SSH password for UniFi devices at this site.
     */
    sshPassword?: pulumi.Input<string>;
    /**
     * The SSH username for UniFi devices at this site.
     */
    sshUsername?: pulumi.Input<string>;
    /**
     * Enable UniFi IDP for UniFi devices at this site.
     */
    unifiIdpEnabled?: pulumi.Input<boolean>;
    /**
     * Enable WiFiman for UniFi devices at this site.
     */
    wifimanEnabled?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingMgmt resource.
 */
export interface SettingMgmtArgs {
    /**
     * Enable advanced features for UniFi devices at this site.
     */
    advancedFeatureEnabled?: pulumi.Input<boolean>;
    /**
     * Enable alerts for UniFi devices at this site.
     */
    alertEnabled?: pulumi.Input<boolean>;
    /**
     * Enable automatic firmware upgrades for all UniFi devices at this site. When enabled, devices will automatically update to the latest stable firmware version approved for your controller version.
     */
    autoUpgrade?: pulumi.Input<boolean>;
    /**
     * The hour of the day (0-23) when automatic firmware upgrades will occur.
     */
    autoUpgradeHour?: pulumi.Input<number>;
    /**
     * Enable the boot sound for UniFi devices at this site.
     */
    bootSound?: pulumi.Input<boolean>;
    /**
     * Enable debug tools for UniFi devices at this site. Requires controller version 7.3 or later.
     */
    debugToolsEnabled?: pulumi.Input<boolean>;
    /**
     * Enable direct connect for UniFi devices at this site.
     */
    directConnectEnabled?: pulumi.Input<boolean>;
    /**
     * Enable the LED light for UniFi devices at this site.
     */
    ledEnabled?: pulumi.Input<boolean>;
    /**
     * Enable outdoor mode for UniFi devices at this site.
     */
    outdoorModeEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable SSH password authentication for UniFi devices at this site.
     */
    sshAuthPasswordEnabled?: pulumi.Input<boolean>;
    /**
     * Enable SSH bind wildcard for UniFi devices at this site.
     */
    sshBindWildcard?: pulumi.Input<boolean>;
    /**
     * Enable SSH access to UniFi devices at this site. When enabled, you can connect to devices using SSH for advanced configuration and troubleshooting. It's recommended to only enable this temporarily when needed.
     */
    sshEnabled?: pulumi.Input<boolean>;
    /**
     * List of SSH public keys that are allowed to connect to UniFi devices when SSH is enabled. Using SSH keys is more secure than password authentication.
     */
    sshKeys?: pulumi.Input<pulumi.Input<inputs.SettingMgmtSshKey>[]>;
    /**
     * The SSH password for UniFi devices at this site.
     */
    sshPassword?: pulumi.Input<string>;
    /**
     * The SSH username for UniFi devices at this site.
     */
    sshUsername?: pulumi.Input<string>;
    /**
     * Enable UniFi IDP for UniFi devices at this site.
     */
    unifiIdpEnabled?: pulumi.Input<boolean>;
    /**
     * Enable WiFiman for UniFi devices at this site.
     */
    wifimanEnabled?: pulumi.Input<boolean>;
}

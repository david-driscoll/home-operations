import * as pulumi from "@pulumi/pulumi";
export declare class SettingLcdMonitor extends pulumi.CustomResource {
    /**
     * Get an existing SettingLcdMonitor resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingLcdMonitorState, opts?: pulumi.CustomResourceOptions): SettingLcdMonitor;
    /**
     * Returns true if the given object is an instance of SettingLcdMonitor.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingLcdMonitor;
    /**
     * The brightness level of the LCD display. Valid values are 1-100.
     */
    readonly brightness: pulumi.Output<number | undefined>;
    /**
     * Whether the LCD display is enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * The time in seconds after which the display turns off when idle. Valid values are 10-3600.
     */
    readonly idleTimeout: pulumi.Output<number | undefined>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Whether to synchronize display settings across multiple devices.
     */
    readonly sync: pulumi.Output<boolean | undefined>;
    /**
     * Whether touch interactions with the display are enabled.
     */
    readonly touchEvent: pulumi.Output<boolean | undefined>;
    /**
     * Create a SettingLcdMonitor resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SettingLcdMonitorArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingLcdMonitor resources.
 */
export interface SettingLcdMonitorState {
    /**
     * The brightness level of the LCD display. Valid values are 1-100.
     */
    brightness?: pulumi.Input<number>;
    /**
     * Whether the LCD display is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The time in seconds after which the display turns off when idle. Valid values are 10-3600.
     */
    idleTimeout?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Whether to synchronize display settings across multiple devices.
     */
    sync?: pulumi.Input<boolean>;
    /**
     * Whether touch interactions with the display are enabled.
     */
    touchEvent?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingLcdMonitor resource.
 */
export interface SettingLcdMonitorArgs {
    /**
     * The brightness level of the LCD display. Valid values are 1-100.
     */
    brightness?: pulumi.Input<number>;
    /**
     * Whether the LCD display is enabled.
     */
    enabled: pulumi.Input<boolean>;
    /**
     * The time in seconds after which the display turns off when idle. Valid values are 10-3600.
     */
    idleTimeout?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Whether to synchronize display settings across multiple devices.
     */
    sync?: pulumi.Input<boolean>;
    /**
     * Whether touch interactions with the display are enabled.
     */
    touchEvent?: pulumi.Input<boolean>;
}

import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class Device extends pulumi.CustomResource {
    /**
     * Get an existing Device resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: DeviceState, opts?: pulumi.CustomResourceOptions): Device;
    /**
     * Returns true if the given object is an instance of Device.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Device;
    /**
     * Whether the device is adopted.
     */
    readonly adopted: pulumi.Output<boolean>;
    /**
     * Specifies whether this resource should tell the controller to adopt the device on create.
     */
    readonly allowAdoption: pulumi.Output<boolean>;
    /**
     * Band steering mode; valid values are `off`, `equal`, and `prefer_5g`.
     */
    readonly bandsteeringMode: pulumi.Output<string>;
    /**
     * Network configuration for the device.
     */
    readonly configNetwork: pulumi.Output<outputs.DeviceConfigNetwork>;
    /**
     * Specifies whether this device should be disabled.
     */
    readonly disabled: pulumi.Output<boolean>;
    /**
     * Enable flow control.
     */
    readonly flowctrlEnabled: pulumi.Output<boolean>;
    /**
     * Specifies whether this resource should tell the controller to forget the device on destroy.
     */
    readonly forgetOnDestroy: pulumi.Output<boolean>;
    /**
     * Enable jumbo frames.
     */
    readonly jumboframeEnabled: pulumi.Output<boolean>;
    /**
     * LCM brightness (1-100).
     */
    readonly lcmBrightness: pulumi.Output<number>;
    /**
     * Override LCM brightness.
     */
    readonly lcmBrightnessOverride: pulumi.Output<boolean>;
    /**
     * LCM idle timeout in seconds (10-3600).
     */
    readonly lcmIdleTimeout: pulumi.Output<number>;
    /**
     * Override LCM idle timeout.
     */
    readonly lcmIdleTimeoutOverride: pulumi.Output<boolean>;
    /**
     * LCM night mode begin time (HH:MM format).
     */
    readonly lcmNightModeBegins: pulumi.Output<string>;
    /**
     * LCM night mode end time (HH:MM format).
     */
    readonly lcmNightModeEnds: pulumi.Output<string>;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    readonly ledOverride: pulumi.Output<string>;
    /**
     * LED color override (hex color code).
     */
    readonly ledOverrideColor: pulumi.Output<string>;
    /**
     * LED brightness (0-100).
     */
    readonly ledOverrideColorBrightness: pulumi.Output<number>;
    /**
     * Specifies whether the device is locked.
     */
    readonly locked: pulumi.Output<boolean>;
    /**
     * The MAC address of the device. This can be specified so that the provider can take control of a device (since devices are created through adoption).
     */
    readonly mac: pulumi.Output<string>;
    /**
     * Management network ID.
     */
    readonly mgmtNetworkId: pulumi.Output<string>;
    /**
     * Device model.
     */
    readonly model: pulumi.Output<string>;
    /**
     * The name of the device.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Outdoor mode override; valid values are `default`, `on`, and `off`.
     */
    readonly outdoorModeOverride: pulumi.Output<string>;
    /**
     * Enable outlet control.
     */
    readonly outletEnabled: pulumi.Output<boolean>;
    /**
     * Outlet configuration overrides.
     */
    readonly outletOverrides: pulumi.Output<outputs.DeviceOutletOverride[]>;
    /**
     * PoE mode; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    readonly poeMode: pulumi.Output<string>;
    /**
     * Settings overrides for specific switch ports.
     */
    readonly portOverrides: pulumi.Output<outputs.DevicePortOverride[] | undefined>;
    /**
     * Radio configuration table.
     */
    readonly radioTables: pulumi.Output<outputs.DeviceRadioTable[]>;
    /**
     * The name of the site to associate the device with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Device state.
     */
    readonly state: pulumi.Output<number>;
    /**
     * STP priority.
     */
    readonly stpPriority: pulumi.Output<string>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    readonly stpVersion: pulumi.Output<string>;
    /**
     * Enable VLAN support on the switch.
     */
    readonly switchVlanEnabled: pulumi.Output<boolean>;
    /**
     * Device type.
     */
    readonly type: pulumi.Output<string>;
    /**
     * Volume level (0-100).
     */
    readonly volume: pulumi.Output<number>;
    /**
     * Baresip password.
     */
    readonly xBaresipPassword: pulumi.Output<string>;
    /**
     * Create a Device resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: DeviceArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Device resources.
 */
export interface DeviceState {
    /**
     * Whether the device is adopted.
     */
    adopted?: pulumi.Input<boolean>;
    /**
     * Specifies whether this resource should tell the controller to adopt the device on create.
     */
    allowAdoption?: pulumi.Input<boolean>;
    /**
     * Band steering mode; valid values are `off`, `equal`, and `prefer_5g`.
     */
    bandsteeringMode?: pulumi.Input<string>;
    /**
     * Network configuration for the device.
     */
    configNetwork?: pulumi.Input<inputs.DeviceConfigNetwork>;
    /**
     * Specifies whether this device should be disabled.
     */
    disabled?: pulumi.Input<boolean>;
    /**
     * Enable flow control.
     */
    flowctrlEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether this resource should tell the controller to forget the device on destroy.
     */
    forgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * Enable jumbo frames.
     */
    jumboframeEnabled?: pulumi.Input<boolean>;
    /**
     * LCM brightness (1-100).
     */
    lcmBrightness?: pulumi.Input<number>;
    /**
     * Override LCM brightness.
     */
    lcmBrightnessOverride?: pulumi.Input<boolean>;
    /**
     * LCM idle timeout in seconds (10-3600).
     */
    lcmIdleTimeout?: pulumi.Input<number>;
    /**
     * Override LCM idle timeout.
     */
    lcmIdleTimeoutOverride?: pulumi.Input<boolean>;
    /**
     * LCM night mode begin time (HH:MM format).
     */
    lcmNightModeBegins?: pulumi.Input<string>;
    /**
     * LCM night mode end time (HH:MM format).
     */
    lcmNightModeEnds?: pulumi.Input<string>;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    ledOverride?: pulumi.Input<string>;
    /**
     * LED color override (hex color code).
     */
    ledOverrideColor?: pulumi.Input<string>;
    /**
     * LED brightness (0-100).
     */
    ledOverrideColorBrightness?: pulumi.Input<number>;
    /**
     * Specifies whether the device is locked.
     */
    locked?: pulumi.Input<boolean>;
    /**
     * The MAC address of the device. This can be specified so that the provider can take control of a device (since devices are created through adoption).
     */
    mac?: pulumi.Input<string>;
    /**
     * Management network ID.
     */
    mgmtNetworkId?: pulumi.Input<string>;
    /**
     * Device model.
     */
    model?: pulumi.Input<string>;
    /**
     * The name of the device.
     */
    name?: pulumi.Input<string>;
    /**
     * Outdoor mode override; valid values are `default`, `on`, and `off`.
     */
    outdoorModeOverride?: pulumi.Input<string>;
    /**
     * Enable outlet control.
     */
    outletEnabled?: pulumi.Input<boolean>;
    /**
     * Outlet configuration overrides.
     */
    outletOverrides?: pulumi.Input<pulumi.Input<inputs.DeviceOutletOverride>[]>;
    /**
     * PoE mode; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Settings overrides for specific switch ports.
     */
    portOverrides?: pulumi.Input<pulumi.Input<inputs.DevicePortOverride>[]>;
    /**
     * Radio configuration table.
     */
    radioTables?: pulumi.Input<pulumi.Input<inputs.DeviceRadioTable>[]>;
    /**
     * The name of the site to associate the device with.
     */
    site?: pulumi.Input<string>;
    /**
     * Device state.
     */
    state?: pulumi.Input<number>;
    /**
     * STP priority.
     */
    stpPriority?: pulumi.Input<string>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    stpVersion?: pulumi.Input<string>;
    /**
     * Enable VLAN support on the switch.
     */
    switchVlanEnabled?: pulumi.Input<boolean>;
    /**
     * Device type.
     */
    type?: pulumi.Input<string>;
    /**
     * Volume level (0-100).
     */
    volume?: pulumi.Input<number>;
    /**
     * Baresip password.
     */
    xBaresipPassword?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Device resource.
 */
export interface DeviceArgs {
    /**
     * Specifies whether this resource should tell the controller to adopt the device on create.
     */
    allowAdoption?: pulumi.Input<boolean>;
    /**
     * Band steering mode; valid values are `off`, `equal`, and `prefer_5g`.
     */
    bandsteeringMode?: pulumi.Input<string>;
    /**
     * Network configuration for the device.
     */
    configNetwork?: pulumi.Input<inputs.DeviceConfigNetwork>;
    /**
     * Specifies whether this device should be disabled.
     */
    disabled?: pulumi.Input<boolean>;
    /**
     * Enable flow control.
     */
    flowctrlEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether this resource should tell the controller to forget the device on destroy.
     */
    forgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * Enable jumbo frames.
     */
    jumboframeEnabled?: pulumi.Input<boolean>;
    /**
     * LCM brightness (1-100).
     */
    lcmBrightness?: pulumi.Input<number>;
    /**
     * Override LCM brightness.
     */
    lcmBrightnessOverride?: pulumi.Input<boolean>;
    /**
     * LCM idle timeout in seconds (10-3600).
     */
    lcmIdleTimeout?: pulumi.Input<number>;
    /**
     * Override LCM idle timeout.
     */
    lcmIdleTimeoutOverride?: pulumi.Input<boolean>;
    /**
     * LCM night mode begin time (HH:MM format).
     */
    lcmNightModeBegins?: pulumi.Input<string>;
    /**
     * LCM night mode end time (HH:MM format).
     */
    lcmNightModeEnds?: pulumi.Input<string>;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    ledOverride?: pulumi.Input<string>;
    /**
     * LED color override (hex color code).
     */
    ledOverrideColor?: pulumi.Input<string>;
    /**
     * LED brightness (0-100).
     */
    ledOverrideColorBrightness?: pulumi.Input<number>;
    /**
     * Specifies whether the device is locked.
     */
    locked?: pulumi.Input<boolean>;
    /**
     * The MAC address of the device. This can be specified so that the provider can take control of a device (since devices are created through adoption).
     */
    mac?: pulumi.Input<string>;
    /**
     * Management network ID.
     */
    mgmtNetworkId?: pulumi.Input<string>;
    /**
     * The name of the device.
     */
    name?: pulumi.Input<string>;
    /**
     * Outdoor mode override; valid values are `default`, `on`, and `off`.
     */
    outdoorModeOverride?: pulumi.Input<string>;
    /**
     * Enable outlet control.
     */
    outletEnabled?: pulumi.Input<boolean>;
    /**
     * Outlet configuration overrides.
     */
    outletOverrides?: pulumi.Input<pulumi.Input<inputs.DeviceOutletOverride>[]>;
    /**
     * PoE mode; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: pulumi.Input<string>;
    /**
     * Settings overrides for specific switch ports.
     */
    portOverrides?: pulumi.Input<pulumi.Input<inputs.DevicePortOverride>[]>;
    /**
     * Radio configuration table.
     */
    radioTables?: pulumi.Input<pulumi.Input<inputs.DeviceRadioTable>[]>;
    /**
     * The name of the site to associate the device with.
     */
    site?: pulumi.Input<string>;
    /**
     * STP priority.
     */
    stpPriority?: pulumi.Input<string>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    stpVersion?: pulumi.Input<string>;
    /**
     * Enable VLAN support on the switch.
     */
    switchVlanEnabled?: pulumi.Input<boolean>;
    /**
     * Volume level (0-100).
     */
    volume?: pulumi.Input<number>;
    /**
     * Baresip password.
     */
    xBaresipPassword?: pulumi.Input<string>;
}

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
     * LCM idle timeout, as a Go duration string (e.g. `10m`, `600s`).
     */
    readonly lcmIdleTimeout: pulumi.Output<string>;
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
     * Management network ID. The network this device uses for its own management traffic (the UI's Network Override). When set, the device tags its management onto this network's VLAN, so that VLAN must already be tagged on the device's upstream switch port(s) before this attribute is applied. Otherwise the device loses its management path, drops off, and the apply fails with an inconsistent-result error. Apply in two steps: tag the VLAN on the uplink (a port_override tagged_networkconf_ids entry) first, then set mgmt_network_id. Leave unset to manage on the uplink's native (untagged) network.
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
     * Per-port settings overrides, applied only to the ports you declare. Ports without a `port_override` block keep their existing controller-side configuration — the provider merges your declared ports (by `index`) into the device's current overrides rather than replacing the whole set. Removing a block stops managing that port but does not reset it; clear a port by overriding it back to the defaults instead.
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
    readonly stpPriority: pulumi.Output<number>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    readonly stpVersion: pulumi.Output<string>;
    /**
     * Enable VLAN support on the switch.
     */
    readonly switchVlanEnabled: pulumi.Output<boolean>;
    readonly timeouts: pulumi.Output<outputs.DeviceTimeouts | undefined>;
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
    adopted?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether this resource should tell the controller to adopt the device on create.
     */
    allowAdoption?: pulumi.Input<boolean | undefined>;
    /**
     * Band steering mode; valid values are `off`, `equal`, and `prefer_5g`.
     */
    bandsteeringMode?: pulumi.Input<string | undefined>;
    /**
     * Network configuration for the device.
     */
    configNetwork?: pulumi.Input<inputs.DeviceConfigNetwork | undefined>;
    /**
     * Specifies whether this device should be disabled.
     */
    disabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable flow control.
     */
    flowctrlEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether this resource should tell the controller to forget the device on destroy.
     */
    forgetOnDestroy?: pulumi.Input<boolean | undefined>;
    /**
     * Enable jumbo frames.
     */
    jumboframeEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * LCM brightness (1-100).
     */
    lcmBrightness?: pulumi.Input<number | undefined>;
    /**
     * Override LCM brightness.
     */
    lcmBrightnessOverride?: pulumi.Input<boolean | undefined>;
    /**
     * LCM idle timeout, as a Go duration string (e.g. `10m`, `600s`).
     */
    lcmIdleTimeout?: pulumi.Input<string | undefined>;
    /**
     * Override LCM idle timeout.
     */
    lcmIdleTimeoutOverride?: pulumi.Input<boolean | undefined>;
    /**
     * LCM night mode begin time (HH:MM format).
     */
    lcmNightModeBegins?: pulumi.Input<string | undefined>;
    /**
     * LCM night mode end time (HH:MM format).
     */
    lcmNightModeEnds?: pulumi.Input<string | undefined>;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    ledOverride?: pulumi.Input<string | undefined>;
    /**
     * LED color override (hex color code).
     */
    ledOverrideColor?: pulumi.Input<string | undefined>;
    /**
     * LED brightness (0-100).
     */
    ledOverrideColorBrightness?: pulumi.Input<number | undefined>;
    /**
     * Specifies whether the device is locked.
     */
    locked?: pulumi.Input<boolean | undefined>;
    /**
     * The MAC address of the device. This can be specified so that the provider can take control of a device (since devices are created through adoption).
     */
    mac?: pulumi.Input<string | undefined>;
    /**
     * Management network ID. The network this device uses for its own management traffic (the UI's Network Override). When set, the device tags its management onto this network's VLAN, so that VLAN must already be tagged on the device's upstream switch port(s) before this attribute is applied. Otherwise the device loses its management path, drops off, and the apply fails with an inconsistent-result error. Apply in two steps: tag the VLAN on the uplink (a port_override tagged_networkconf_ids entry) first, then set mgmt_network_id. Leave unset to manage on the uplink's native (untagged) network.
     */
    mgmtNetworkId?: pulumi.Input<string | undefined>;
    /**
     * Device model.
     */
    model?: pulumi.Input<string | undefined>;
    /**
     * The name of the device.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Outdoor mode override; valid values are `default`, `on`, and `off`.
     */
    outdoorModeOverride?: pulumi.Input<string | undefined>;
    /**
     * Enable outlet control.
     */
    outletEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Outlet configuration overrides.
     */
    outletOverrides?: pulumi.Input<pulumi.Input<inputs.DeviceOutletOverride>[] | undefined>;
    /**
     * PoE mode; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: pulumi.Input<string | undefined>;
    /**
     * Per-port settings overrides, applied only to the ports you declare. Ports without a `port_override` block keep their existing controller-side configuration — the provider merges your declared ports (by `index`) into the device's current overrides rather than replacing the whole set. Removing a block stops managing that port but does not reset it; clear a port by overriding it back to the defaults instead.
     */
    portOverrides?: pulumi.Input<pulumi.Input<inputs.DevicePortOverride>[] | undefined>;
    /**
     * Radio configuration table.
     */
    radioTables?: pulumi.Input<pulumi.Input<inputs.DeviceRadioTable>[] | undefined>;
    /**
     * The name of the site to associate the device with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * Device state.
     */
    state?: pulumi.Input<number | undefined>;
    /**
     * STP priority.
     */
    stpPriority?: pulumi.Input<number | undefined>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    stpVersion?: pulumi.Input<string | undefined>;
    /**
     * Enable VLAN support on the switch.
     */
    switchVlanEnabled?: pulumi.Input<boolean | undefined>;
    timeouts?: pulumi.Input<inputs.DeviceTimeouts | undefined>;
    /**
     * Device type.
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * Volume level (0-100).
     */
    volume?: pulumi.Input<number | undefined>;
    /**
     * Baresip password.
     */
    xBaresipPassword?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a Device resource.
 */
export interface DeviceArgs {
    /**
     * Specifies whether this resource should tell the controller to adopt the device on create.
     */
    allowAdoption?: pulumi.Input<boolean | undefined>;
    /**
     * Band steering mode; valid values are `off`, `equal`, and `prefer_5g`.
     */
    bandsteeringMode?: pulumi.Input<string | undefined>;
    /**
     * Network configuration for the device.
     */
    configNetwork?: pulumi.Input<inputs.DeviceConfigNetwork | undefined>;
    /**
     * Specifies whether this device should be disabled.
     */
    disabled?: pulumi.Input<boolean | undefined>;
    /**
     * Enable flow control.
     */
    flowctrlEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Specifies whether this resource should tell the controller to forget the device on destroy.
     */
    forgetOnDestroy?: pulumi.Input<boolean | undefined>;
    /**
     * Enable jumbo frames.
     */
    jumboframeEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * LCM brightness (1-100).
     */
    lcmBrightness?: pulumi.Input<number | undefined>;
    /**
     * Override LCM brightness.
     */
    lcmBrightnessOverride?: pulumi.Input<boolean | undefined>;
    /**
     * LCM idle timeout, as a Go duration string (e.g. `10m`, `600s`).
     */
    lcmIdleTimeout?: pulumi.Input<string | undefined>;
    /**
     * Override LCM idle timeout.
     */
    lcmIdleTimeoutOverride?: pulumi.Input<boolean | undefined>;
    /**
     * LCM night mode begin time (HH:MM format).
     */
    lcmNightModeBegins?: pulumi.Input<string | undefined>;
    /**
     * LCM night mode end time (HH:MM format).
     */
    lcmNightModeEnds?: pulumi.Input<string | undefined>;
    /**
     * LED override setting; valid values are `default`, `on`, and `off`.
     */
    ledOverride?: pulumi.Input<string | undefined>;
    /**
     * LED color override (hex color code).
     */
    ledOverrideColor?: pulumi.Input<string | undefined>;
    /**
     * LED brightness (0-100).
     */
    ledOverrideColorBrightness?: pulumi.Input<number | undefined>;
    /**
     * Specifies whether the device is locked.
     */
    locked?: pulumi.Input<boolean | undefined>;
    /**
     * The MAC address of the device. This can be specified so that the provider can take control of a device (since devices are created through adoption).
     */
    mac?: pulumi.Input<string | undefined>;
    /**
     * Management network ID. The network this device uses for its own management traffic (the UI's Network Override). When set, the device tags its management onto this network's VLAN, so that VLAN must already be tagged on the device's upstream switch port(s) before this attribute is applied. Otherwise the device loses its management path, drops off, and the apply fails with an inconsistent-result error. Apply in two steps: tag the VLAN on the uplink (a port_override tagged_networkconf_ids entry) first, then set mgmt_network_id. Leave unset to manage on the uplink's native (untagged) network.
     */
    mgmtNetworkId?: pulumi.Input<string | undefined>;
    /**
     * The name of the device.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Outdoor mode override; valid values are `default`, `on`, and `off`.
     */
    outdoorModeOverride?: pulumi.Input<string | undefined>;
    /**
     * Enable outlet control.
     */
    outletEnabled?: pulumi.Input<boolean | undefined>;
    /**
     * Outlet configuration overrides.
     */
    outletOverrides?: pulumi.Input<pulumi.Input<inputs.DeviceOutletOverride>[] | undefined>;
    /**
     * PoE mode; valid values are `auto`, `pasv24`, `passthrough`, and `off`.
     */
    poeMode?: pulumi.Input<string | undefined>;
    /**
     * Per-port settings overrides, applied only to the ports you declare. Ports without a `port_override` block keep their existing controller-side configuration — the provider merges your declared ports (by `index`) into the device's current overrides rather than replacing the whole set. Removing a block stops managing that port but does not reset it; clear a port by overriding it back to the defaults instead.
     */
    portOverrides?: pulumi.Input<pulumi.Input<inputs.DevicePortOverride>[] | undefined>;
    /**
     * Radio configuration table.
     */
    radioTables?: pulumi.Input<pulumi.Input<inputs.DeviceRadioTable>[] | undefined>;
    /**
     * The name of the site to associate the device with.
     */
    site?: pulumi.Input<string | undefined>;
    /**
     * STP priority.
     */
    stpPriority?: pulumi.Input<number | undefined>;
    /**
     * STP version; valid values are `stp`, `rstp`, and `disabled`.
     */
    stpVersion?: pulumi.Input<string | undefined>;
    /**
     * Enable VLAN support on the switch.
     */
    switchVlanEnabled?: pulumi.Input<boolean | undefined>;
    timeouts?: pulumi.Input<inputs.DeviceTimeouts | undefined>;
    /**
     * Volume level (0-100).
     */
    volume?: pulumi.Input<number | undefined>;
    /**
     * Baresip password.
     */
    xBaresipPassword?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=device.d.ts.map
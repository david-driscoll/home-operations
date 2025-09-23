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
     * Whether to automatically adopt the device when creating this resource. When true:
     * * The controller will attempt to adopt the device
     * * Device must be in a pending adoption state
     * * Device must be accessible on the network
     * Set to false if you want to manage adoption manually. Defaults to `true`.
     */
    readonly allowAdoption: pulumi.Output<boolean | undefined>;
    /**
     * Whether the device is administratively disabled. When true, the device will not forward traffic or provide services.
     */
    readonly disabled: pulumi.Output<boolean>;
    readonly forgetOnDestroy: pulumi.Output<boolean | undefined>;
    /**
     * The MAC address of the device in standard format (e.g., 'aa:bb:cc:dd:ee:ff'). This is used to identify and manage specific devices that have already been adopted by the controller.
     */
    readonly mac: pulumi.Output<string>;
    /**
     * A friendly name for the device that will be displayed in the UniFi controller UI. Examples:
     * * 'Office-AP-1' for an access point
     * * 'Core-Switch-01' for a switch
     * * 'Main-Gateway' for a gateway
     * Choose descriptive names that indicate location and purpose.
     */
    readonly name: pulumi.Output<string>;
    /**
     * A list of port-specific configuration overrides for UniFi switches. This allows you to customize individual port settings such as:
     *   * Port names and labels for easy identification
     *   * Port profiles for VLAN and security settings
     *   * Operating modes for special functions
     *
     * Common use cases include:
     *   * Setting up trunk ports for inter-switch connections
     *   * Configuring PoE settings for powered devices
     *   * Creating mirrored ports for network monitoring
     *   * Setting up link aggregation between switches or servers
     */
    readonly portOverrides: pulumi.Output<outputs.DevicePortOverride[] | undefined>;
    /**
     * The name of the UniFi site where the device is located. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
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
     * Whether to automatically adopt the device when creating this resource. When true:
     * * The controller will attempt to adopt the device
     * * Device must be in a pending adoption state
     * * Device must be accessible on the network
     * Set to false if you want to manage adoption manually. Defaults to `true`.
     */
    allowAdoption?: pulumi.Input<boolean>;
    /**
     * Whether the device is administratively disabled. When true, the device will not forward traffic or provide services.
     */
    disabled?: pulumi.Input<boolean>;
    forgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * The MAC address of the device in standard format (e.g., 'aa:bb:cc:dd:ee:ff'). This is used to identify and manage specific devices that have already been adopted by the controller.
     */
    mac?: pulumi.Input<string>;
    /**
     * A friendly name for the device that will be displayed in the UniFi controller UI. Examples:
     * * 'Office-AP-1' for an access point
     * * 'Core-Switch-01' for a switch
     * * 'Main-Gateway' for a gateway
     * Choose descriptive names that indicate location and purpose.
     */
    name?: pulumi.Input<string>;
    /**
     * A list of port-specific configuration overrides for UniFi switches. This allows you to customize individual port settings such as:
     *   * Port names and labels for easy identification
     *   * Port profiles for VLAN and security settings
     *   * Operating modes for special functions
     *
     * Common use cases include:
     *   * Setting up trunk ports for inter-switch connections
     *   * Configuring PoE settings for powered devices
     *   * Creating mirrored ports for network monitoring
     *   * Setting up link aggregation between switches or servers
     */
    portOverrides?: pulumi.Input<pulumi.Input<inputs.DevicePortOverride>[]>;
    /**
     * The name of the UniFi site where the device is located. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Device resource.
 */
export interface DeviceArgs {
    /**
     * Whether to automatically adopt the device when creating this resource. When true:
     * * The controller will attempt to adopt the device
     * * Device must be in a pending adoption state
     * * Device must be accessible on the network
     * Set to false if you want to manage adoption manually. Defaults to `true`.
     */
    allowAdoption?: pulumi.Input<boolean>;
    forgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * The MAC address of the device in standard format (e.g., 'aa:bb:cc:dd:ee:ff'). This is used to identify and manage specific devices that have already been adopted by the controller.
     */
    mac?: pulumi.Input<string>;
    /**
     * A friendly name for the device that will be displayed in the UniFi controller UI. Examples:
     * * 'Office-AP-1' for an access point
     * * 'Core-Switch-01' for a switch
     * * 'Main-Gateway' for a gateway
     * Choose descriptive names that indicate location and purpose.
     */
    name?: pulumi.Input<string>;
    /**
     * A list of port-specific configuration overrides for UniFi switches. This allows you to customize individual port settings such as:
     *   * Port names and labels for easy identification
     *   * Port profiles for VLAN and security settings
     *   * Operating modes for special functions
     *
     * Common use cases include:
     *   * Setting up trunk ports for inter-switch connections
     *   * Configuring PoE settings for powered devices
     *   * Creating mirrored ports for network monitoring
     *   * Setting up link aggregation between switches or servers
     */
    portOverrides?: pulumi.Input<pulumi.Input<inputs.DevicePortOverride>[]>;
    /**
     * The name of the UniFi site where the device is located. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}

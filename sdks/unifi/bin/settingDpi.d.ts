import * as pulumi from "@pulumi/pulumi";
export declare class SettingDpi extends pulumi.CustomResource {
    /**
     * Get an existing SettingDpi resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingDpiState, opts?: pulumi.CustomResourceOptions): SettingDpi;
    /**
     * Returns true if the given object is an instance of SettingDpi.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingDpi;
    /**
     * Whether Deep Packet Inspection is enabled.
     */
    readonly enabled: pulumi.Output<boolean>;
    /**
     * Whether DPI fingerprinting is enabled. Fingerprinting allows the controller to identify applications and services based on traffic patterns.
     */
    readonly fingerprintingEnabled: pulumi.Output<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a SettingDpi resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SettingDpiArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingDpi resources.
 */
export interface SettingDpiState {
    /**
     * Whether Deep Packet Inspection is enabled.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Whether DPI fingerprinting is enabled. Fingerprinting allows the controller to identify applications and services based on traffic patterns.
     */
    fingerprintingEnabled?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SettingDpi resource.
 */
export interface SettingDpiArgs {
    /**
     * Whether Deep Packet Inspection is enabled.
     */
    enabled: pulumi.Input<boolean>;
    /**
     * Whether DPI fingerprinting is enabled. Fingerprinting allows the controller to identify applications and services based on traffic patterns.
     */
    fingerprintingEnabled: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class SettingUsw extends pulumi.CustomResource {
    /**
     * Get an existing SettingUsw resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingUswState, opts?: pulumi.CustomResourceOptions): SettingUsw;
    /**
     * Returns true if the given object is an instance of SettingUsw.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingUsw;
    /**
     * Whether DHCP snooping is enabled. DHCP snooping is a security feature that filters untrusted DHCP messages and builds a binding database of valid hosts.
     */
    readonly dhcpSnoop: pulumi.Output<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a SettingUsw resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SettingUswArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingUsw resources.
 */
export interface SettingUswState {
    /**
     * Whether DHCP snooping is enabled. DHCP snooping is a security feature that filters untrusted DHCP messages and builds a binding database of valid hosts.
     */
    dhcpSnoop?: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SettingUsw resource.
 */
export interface SettingUswArgs {
    /**
     * Whether DHCP snooping is enabled. DHCP snooping is a security feature that filters untrusted DHCP messages and builds a binding database of valid hosts.
     */
    dhcpSnoop: pulumi.Input<boolean>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}

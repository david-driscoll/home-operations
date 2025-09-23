import * as pulumi from "@pulumi/pulumi";
export declare class FirewallZone extends pulumi.CustomResource {
    /**
     * Get an existing FirewallZone resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: FirewallZoneState, opts?: pulumi.CustomResourceOptions): FirewallZone;
    /**
     * Returns true if the given object is an instance of FirewallZone.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is FirewallZone;
    /**
     * The name of the firewall zone.
     */
    readonly name: pulumi.Output<string>;
    /**
     * List of network IDs to include in this firewall zone.
     */
    readonly networks: pulumi.Output<string[]>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a FirewallZone resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: FirewallZoneArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering FirewallZone resources.
 */
export interface FirewallZoneState {
    /**
     * The name of the firewall zone.
     */
    name?: pulumi.Input<string>;
    /**
     * List of network IDs to include in this firewall zone.
     */
    networks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a FirewallZone resource.
 */
export interface FirewallZoneArgs {
    /**
     * The name of the firewall zone.
     */
    name?: pulumi.Input<string>;
    /**
     * List of network IDs to include in this firewall zone.
     */
    networks?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}

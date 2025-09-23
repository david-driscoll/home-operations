import * as pulumi from "@pulumi/pulumi";
export declare class PropertyMappingLdap extends pulumi.CustomResource {
    /**
     * Get an existing PropertyMappingLdap resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PropertyMappingLdapState, opts?: pulumi.CustomResourceOptions): PropertyMappingLdap;
    /**
     * Returns true if the given object is an instance of PropertyMappingLdap.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PropertyMappingLdap;
    readonly expression: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappingLdapId: pulumi.Output<string>;
    /**
     * Create a PropertyMappingLdap resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PropertyMappingLdapArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PropertyMappingLdap resources.
 */
export interface PropertyMappingLdapState {
    expression?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingLdapId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PropertyMappingLdap resource.
 */
export interface PropertyMappingLdapArgs {
    expression: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingLdapId?: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class PropertyMappingSourcePlex extends pulumi.CustomResource {
    /**
     * Get an existing PropertyMappingSourcePlex resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PropertyMappingSourcePlexState, opts?: pulumi.CustomResourceOptions): PropertyMappingSourcePlex;
    /**
     * Returns true if the given object is an instance of PropertyMappingSourcePlex.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PropertyMappingSourcePlex;
    readonly expression: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappingSourcePlexId: pulumi.Output<string>;
    /**
     * Create a PropertyMappingSourcePlex resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PropertyMappingSourcePlexArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PropertyMappingSourcePlex resources.
 */
export interface PropertyMappingSourcePlexState {
    expression?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingSourcePlexId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PropertyMappingSourcePlex resource.
 */
export interface PropertyMappingSourcePlexArgs {
    expression: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingSourcePlexId?: pulumi.Input<string>;
}

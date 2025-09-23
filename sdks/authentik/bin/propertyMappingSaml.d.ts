import * as pulumi from "@pulumi/pulumi";
export declare class PropertyMappingSaml extends pulumi.CustomResource {
    /**
     * Get an existing PropertyMappingSaml resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PropertyMappingSamlState, opts?: pulumi.CustomResourceOptions): PropertyMappingSaml;
    /**
     * Returns true if the given object is an instance of PropertyMappingSaml.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PropertyMappingSaml;
    readonly expression: pulumi.Output<string>;
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappingSamlId: pulumi.Output<string>;
    readonly samlName: pulumi.Output<string>;
    /**
     * Create a PropertyMappingSaml resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PropertyMappingSamlArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PropertyMappingSaml resources.
 */
export interface PropertyMappingSamlState {
    expression?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingSamlId?: pulumi.Input<string>;
    samlName?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PropertyMappingSaml resource.
 */
export interface PropertyMappingSamlArgs {
    expression: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingSamlId?: pulumi.Input<string>;
    samlName: pulumi.Input<string>;
}

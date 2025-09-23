import * as pulumi from "@pulumi/pulumi";
export declare class PropertyMappingProviderSaml extends pulumi.CustomResource {
    /**
     * Get an existing PropertyMappingProviderSaml resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PropertyMappingProviderSamlState, opts?: pulumi.CustomResourceOptions): PropertyMappingProviderSaml;
    /**
     * Returns true if the given object is an instance of PropertyMappingProviderSaml.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PropertyMappingProviderSaml;
    readonly expression: pulumi.Output<string>;
    readonly friendlyName: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappingProviderSamlId: pulumi.Output<string>;
    readonly samlName: pulumi.Output<string>;
    /**
     * Create a PropertyMappingProviderSaml resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PropertyMappingProviderSamlArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PropertyMappingProviderSaml resources.
 */
export interface PropertyMappingProviderSamlState {
    expression?: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingProviderSamlId?: pulumi.Input<string>;
    samlName?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PropertyMappingProviderSaml resource.
 */
export interface PropertyMappingProviderSamlArgs {
    expression: pulumi.Input<string>;
    friendlyName?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingProviderSamlId?: pulumi.Input<string>;
    samlName: pulumi.Input<string>;
}

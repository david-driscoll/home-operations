import * as pulumi from "@pulumi/pulumi";
export declare class PropertyMappingProviderMicrosoftEntra extends pulumi.CustomResource {
    /**
     * Get an existing PropertyMappingProviderMicrosoftEntra resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PropertyMappingProviderMicrosoftEntraState, opts?: pulumi.CustomResourceOptions): PropertyMappingProviderMicrosoftEntra;
    /**
     * Returns true if the given object is an instance of PropertyMappingProviderMicrosoftEntra.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PropertyMappingProviderMicrosoftEntra;
    readonly expression: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappingProviderMicrosoftEntraId: pulumi.Output<string>;
    /**
     * Create a PropertyMappingProviderMicrosoftEntra resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PropertyMappingProviderMicrosoftEntraArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PropertyMappingProviderMicrosoftEntra resources.
 */
export interface PropertyMappingProviderMicrosoftEntraState {
    expression?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingProviderMicrosoftEntraId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PropertyMappingProviderMicrosoftEntra resource.
 */
export interface PropertyMappingProviderMicrosoftEntraArgs {
    expression: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingProviderMicrosoftEntraId?: pulumi.Input<string>;
}

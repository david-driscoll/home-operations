import * as pulumi from "@pulumi/pulumi";
export declare class PropertyMappingProviderScope extends pulumi.CustomResource {
    /**
     * Get an existing PropertyMappingProviderScope resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PropertyMappingProviderScopeState, opts?: pulumi.CustomResourceOptions): PropertyMappingProviderScope;
    /**
     * Returns true if the given object is an instance of PropertyMappingProviderScope.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PropertyMappingProviderScope;
    readonly description: pulumi.Output<string | undefined>;
    readonly expression: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappingProviderScopeId: pulumi.Output<string>;
    readonly scopeName: pulumi.Output<string>;
    /**
     * Create a PropertyMappingProviderScope resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PropertyMappingProviderScopeArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PropertyMappingProviderScope resources.
 */
export interface PropertyMappingProviderScopeState {
    description?: pulumi.Input<string>;
    expression?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingProviderScopeId?: pulumi.Input<string>;
    scopeName?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PropertyMappingProviderScope resource.
 */
export interface PropertyMappingProviderScopeArgs {
    description?: pulumi.Input<string>;
    expression: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    propertyMappingProviderScopeId?: pulumi.Input<string>;
    scopeName: pulumi.Input<string>;
}

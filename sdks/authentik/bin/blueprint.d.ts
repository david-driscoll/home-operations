import * as pulumi from "@pulumi/pulumi";
export declare class Blueprint extends pulumi.CustomResource {
    /**
     * Get an existing Blueprint resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: BlueprintState, opts?: pulumi.CustomResourceOptions): Blueprint;
    /**
     * Returns true if the given object is an instance of Blueprint.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Blueprint;
    readonly blueprintId: pulumi.Output<string>;
    readonly content: pulumi.Output<string | undefined>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly context: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly path: pulumi.Output<string | undefined>;
    /**
     * Create a Blueprint resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: BlueprintArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Blueprint resources.
 */
export interface BlueprintState {
    blueprintId?: pulumi.Input<string>;
    content?: pulumi.Input<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    context?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    path?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Blueprint resource.
 */
export interface BlueprintArgs {
    blueprintId?: pulumi.Input<string>;
    content?: pulumi.Input<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    context?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    path?: pulumi.Input<string>;
}

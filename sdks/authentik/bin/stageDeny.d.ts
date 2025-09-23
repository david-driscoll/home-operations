import * as pulumi from "@pulumi/pulumi";
export declare class StageDeny extends pulumi.CustomResource {
    /**
     * Get an existing StageDeny resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageDenyState, opts?: pulumi.CustomResourceOptions): StageDeny;
    /**
     * Returns true if the given object is an instance of StageDeny.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageDeny;
    readonly denyMessage: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageDenyId: pulumi.Output<string>;
    /**
     * Create a StageDeny resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageDenyArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageDeny resources.
 */
export interface StageDenyState {
    denyMessage?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageDenyId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageDeny resource.
 */
export interface StageDenyArgs {
    denyMessage?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageDenyId?: pulumi.Input<string>;
}

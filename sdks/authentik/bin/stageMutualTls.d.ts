import * as pulumi from "@pulumi/pulumi";
export declare class StageMutualTls extends pulumi.CustomResource {
    /**
     * Get an existing StageMutualTls resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageMutualTlsState, opts?: pulumi.CustomResourceOptions): StageMutualTls;
    /**
     * Returns true if the given object is an instance of StageMutualTls.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageMutualTls;
    /**
     * Allowed values:
     *   - `subject`
     *   - `common_name`
     *   - `email`
     *  Defaults to `email`.
     */
    readonly certAttribute: pulumi.Output<string | undefined>;
    readonly certificateAuthorities: pulumi.Output<string[] | undefined>;
    /**
     * Allowed values:
     *   - `optional`
     *   - `required`
     *  Defaults to `optional`.
     */
    readonly mode: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageMutualTlsId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `username`
     *   - `email`
     *  Defaults to `email`.
     */
    readonly userAttribute: pulumi.Output<string | undefined>;
    /**
     * Create a StageMutualTls resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageMutualTlsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageMutualTls resources.
 */
export interface StageMutualTlsState {
    /**
     * Allowed values:
     *   - `subject`
     *   - `common_name`
     *   - `email`
     *  Defaults to `email`.
     */
    certAttribute?: pulumi.Input<string>;
    certificateAuthorities?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `optional`
     *   - `required`
     *  Defaults to `optional`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageMutualTlsId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `username`
     *   - `email`
     *  Defaults to `email`.
     */
    userAttribute?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageMutualTls resource.
 */
export interface StageMutualTlsArgs {
    /**
     * Allowed values:
     *   - `subject`
     *   - `common_name`
     *   - `email`
     *  Defaults to `email`.
     */
    certAttribute?: pulumi.Input<string>;
    certificateAuthorities?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `optional`
     *   - `required`
     *  Defaults to `optional`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageMutualTlsId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `username`
     *   - `email`
     *  Defaults to `email`.
     */
    userAttribute?: pulumi.Input<string>;
}

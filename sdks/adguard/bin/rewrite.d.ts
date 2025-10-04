import * as pulumi from "@pulumi/pulumi";
export declare class Rewrite extends pulumi.CustomResource {
    /**
     * Get an existing Rewrite resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: RewriteState, opts?: pulumi.CustomResourceOptions): Rewrite;
    /**
     * Returns true if the given object is an instance of Rewrite.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Rewrite;
    /**
     * Value of A, AAAA or CNAME DNS record
     */
    readonly answer: pulumi.Output<string>;
    /**
     * Domain name
     */
    readonly domain: pulumi.Output<string>;
    readonly lastUpdated: pulumi.Output<string>;
    /**
     * Create a Rewrite resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: RewriteArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Rewrite resources.
 */
export interface RewriteState {
    /**
     * Value of A, AAAA or CNAME DNS record
     */
    answer?: pulumi.Input<string>;
    /**
     * Domain name
     */
    domain?: pulumi.Input<string>;
    lastUpdated?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Rewrite resource.
 */
export interface RewriteArgs {
    /**
     * Value of A, AAAA or CNAME DNS record
     */
    answer: pulumi.Input<string>;
    /**
     * Domain name
     */
    domain: pulumi.Input<string>;
}

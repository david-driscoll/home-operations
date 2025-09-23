import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class Pool extends pulumi.CustomResource {
    /**
     * Get an existing Pool resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PoolState, opts?: pulumi.CustomResourceOptions): Pool;
    /**
     * Returns true if the given object is an instance of Pool.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Pool;
    readonly comment: pulumi.Output<string | undefined>;
    readonly poolId: pulumi.Output<string>;
    readonly poolid: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.PoolTimeouts | undefined>;
    /**
     * Create a Pool resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PoolArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Pool resources.
 */
export interface PoolState {
    comment?: pulumi.Input<string>;
    poolId?: pulumi.Input<string>;
    poolid?: pulumi.Input<string>;
    timeouts?: pulumi.Input<inputs.PoolTimeouts>;
}
/**
 * The set of arguments for constructing a Pool resource.
 */
export interface PoolArgs {
    comment?: pulumi.Input<string>;
    poolId?: pulumi.Input<string>;
    poolid: pulumi.Input<string>;
    timeouts?: pulumi.Input<inputs.PoolTimeouts>;
}

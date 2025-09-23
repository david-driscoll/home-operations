import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class LxcDisk extends pulumi.CustomResource {
    /**
     * Get an existing LxcDisk resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: LxcDiskState, opts?: pulumi.CustomResourceOptions): LxcDisk;
    /**
     * Returns true if the given object is an instance of LxcDisk.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is LxcDisk;
    readonly acl: pulumi.Output<boolean | undefined>;
    readonly backup: pulumi.Output<boolean | undefined>;
    readonly container: pulumi.Output<string>;
    readonly lxcDiskId: pulumi.Output<string>;
    readonly mountoptions: pulumi.Output<outputs.LxcDiskMountoptions | undefined>;
    readonly mp: pulumi.Output<string>;
    readonly quota: pulumi.Output<boolean | undefined>;
    readonly replicate: pulumi.Output<boolean | undefined>;
    readonly shared: pulumi.Output<boolean | undefined>;
    readonly size: pulumi.Output<string>;
    readonly slot: pulumi.Output<number>;
    readonly storage: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.LxcDiskTimeouts | undefined>;
    readonly volume: pulumi.Output<string>;
    /**
     * Create a LxcDisk resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: LxcDiskArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering LxcDisk resources.
 */
export interface LxcDiskState {
    acl?: pulumi.Input<boolean>;
    backup?: pulumi.Input<boolean>;
    container?: pulumi.Input<string>;
    lxcDiskId?: pulumi.Input<string>;
    mountoptions?: pulumi.Input<inputs.LxcDiskMountoptions>;
    mp?: pulumi.Input<string>;
    quota?: pulumi.Input<boolean>;
    replicate?: pulumi.Input<boolean>;
    shared?: pulumi.Input<boolean>;
    size?: pulumi.Input<string>;
    slot?: pulumi.Input<number>;
    storage?: pulumi.Input<string>;
    timeouts?: pulumi.Input<inputs.LxcDiskTimeouts>;
    volume?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a LxcDisk resource.
 */
export interface LxcDiskArgs {
    acl?: pulumi.Input<boolean>;
    backup?: pulumi.Input<boolean>;
    container: pulumi.Input<string>;
    lxcDiskId?: pulumi.Input<string>;
    mountoptions?: pulumi.Input<inputs.LxcDiskMountoptions>;
    mp: pulumi.Input<string>;
    quota?: pulumi.Input<boolean>;
    replicate?: pulumi.Input<boolean>;
    shared?: pulumi.Input<boolean>;
    size: pulumi.Input<string>;
    slot: pulumi.Input<number>;
    storage: pulumi.Input<string>;
    timeouts?: pulumi.Input<inputs.LxcDiskTimeouts>;
    volume?: pulumi.Input<string>;
}

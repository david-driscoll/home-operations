import * as pulumi from "@pulumi/pulumi";
export declare class UserGroup extends pulumi.CustomResource {
    /**
     * Get an existing UserGroup resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: UserGroupState, opts?: pulumi.CustomResourceOptions): UserGroup;
    /**
     * Returns true if the given object is an instance of UserGroup.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is UserGroup;
    /**
     * The name of the user group.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The QOS maximum download rate. Defaults to `-1`.
     */
    readonly qosRateMaxDown: pulumi.Output<number | undefined>;
    /**
     * The QOS maximum upload rate. Defaults to `-1`.
     */
    readonly qosRateMaxUp: pulumi.Output<number | undefined>;
    /**
     * The name of the site to associate the user group with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a UserGroup resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: UserGroupArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering UserGroup resources.
 */
export interface UserGroupState {
    /**
     * The name of the user group.
     */
    name?: pulumi.Input<string>;
    /**
     * The QOS maximum download rate. Defaults to `-1`.
     */
    qosRateMaxDown?: pulumi.Input<number>;
    /**
     * The QOS maximum upload rate. Defaults to `-1`.
     */
    qosRateMaxUp?: pulumi.Input<number>;
    /**
     * The name of the site to associate the user group with.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a UserGroup resource.
 */
export interface UserGroupArgs {
    /**
     * The name of the user group.
     */
    name?: pulumi.Input<string>;
    /**
     * The QOS maximum download rate. Defaults to `-1`.
     */
    qosRateMaxDown?: pulumi.Input<number>;
    /**
     * The QOS maximum upload rate. Defaults to `-1`.
     */
    qosRateMaxUp?: pulumi.Input<number>;
    /**
     * The name of the site to associate the user group with.
     */
    site?: pulumi.Input<string>;
}

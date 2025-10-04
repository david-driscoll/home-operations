import * as pulumi from "@pulumi/pulumi";
export declare class UserRules extends pulumi.CustomResource {
    /**
     * Get an existing UserRules resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: UserRulesState, opts?: pulumi.CustomResourceOptions): UserRules;
    /**
     * Returns true if the given object is an instance of UserRules.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is UserRules;
    readonly lastUpdated: pulumi.Output<string>;
    /**
     * List of user rules
     */
    readonly rules: pulumi.Output<string[]>;
    /**
     * Create a UserRules resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: UserRulesArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering UserRules resources.
 */
export interface UserRulesState {
    lastUpdated?: pulumi.Input<string>;
    /**
     * List of user rules
     */
    rules?: pulumi.Input<pulumi.Input<string>[]>;
}
/**
 * The set of arguments for constructing a UserRules resource.
 */
export interface UserRulesArgs {
    /**
     * List of user rules
     */
    rules: pulumi.Input<pulumi.Input<string>[]>;
}

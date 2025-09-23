import * as pulumi from "@pulumi/pulumi";
export declare class User extends pulumi.CustomResource {
    /**
     * Get an existing User resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: UserState, opts?: pulumi.CustomResourceOptions): User;
    /**
     * Returns true if the given object is an instance of User.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is User;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly attributes: pulumi.Output<string | undefined>;
    readonly email: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly groups: pulumi.Output<string[]>;
    /**
     * Defaults to `true`.
     */
    readonly isActive: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to ``.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Optionally set the user's password. Changing the password in authentik will not trigger an update here.
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * Defaults to `users`.
     */
    readonly path: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `internal`
     *   - `external`
     *   - `service_account`
     *   - `internal_service_account`
     *  Defaults to `internal`.
     */
    readonly type: pulumi.Output<string | undefined>;
    readonly userId: pulumi.Output<string>;
    readonly username: pulumi.Output<string>;
    /**
     * Create a User resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: UserArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering User resources.
 */
export interface UserState {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    attributes?: pulumi.Input<string>;
    email?: pulumi.Input<string>;
    /**
     * Generated.
     */
    groups?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Defaults to `true`.
     */
    isActive?: pulumi.Input<boolean>;
    /**
     * Defaults to ``.
     */
    name?: pulumi.Input<string>;
    /**
     * Optionally set the user's password. Changing the password in authentik will not trigger an update here.
     */
    password?: pulumi.Input<string>;
    /**
     * Defaults to `users`.
     */
    path?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `internal`
     *   - `external`
     *   - `service_account`
     *   - `internal_service_account`
     *  Defaults to `internal`.
     */
    type?: pulumi.Input<string>;
    userId?: pulumi.Input<string>;
    username?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a User resource.
 */
export interface UserArgs {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    attributes?: pulumi.Input<string>;
    email?: pulumi.Input<string>;
    /**
     * Generated.
     */
    groups?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Defaults to `true`.
     */
    isActive?: pulumi.Input<boolean>;
    /**
     * Defaults to ``.
     */
    name?: pulumi.Input<string>;
    /**
     * Optionally set the user's password. Changing the password in authentik will not trigger an update here.
     */
    password?: pulumi.Input<string>;
    /**
     * Defaults to `users`.
     */
    path?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `internal`
     *   - `external`
     *   - `service_account`
     *   - `internal_service_account`
     *  Defaults to `internal`.
     */
    type?: pulumi.Input<string>;
    userId?: pulumi.Input<string>;
    username: pulumi.Input<string>;
}

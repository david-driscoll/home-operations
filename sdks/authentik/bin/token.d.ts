import * as pulumi from "@pulumi/pulumi";
export declare class Token extends pulumi.CustomResource {
    /**
     * Get an existing Token resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: TokenState, opts?: pulumi.CustomResourceOptions): Token;
    /**
     * Returns true if the given object is an instance of Token.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Token;
    readonly description: pulumi.Output<string | undefined>;
    readonly expires: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly expiresIn: pulumi.Output<number>;
    /**
     * Defaults to `true`.
     */
    readonly expiring: pulumi.Output<boolean | undefined>;
    readonly identifier: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `verification`
     *   - `api`
     *   - `recovery`
     *   - `app_password`
     *  Defaults to `api`.
     */
    readonly intent: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly key: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly retrieveKey: pulumi.Output<boolean | undefined>;
    readonly tokenId: pulumi.Output<string>;
    readonly user: pulumi.Output<number>;
    /**
     * Create a Token resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: TokenArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Token resources.
 */
export interface TokenState {
    description?: pulumi.Input<string>;
    expires?: pulumi.Input<string>;
    /**
     * Generated.
     */
    expiresIn?: pulumi.Input<number>;
    /**
     * Defaults to `true`.
     */
    expiring?: pulumi.Input<boolean>;
    identifier?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `verification`
     *   - `api`
     *   - `recovery`
     *   - `app_password`
     *  Defaults to `api`.
     */
    intent?: pulumi.Input<string>;
    /**
     * Generated.
     */
    key?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    retrieveKey?: pulumi.Input<boolean>;
    tokenId?: pulumi.Input<string>;
    user?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a Token resource.
 */
export interface TokenArgs {
    description?: pulumi.Input<string>;
    expires?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    expiring?: pulumi.Input<boolean>;
    identifier: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `verification`
     *   - `api`
     *   - `recovery`
     *   - `app_password`
     *  Defaults to `api`.
     */
    intent?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    retrieveKey?: pulumi.Input<boolean>;
    tokenId?: pulumi.Input<string>;
    user: pulumi.Input<number>;
}

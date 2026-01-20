import * as pulumi from "@pulumi/pulumi";
export declare class Account extends pulumi.CustomResource {
    /**
     * Get an existing Account resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: AccountState, opts?: pulumi.CustomResourceOptions): Account;
    /**
     * Returns true if the given object is an instance of Account.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Account;
    /**
     * The name of the account.
     */
    readonly name: pulumi.Output<string>;
    /**
     * ID of the network for this account
     */
    readonly networkId: pulumi.Output<string | undefined>;
    /**
     * The password of the account.
     */
    readonly password: pulumi.Output<string>;
    /**
     * The name of the site to associate the account with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    readonly tunnelMediumType: pulumi.Output<number>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1
     */
    readonly tunnelType: pulumi.Output<number>;
    /**
     * Create a Account resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: AccountArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Account resources.
 */
export interface AccountState {
    /**
     * The name of the account.
     */
    name?: pulumi.Input<string>;
    /**
     * ID of the network for this account
     */
    networkId?: pulumi.Input<string>;
    /**
     * The password of the account.
     */
    password?: pulumi.Input<string>;
    /**
     * The name of the site to associate the account with.
     */
    site?: pulumi.Input<string>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    tunnelMediumType?: pulumi.Input<number>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1
     */
    tunnelType?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a Account resource.
 */
export interface AccountArgs {
    /**
     * The name of the account.
     */
    name?: pulumi.Input<string>;
    /**
     * ID of the network for this account
     */
    networkId?: pulumi.Input<string>;
    /**
     * The password of the account.
     */
    password: pulumi.Input<string>;
    /**
     * The name of the site to associate the account with.
     */
    site?: pulumi.Input<string>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    tunnelMediumType?: pulumi.Input<number>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1
     */
    tunnelType?: pulumi.Input<number>;
}

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
     * The username for this RADIUS account. For regular users, this can be any unique identifier. For MAC-based authentication, this must be the device's MAC address in uppercase with no separators (e.g., '001122334455').
     */
    readonly name: pulumi.Output<string>;
    /**
     * The ID of the network (VLAN) to assign to clients authenticating with this account. This is used in conjunction with the tunnel attributes to provide VLAN assignment via RADIUS.
     */
    readonly networkId: pulumi.Output<string | undefined>;
    /**
     * The password for this RADIUS account. For MAC-based authentication, this must match the username (the MAC address). For regular users, this should be a secure password following your organization's password policies.
     */
    readonly password: pulumi.Output<string>;
    /**
     * The name of the UniFi site where this RADIUS account should be created. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * The RADIUS tunnel medium type attribute ([RFC 2868](https://tools.ietf.org/html/rfc2868), section 3.2). Common values:
     *   * `6` - 802 (includes Ethernet, Token Ring, FDDI) (default)
     *   * `1` - IPv4
     *   * `2` - IPv6
     *
     * Only change this if you need specific tunneling behavior. Defaults to `6`.
     */
    readonly tunnelMediumType: pulumi.Output<number | undefined>;
    /**
     * The RADIUS tunnel type attribute ([RFC 2868](https://tools.ietf.org/html/rfc2868), section 3.1). Common values:
     *   * `13` - VLAN (default)
     *   * `1` - Point-to-Point Protocol (PPTP)
     *   * `9` - Point-to-Point Protocol (L2TP)
     *
     * Only change this if you need specific tunneling behavior. Defaults to `13`.
     */
    readonly tunnelType: pulumi.Output<number | undefined>;
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
     * The username for this RADIUS account. For regular users, this can be any unique identifier. For MAC-based authentication, this must be the device's MAC address in uppercase with no separators (e.g., '001122334455').
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of the network (VLAN) to assign to clients authenticating with this account. This is used in conjunction with the tunnel attributes to provide VLAN assignment via RADIUS.
     */
    networkId?: pulumi.Input<string>;
    /**
     * The password for this RADIUS account. For MAC-based authentication, this must match the username (the MAC address). For regular users, this should be a secure password following your organization's password policies.
     */
    password?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this RADIUS account should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The RADIUS tunnel medium type attribute ([RFC 2868](https://tools.ietf.org/html/rfc2868), section 3.2). Common values:
     *   * `6` - 802 (includes Ethernet, Token Ring, FDDI) (default)
     *   * `1` - IPv4
     *   * `2` - IPv6
     *
     * Only change this if you need specific tunneling behavior. Defaults to `6`.
     */
    tunnelMediumType?: pulumi.Input<number>;
    /**
     * The RADIUS tunnel type attribute ([RFC 2868](https://tools.ietf.org/html/rfc2868), section 3.1). Common values:
     *   * `13` - VLAN (default)
     *   * `1` - Point-to-Point Protocol (PPTP)
     *   * `9` - Point-to-Point Protocol (L2TP)
     *
     * Only change this if you need specific tunneling behavior. Defaults to `13`.
     */
    tunnelType?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a Account resource.
 */
export interface AccountArgs {
    /**
     * The username for this RADIUS account. For regular users, this can be any unique identifier. For MAC-based authentication, this must be the device's MAC address in uppercase with no separators (e.g., '001122334455').
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of the network (VLAN) to assign to clients authenticating with this account. This is used in conjunction with the tunnel attributes to provide VLAN assignment via RADIUS.
     */
    networkId?: pulumi.Input<string>;
    /**
     * The password for this RADIUS account. For MAC-based authentication, this must match the username (the MAC address). For regular users, this should be a secure password following your organization's password policies.
     */
    password: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this RADIUS account should be created. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * The RADIUS tunnel medium type attribute ([RFC 2868](https://tools.ietf.org/html/rfc2868), section 3.2). Common values:
     *   * `6` - 802 (includes Ethernet, Token Ring, FDDI) (default)
     *   * `1` - IPv4
     *   * `2` - IPv6
     *
     * Only change this if you need specific tunneling behavior. Defaults to `6`.
     */
    tunnelMediumType?: pulumi.Input<number>;
    /**
     * The RADIUS tunnel type attribute ([RFC 2868](https://tools.ietf.org/html/rfc2868), section 3.1). Common values:
     *   * `13` - VLAN (default)
     *   * `1` - Point-to-Point Protocol (PPTP)
     *   * `9` - Point-to-Point Protocol (L2TP)
     *
     * Only change this if you need specific tunneling behavior. Defaults to `13`.
     */
    tunnelType?: pulumi.Input<number>;
}

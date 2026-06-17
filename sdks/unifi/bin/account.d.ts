import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
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
     * ID of the network for this account. When set and `vlan` is omitted, the account inherits that network's VLAN (so RADIUS/MAB VLAN assignment is applied).
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
    readonly timeouts: pulumi.Output<outputs.AccountTimeouts | undefined>;
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    readonly tunnelConfigType: pulumi.Output<string | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    readonly tunnelMediumType: pulumi.Output<number>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    readonly tunnelType: pulumi.Output<number>;
    /**
     * VLAN assigned to the account. If omitted but `network_id` is set, it is derived from that network's VLAN. If neither is set, the client falls back to the untagged VLAN.
     */
    readonly vlan: pulumi.Output<number>;
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
    name?: pulumi.Input<string | undefined>;
    /**
     * ID of the network for this account. When set and `vlan` is omitted, the account inherits that network's VLAN (so RADIUS/MAB VLAN assignment is applied).
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * The password of the account.
     */
    password?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate the account with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.AccountTimeouts | undefined>;
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    tunnelConfigType?: pulumi.Input<string | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    tunnelMediumType?: pulumi.Input<number | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    tunnelType?: pulumi.Input<number | undefined>;
    /**
     * VLAN assigned to the account. If omitted but `network_id` is set, it is derived from that network's VLAN. If neither is set, the client falls back to the untagged VLAN.
     */
    vlan?: pulumi.Input<number | undefined>;
}
/**
 * The set of arguments for constructing a Account resource.
 */
export interface AccountArgs {
    /**
     * The name of the account.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * ID of the network for this account. When set and `vlan` is omitted, the account inherits that network's VLAN (so RADIUS/MAB VLAN assignment is applied).
     */
    networkId?: pulumi.Input<string | undefined>;
    /**
     * The password of the account.
     */
    password: pulumi.Input<string>;
    /**
     * The name of the site to associate the account with.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.AccountTimeouts | undefined>;
    /**
     * The tunnel configuration type. Can be `vpn`, `802.1x`, or `custom`.
     */
    tunnelConfigType?: pulumi.Input<string | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.2
     */
    tunnelMediumType?: pulumi.Input<number | undefined>;
    /**
     * See [RFC 2868](https://www.rfc-editor.org/rfc/rfc2868) section 3.1. Valid values are 1-13; `13` (VLAN) is the most common.
     */
    tunnelType?: pulumi.Input<number | undefined>;
    /**
     * VLAN assigned to the account. If omitted but `network_id` is set, it is derived from that network's VLAN. If neither is set, the client falls back to the untagged VLAN.
     */
    vlan?: pulumi.Input<number | undefined>;
}
//# sourceMappingURL=account.d.ts.map
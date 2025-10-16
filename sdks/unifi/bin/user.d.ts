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
     * Specifies whether this resource should just take over control of an existing user. Defaults to `true`.
     */
    readonly allowExisting: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether this user should be blocked from the network.
     */
    readonly blocked: pulumi.Output<boolean | undefined>;
    /**
     * Override the device fingerprint.
     */
    readonly devIdOverride: pulumi.Output<number | undefined>;
    /**
     * A fixed IPv4 address for this user.
     */
    readonly fixedIp: pulumi.Output<string | undefined>;
    /**
     * The hostname of the user.
     */
    readonly hostname: pulumi.Output<string>;
    /**
     * The IP address of the user.
     */
    readonly ip: pulumi.Output<string>;
    /**
     * Specifies the local DNS record for this user.
     */
    readonly localDnsRecord: pulumi.Output<string | undefined>;
    /**
     * The MAC address of the user.
     */
    readonly mac: pulumi.Output<string>;
    /**
     * The name of the user.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The network ID for this user.
     */
    readonly networkId: pulumi.Output<string | undefined>;
    /**
     * A note with additional information for the user.
     */
    readonly note: pulumi.Output<string | undefined>;
    /**
     * The name of the site to associate the user with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Specifies whether this resource should tell the controller to "forget" the user on destroy. Defaults to `false`.
     */
    readonly skipForgetOnDestroy: pulumi.Output<boolean | undefined>;
    /**
     * The user group ID for the user.
     */
    readonly userGroupId: pulumi.Output<string | undefined>;
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
     * Specifies whether this resource should just take over control of an existing user. Defaults to `true`.
     */
    allowExisting?: pulumi.Input<boolean>;
    /**
     * Specifies whether this user should be blocked from the network.
     */
    blocked?: pulumi.Input<boolean>;
    /**
     * Override the device fingerprint.
     */
    devIdOverride?: pulumi.Input<number>;
    /**
     * A fixed IPv4 address for this user.
     */
    fixedIp?: pulumi.Input<string>;
    /**
     * The hostname of the user.
     */
    hostname?: pulumi.Input<string>;
    /**
     * The IP address of the user.
     */
    ip?: pulumi.Input<string>;
    /**
     * Specifies the local DNS record for this user.
     */
    localDnsRecord?: pulumi.Input<string>;
    /**
     * The MAC address of the user.
     */
    mac?: pulumi.Input<string>;
    /**
     * The name of the user.
     */
    name?: pulumi.Input<string>;
    /**
     * The network ID for this user.
     */
    networkId?: pulumi.Input<string>;
    /**
     * A note with additional information for the user.
     */
    note?: pulumi.Input<string>;
    /**
     * The name of the site to associate the user with.
     */
    site?: pulumi.Input<string>;
    /**
     * Specifies whether this resource should tell the controller to "forget" the user on destroy. Defaults to `false`.
     */
    skipForgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * The user group ID for the user.
     */
    userGroupId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a User resource.
 */
export interface UserArgs {
    /**
     * Specifies whether this resource should just take over control of an existing user. Defaults to `true`.
     */
    allowExisting?: pulumi.Input<boolean>;
    /**
     * Specifies whether this user should be blocked from the network.
     */
    blocked?: pulumi.Input<boolean>;
    /**
     * Override the device fingerprint.
     */
    devIdOverride?: pulumi.Input<number>;
    /**
     * A fixed IPv4 address for this user.
     */
    fixedIp?: pulumi.Input<string>;
    /**
     * Specifies the local DNS record for this user.
     */
    localDnsRecord?: pulumi.Input<string>;
    /**
     * The MAC address of the user.
     */
    mac: pulumi.Input<string>;
    /**
     * The name of the user.
     */
    name?: pulumi.Input<string>;
    /**
     * The network ID for this user.
     */
    networkId?: pulumi.Input<string>;
    /**
     * A note with additional information for the user.
     */
    note?: pulumi.Input<string>;
    /**
     * The name of the site to associate the user with.
     */
    site?: pulumi.Input<string>;
    /**
     * Specifies whether this resource should tell the controller to "forget" the user on destroy. Defaults to `false`.
     */
    skipForgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * The user group ID for the user.
     */
    userGroupId?: pulumi.Input<string>;
}

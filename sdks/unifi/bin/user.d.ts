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
     * Allow this resource to take over management of an existing user in the UniFi controller. When true:
     *   * The resource can manage users that were automatically created when devices connected
     *   * Existing settings will be overwritten with the values specified in this resource
     *   * If false, attempting to manage an existing user will result in an error
     *
     * Use with caution as it can modify settings for devices already connected to your network. Defaults to `true`.
     */
    readonly allowExisting: pulumi.Output<boolean | undefined>;
    /**
     * When true, this client will be blocked from accessing the network. Useful for temporarily or permanently restricting network access for specific devices.
     */
    readonly blocked: pulumi.Output<boolean | undefined>;
    /**
     * Override the device fingerprint.
     */
    readonly devIdOverride: pulumi.Output<number | undefined>;
    /**
     * A static IPv4 address to assign to this client. Ensure this IP is within the client's network range and not already assigned to another device.
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
     * A local DNS hostname for this client. When set, other devices on the network can resolve this name to the client's IP address (e.g., 'printer.local', 'nas.home.arpa'). Such DNS record is automatically added to controller's DNS records.
     */
    readonly localDnsRecord: pulumi.Output<string | undefined>;
    /**
     * The MAC address of the device/client. This is used as the unique identifier and cannot be changed after creation. Must be a valid MAC address format (e.g., '00:11:22:33:44:55'). MAC addresses are case-insensitive.
     */
    readonly mac: pulumi.Output<string>;
    /**
     * A friendly name for the device/client. This helps identify the device in the UniFi interface (eg. 'Living Room TV', 'John's Laptop').
     */
    readonly name: pulumi.Output<string>;
    /**
     * The ID of the network this client should be associated with. This is particularly important when using VLANs or multiple networks.
     */
    readonly networkId: pulumi.Output<string | undefined>;
    /**
     * Additional information about the client that you want to record (e.g., 'Company asset tag #12345', 'Guest device - expires 2024-03-01').
     */
    readonly note: pulumi.Output<string | undefined>;
    /**
     * The name of the UniFi site where this user should be managed. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    readonly skipForgetOnDestroy: pulumi.Output<boolean | undefined>;
    /**
     * The ID of the user group this client belongs to. User groups can be used to apply common settings and restrictions to multiple clients.
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
     * Allow this resource to take over management of an existing user in the UniFi controller. When true:
     *   * The resource can manage users that were automatically created when devices connected
     *   * Existing settings will be overwritten with the values specified in this resource
     *   * If false, attempting to manage an existing user will result in an error
     *
     * Use with caution as it can modify settings for devices already connected to your network. Defaults to `true`.
     */
    allowExisting?: pulumi.Input<boolean>;
    /**
     * When true, this client will be blocked from accessing the network. Useful for temporarily or permanently restricting network access for specific devices.
     */
    blocked?: pulumi.Input<boolean>;
    /**
     * Override the device fingerprint.
     */
    devIdOverride?: pulumi.Input<number>;
    /**
     * A static IPv4 address to assign to this client. Ensure this IP is within the client's network range and not already assigned to another device.
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
     * A local DNS hostname for this client. When set, other devices on the network can resolve this name to the client's IP address (e.g., 'printer.local', 'nas.home.arpa'). Such DNS record is automatically added to controller's DNS records.
     */
    localDnsRecord?: pulumi.Input<string>;
    /**
     * The MAC address of the device/client. This is used as the unique identifier and cannot be changed after creation. Must be a valid MAC address format (e.g., '00:11:22:33:44:55'). MAC addresses are case-insensitive.
     */
    mac?: pulumi.Input<string>;
    /**
     * A friendly name for the device/client. This helps identify the device in the UniFi interface (eg. 'Living Room TV', 'John's Laptop').
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of the network this client should be associated with. This is particularly important when using VLANs or multiple networks.
     */
    networkId?: pulumi.Input<string>;
    /**
     * Additional information about the client that you want to record (e.g., 'Company asset tag #12345', 'Guest device - expires 2024-03-01').
     */
    note?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this user should be managed. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    skipForgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * The ID of the user group this client belongs to. User groups can be used to apply common settings and restrictions to multiple clients.
     */
    userGroupId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a User resource.
 */
export interface UserArgs {
    /**
     * Allow this resource to take over management of an existing user in the UniFi controller. When true:
     *   * The resource can manage users that were automatically created when devices connected
     *   * Existing settings will be overwritten with the values specified in this resource
     *   * If false, attempting to manage an existing user will result in an error
     *
     * Use with caution as it can modify settings for devices already connected to your network. Defaults to `true`.
     */
    allowExisting?: pulumi.Input<boolean>;
    /**
     * When true, this client will be blocked from accessing the network. Useful for temporarily or permanently restricting network access for specific devices.
     */
    blocked?: pulumi.Input<boolean>;
    /**
     * Override the device fingerprint.
     */
    devIdOverride?: pulumi.Input<number>;
    /**
     * A static IPv4 address to assign to this client. Ensure this IP is within the client's network range and not already assigned to another device.
     */
    fixedIp?: pulumi.Input<string>;
    /**
     * A local DNS hostname for this client. When set, other devices on the network can resolve this name to the client's IP address (e.g., 'printer.local', 'nas.home.arpa'). Such DNS record is automatically added to controller's DNS records.
     */
    localDnsRecord?: pulumi.Input<string>;
    /**
     * The MAC address of the device/client. This is used as the unique identifier and cannot be changed after creation. Must be a valid MAC address format (e.g., '00:11:22:33:44:55'). MAC addresses are case-insensitive.
     */
    mac: pulumi.Input<string>;
    /**
     * A friendly name for the device/client. This helps identify the device in the UniFi interface (eg. 'Living Room TV', 'John's Laptop').
     */
    name?: pulumi.Input<string>;
    /**
     * The ID of the network this client should be associated with. This is particularly important when using VLANs or multiple networks.
     */
    networkId?: pulumi.Input<string>;
    /**
     * Additional information about the client that you want to record (e.g., 'Company asset tag #12345', 'Guest device - expires 2024-03-01').
     */
    note?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this user should be managed. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    skipForgetOnDestroy?: pulumi.Input<boolean>;
    /**
     * The ID of the user group this client belongs to. User groups can be used to apply common settings and restrictions to multiple clients.
     */
    userGroupId?: pulumi.Input<string>;
}

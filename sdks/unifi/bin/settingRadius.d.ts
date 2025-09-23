import * as pulumi from "@pulumi/pulumi";
export declare class SettingRadius extends pulumi.CustomResource {
    /**
     * Get an existing SettingRadius resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingRadiusState, opts?: pulumi.CustomResourceOptions): SettingRadius;
    /**
     * Returns true if the given object is an instance of SettingRadius.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingRadius;
    /**
     * Enable RADIUS accounting to track user sessions, including connection time, data usage, and other metrics. This information can be useful for billing, capacity planning, and security auditing. Defaults to `false`.
     */
    readonly accountingEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The UDP port number for RADIUS accounting communications. The standard port is 1813. Only change this if you need to avoid port conflicts or match specific network requirements. Defaults to `1813`.
     */
    readonly accountingPort: pulumi.Output<number | undefined>;
    /**
     * The UDP port number for RADIUS authentication communications. The standard port is 1812. Only change this if you need to avoid port conflicts or match specific network requirements. Defaults to `1812`.
     */
    readonly authPort: pulumi.Output<number | undefined>;
    /**
     * Enable or disable the built-in RADIUS server. When disabled, no RADIUS authentication or accounting services will be provided, affecting any network services that rely on RADIUS (like WPA2-Enterprise networks). Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * The interval (in seconds) at which the RADIUS server collects and updates statistics from connected clients. Default is 3600 seconds (1 hour). Lower values provide more frequent updates but increase server load. Defaults to `3600`.
     */
    readonly interimUpdateInterval: pulumi.Output<number | undefined>;
    /**
     * The shared secret passphrase used to authenticate RADIUS clients (like wireless access points) with the RADIUS server. This should be a strong, random string known only to the server and its clients. Defaults to ``.
     */
    readonly secret: pulumi.Output<string | undefined>;
    /**
     * The name of the UniFi site where these RADIUS settings should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Enable encrypted communication between the RADIUS server and clients using RADIUS tunneling. This adds an extra layer of security by protecting RADIUS attributes in transit. Defaults to `true`.
     */
    readonly tunneledReply: pulumi.Output<boolean | undefined>;
    /**
     * Create a SettingRadius resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingRadiusArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingRadius resources.
 */
export interface SettingRadiusState {
    /**
     * Enable RADIUS accounting to track user sessions, including connection time, data usage, and other metrics. This information can be useful for billing, capacity planning, and security auditing. Defaults to `false`.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * The UDP port number for RADIUS accounting communications. The standard port is 1813. Only change this if you need to avoid port conflicts or match specific network requirements. Defaults to `1813`.
     */
    accountingPort?: pulumi.Input<number>;
    /**
     * The UDP port number for RADIUS authentication communications. The standard port is 1812. Only change this if you need to avoid port conflicts or match specific network requirements. Defaults to `1812`.
     */
    authPort?: pulumi.Input<number>;
    /**
     * Enable or disable the built-in RADIUS server. When disabled, no RADIUS authentication or accounting services will be provided, affecting any network services that rely on RADIUS (like WPA2-Enterprise networks). Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The interval (in seconds) at which the RADIUS server collects and updates statistics from connected clients. Default is 3600 seconds (1 hour). Lower values provide more frequent updates but increase server load. Defaults to `3600`.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * The shared secret passphrase used to authenticate RADIUS clients (like wireless access points) with the RADIUS server. This should be a strong, random string known only to the server and its clients. Defaults to ``.
     */
    secret?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where these RADIUS settings should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable encrypted communication between the RADIUS server and clients using RADIUS tunneling. This adds an extra layer of security by protecting RADIUS attributes in transit. Defaults to `true`.
     */
    tunneledReply?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingRadius resource.
 */
export interface SettingRadiusArgs {
    /**
     * Enable RADIUS accounting to track user sessions, including connection time, data usage, and other metrics. This information can be useful for billing, capacity planning, and security auditing. Defaults to `false`.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * The UDP port number for RADIUS accounting communications. The standard port is 1813. Only change this if you need to avoid port conflicts or match specific network requirements. Defaults to `1813`.
     */
    accountingPort?: pulumi.Input<number>;
    /**
     * The UDP port number for RADIUS authentication communications. The standard port is 1812. Only change this if you need to avoid port conflicts or match specific network requirements. Defaults to `1812`.
     */
    authPort?: pulumi.Input<number>;
    /**
     * Enable or disable the built-in RADIUS server. When disabled, no RADIUS authentication or accounting services will be provided, affecting any network services that rely on RADIUS (like WPA2-Enterprise networks). Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * The interval (in seconds) at which the RADIUS server collects and updates statistics from connected clients. Default is 3600 seconds (1 hour). Lower values provide more frequent updates but increase server load. Defaults to `3600`.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * The shared secret passphrase used to authenticate RADIUS clients (like wireless access points) with the RADIUS server. This should be a strong, random string known only to the server and its clients. Defaults to ``.
     */
    secret?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where these RADIUS settings should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Enable encrypted communication between the RADIUS server and clients using RADIUS tunneling. This adds an extra layer of security by protecting RADIUS attributes in transit. Defaults to `true`.
     */
    tunneledReply?: pulumi.Input<boolean>;
}

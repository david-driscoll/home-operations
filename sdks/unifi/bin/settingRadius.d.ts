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
     * Enable RADIUS accounting Defaults to `false`.
     */
    readonly accountingEnabled: pulumi.Output<boolean | undefined>;
    /**
     * The port for accounting communications. Defaults to `1813`.
     */
    readonly accountingPort: pulumi.Output<number | undefined>;
    /**
     * The port for authentication communications. Defaults to `1812`.
     */
    readonly authPort: pulumi.Output<number | undefined>;
    /**
     * RAIDUS server enabled. Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * Statistics will be collected from connected clients at this interval. Defaults to `3600`.
     */
    readonly interimUpdateInterval: pulumi.Output<number | undefined>;
    /**
     * RAIDUS secret passphrase. Defaults to ``.
     */
    readonly secret: pulumi.Output<string | undefined>;
    /**
     * The name of the site to associate the settings with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Encrypt communication between the server and the client. Defaults to `true`.
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
     * Enable RADIUS accounting Defaults to `false`.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * The port for accounting communications. Defaults to `1813`.
     */
    accountingPort?: pulumi.Input<number>;
    /**
     * The port for authentication communications. Defaults to `1812`.
     */
    authPort?: pulumi.Input<number>;
    /**
     * RAIDUS server enabled. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Statistics will be collected from connected clients at this interval. Defaults to `3600`.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * RAIDUS secret passphrase. Defaults to ``.
     */
    secret?: pulumi.Input<string>;
    /**
     * The name of the site to associate the settings with.
     */
    site?: pulumi.Input<string>;
    /**
     * Encrypt communication between the server and the client. Defaults to `true`.
     */
    tunneledReply?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingRadius resource.
 */
export interface SettingRadiusArgs {
    /**
     * Enable RADIUS accounting Defaults to `false`.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * The port for accounting communications. Defaults to `1813`.
     */
    accountingPort?: pulumi.Input<number>;
    /**
     * The port for authentication communications. Defaults to `1812`.
     */
    authPort?: pulumi.Input<number>;
    /**
     * RAIDUS server enabled. Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Statistics will be collected from connected clients at this interval. Defaults to `3600`.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * RAIDUS secret passphrase. Defaults to ``.
     */
    secret?: pulumi.Input<string>;
    /**
     * The name of the site to associate the settings with.
     */
    site?: pulumi.Input<string>;
    /**
     * Encrypt communication between the server and the client. Defaults to `true`.
     */
    tunneledReply?: pulumi.Input<boolean>;
}

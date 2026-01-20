import * as pulumi from "@pulumi/pulumi";
export declare class SystemSettings extends pulumi.CustomResource {
    /**
     * Get an existing SystemSettings resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SystemSettingsState, opts?: pulumi.CustomResourceOptions): SystemSettings;
    /**
     * Returns true if the given object is an instance of SystemSettings.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SystemSettings;
    /**
     * Defaults to `gravatar,initials`.
     */
    readonly avatars: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    readonly defaultTokenDuration: pulumi.Output<string | undefined>;
    /**
     * Defaults to `60`.
     */
    readonly defaultTokenLength: pulumi.Output<number | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly defaultUserChangeEmail: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly defaultUserChangeName: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly defaultUserChangeUsername: pulumi.Output<boolean | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=365`.
     */
    readonly eventRetention: pulumi.Output<string | undefined>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{"flows_refresh_others":false,"policies_buffered_access_view":false}`.
     */
    readonly flags: pulumi.Output<string | undefined>;
    readonly footerLinks: pulumi.Output<{
        [key: string]: string;
    }[] | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly gdprCompliance: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly impersonation: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `20`.
     */
    readonly paginationDefaultPageSize: pulumi.Output<number | undefined>;
    /**
     * Defaults to `100`.
     */
    readonly paginationMaxPageSize: pulumi.Output<number | undefined>;
    /**
     * Defaults to `-5`.
     */
    readonly reputationLowerLimit: pulumi.Output<number | undefined>;
    /**
     * Defaults to `5`.
     */
    readonly reputationUpperLimit: pulumi.Output<number | undefined>;
    readonly systemSettingsId: pulumi.Output<string>;
    /**
     * Create a SystemSettings resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SystemSettingsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SystemSettings resources.
 */
export interface SystemSettingsState {
    /**
     * Defaults to `gravatar,initials`.
     */
    avatars?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    defaultTokenDuration?: pulumi.Input<string>;
    /**
     * Defaults to `60`.
     */
    defaultTokenLength?: pulumi.Input<number>;
    /**
     * Defaults to `false`.
     */
    defaultUserChangeEmail?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    defaultUserChangeName?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    defaultUserChangeUsername?: pulumi.Input<boolean>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=365`.
     */
    eventRetention?: pulumi.Input<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{"flows_refresh_others":false,"policies_buffered_access_view":false}`.
     */
    flags?: pulumi.Input<string>;
    footerLinks?: pulumi.Input<pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>[]>;
    /**
     * Defaults to `true`.
     */
    gdprCompliance?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    impersonation?: pulumi.Input<boolean>;
    /**
     * Defaults to `20`.
     */
    paginationDefaultPageSize?: pulumi.Input<number>;
    /**
     * Defaults to `100`.
     */
    paginationMaxPageSize?: pulumi.Input<number>;
    /**
     * Defaults to `-5`.
     */
    reputationLowerLimit?: pulumi.Input<number>;
    /**
     * Defaults to `5`.
     */
    reputationUpperLimit?: pulumi.Input<number>;
    systemSettingsId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SystemSettings resource.
 */
export interface SystemSettingsArgs {
    /**
     * Defaults to `gravatar,initials`.
     */
    avatars?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    defaultTokenDuration?: pulumi.Input<string>;
    /**
     * Defaults to `60`.
     */
    defaultTokenLength?: pulumi.Input<number>;
    /**
     * Defaults to `false`.
     */
    defaultUserChangeEmail?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    defaultUserChangeName?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    defaultUserChangeUsername?: pulumi.Input<boolean>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=365`.
     */
    eventRetention?: pulumi.Input<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{"flows_refresh_others":false,"policies_buffered_access_view":false}`.
     */
    flags?: pulumi.Input<string>;
    footerLinks?: pulumi.Input<pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>[]>;
    /**
     * Defaults to `true`.
     */
    gdprCompliance?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    impersonation?: pulumi.Input<boolean>;
    /**
     * Defaults to `20`.
     */
    paginationDefaultPageSize?: pulumi.Input<number>;
    /**
     * Defaults to `100`.
     */
    paginationMaxPageSize?: pulumi.Input<number>;
    /**
     * Defaults to `-5`.
     */
    reputationLowerLimit?: pulumi.Input<number>;
    /**
     * Defaults to `5`.
     */
    reputationUpperLimit?: pulumi.Input<number>;
    systemSettingsId?: pulumi.Input<string>;
}

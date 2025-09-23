import * as pulumi from "@pulumi/pulumi";
export declare class StageUserLogin extends pulumi.CustomResource {
    /**
     * Get an existing StageUserLogin resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageUserLoginState, opts?: pulumi.CustomResourceOptions): StageUserLogin;
    /**
     * Returns true if the given object is an instance of StageUserLogin.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageUserLogin;
    /**
     * Allowed values:
     *   - `no_binding`
     *   - `bind_continent`
     *   - `bind_continent_country`
     *   - `bind_continent_country_city`
     *  Defaults to `no_binding`.
     */
    readonly geoipBinding: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `no_binding`
     *   - `bind_asn`
     *   - `bind_asn_network`
     *   - `bind_asn_network_ip`
     *  Defaults to `no_binding`.
     */
    readonly networkBinding: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    readonly rememberDevice: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    readonly rememberMeOffset: pulumi.Output<string | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    readonly sessionDuration: pulumi.Output<string | undefined>;
    readonly stageUserLoginId: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly terminateOtherSessions: pulumi.Output<boolean | undefined>;
    /**
     * Create a StageUserLogin resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageUserLoginArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageUserLogin resources.
 */
export interface StageUserLoginState {
    /**
     * Allowed values:
     *   - `no_binding`
     *   - `bind_continent`
     *   - `bind_continent_country`
     *   - `bind_continent_country_city`
     *  Defaults to `no_binding`.
     */
    geoipBinding?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `no_binding`
     *   - `bind_asn`
     *   - `bind_asn_network`
     *   - `bind_asn_network_ip`
     *  Defaults to `no_binding`.
     */
    networkBinding?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    rememberDevice?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    rememberMeOffset?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    sessionDuration?: pulumi.Input<string>;
    stageUserLoginId?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    terminateOtherSessions?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a StageUserLogin resource.
 */
export interface StageUserLoginArgs {
    /**
     * Allowed values:
     *   - `no_binding`
     *   - `bind_continent`
     *   - `bind_continent_country`
     *   - `bind_continent_country_city`
     *  Defaults to `no_binding`.
     */
    geoipBinding?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `no_binding`
     *   - `bind_asn`
     *   - `bind_asn_network`
     *   - `bind_asn_network_ip`
     *  Defaults to `no_binding`.
     */
    networkBinding?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `days=30`.
     */
    rememberDevice?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    rememberMeOffset?: pulumi.Input<string>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `seconds=0`.
     */
    sessionDuration?: pulumi.Input<string>;
    stageUserLoginId?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    terminateOtherSessions?: pulumi.Input<boolean>;
}

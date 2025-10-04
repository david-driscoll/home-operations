import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class Config extends pulumi.CustomResource {
    /**
     * Get an existing Config resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ConfigState, opts?: pulumi.CustomResourceOptions): Config;
    /**
     * Returns true if the given object is an instance of Config.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Config;
    /**
     * Set of services to be blocked globally
     */
    readonly blockedServices: pulumi.Output<string[]>;
    /**
     * Sets periods of inactivity for filtering blocked services. The schedule contains 7 days (Sunday to Saturday) and a time zone.
     */
    readonly blockedServicesPauseSchedule: pulumi.Output<outputs.ConfigBlockedServicesPauseSchedule>;
    readonly dhcp: pulumi.Output<outputs.ConfigDhcp>;
    readonly dns: pulumi.Output<outputs.ConfigDns>;
    readonly filtering: pulumi.Output<outputs.ConfigFiltering>;
    readonly lastUpdated: pulumi.Output<string>;
    /**
     * Whether Parental Control is enabled. Defaults to `false`
     */
    readonly parentalControl: pulumi.Output<boolean>;
    readonly querylog: pulumi.Output<outputs.ConfigQuerylog>;
    /**
     * Whether Safe Browsing is enabled. Defaults to `false`
     */
    readonly safebrowsing: pulumi.Output<boolean>;
    readonly safesearch: pulumi.Output<outputs.ConfigSafesearch>;
    readonly stats: pulumi.Output<outputs.ConfigStats>;
    readonly tls: pulumi.Output<outputs.ConfigTls>;
    /**
     * Create a Config resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: ConfigArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Config resources.
 */
export interface ConfigState {
    /**
     * Set of services to be blocked globally
     */
    blockedServices?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Sets periods of inactivity for filtering blocked services. The schedule contains 7 days (Sunday to Saturday) and a time zone.
     */
    blockedServicesPauseSchedule?: pulumi.Input<inputs.ConfigBlockedServicesPauseSchedule>;
    dhcp?: pulumi.Input<inputs.ConfigDhcp>;
    dns?: pulumi.Input<inputs.ConfigDns>;
    filtering?: pulumi.Input<inputs.ConfigFiltering>;
    lastUpdated?: pulumi.Input<string>;
    /**
     * Whether Parental Control is enabled. Defaults to `false`
     */
    parentalControl?: pulumi.Input<boolean>;
    querylog?: pulumi.Input<inputs.ConfigQuerylog>;
    /**
     * Whether Safe Browsing is enabled. Defaults to `false`
     */
    safebrowsing?: pulumi.Input<boolean>;
    safesearch?: pulumi.Input<inputs.ConfigSafesearch>;
    stats?: pulumi.Input<inputs.ConfigStats>;
    tls?: pulumi.Input<inputs.ConfigTls>;
}
/**
 * The set of arguments for constructing a Config resource.
 */
export interface ConfigArgs {
    /**
     * Set of services to be blocked globally
     */
    blockedServices?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Sets periods of inactivity for filtering blocked services. The schedule contains 7 days (Sunday to Saturday) and a time zone.
     */
    blockedServicesPauseSchedule?: pulumi.Input<inputs.ConfigBlockedServicesPauseSchedule>;
    dhcp?: pulumi.Input<inputs.ConfigDhcp>;
    dns?: pulumi.Input<inputs.ConfigDns>;
    filtering?: pulumi.Input<inputs.ConfigFiltering>;
    /**
     * Whether Parental Control is enabled. Defaults to `false`
     */
    parentalControl?: pulumi.Input<boolean>;
    querylog?: pulumi.Input<inputs.ConfigQuerylog>;
    /**
     * Whether Safe Browsing is enabled. Defaults to `false`
     */
    safebrowsing?: pulumi.Input<boolean>;
    safesearch?: pulumi.Input<inputs.ConfigSafesearch>;
    stats?: pulumi.Input<inputs.ConfigStats>;
    tls?: pulumi.Input<inputs.ConfigTls>;
}

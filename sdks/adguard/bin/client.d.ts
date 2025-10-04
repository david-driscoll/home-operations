import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class Client extends pulumi.CustomResource {
    /**
     * Get an existing Client resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ClientState, opts?: pulumi.CustomResourceOptions): Client;
    /**
     * Returns true if the given object is an instance of Client.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Client;
    /**
     * Set of blocked services for this client
     */
    readonly blockedServices: pulumi.Output<string[] | undefined>;
    /**
     * Sets periods of inactivity for filtering blocked services. The schedule contains 7 days (Sunday to Saturday) and a time zone.
     */
    readonly blockedServicesPauseSchedule: pulumi.Output<outputs.ClientBlockedServicesPauseSchedule>;
    /**
     * Whether to have filtering enabled on this client. Defaults to `false`
     */
    readonly filteringEnabled: pulumi.Output<boolean>;
    /**
     * Set of identifiers for this client (IP, CIDR, MAC, or ClientID)
     */
    readonly ids: pulumi.Output<string[]>;
    /**
     * Whether to write to the query log. Defaults to `false`
     */
    readonly ignoreQuerylog: pulumi.Output<boolean>;
    /**
     * Whether to be included in the statistics. Defaults to `false`
     */
    readonly ignoreStatistics: pulumi.Output<boolean>;
    readonly lastUpdated: pulumi.Output<string>;
    /**
     * Name of the client
     */
    readonly name: pulumi.Output<string>;
    /**
     * Whether to have AdGuard parental controls enabled on this client. Defaults to `false`
     */
    readonly parentalEnabled: pulumi.Output<boolean>;
    /**
     * Whether to have AdGuard browsing security enabled on this client. Defaults to `false`
     */
    readonly safebrowsingEnabled: pulumi.Output<boolean>;
    readonly safesearch: pulumi.Output<outputs.ClientSafesearch>;
    /**
     * Set of tags for this client
     */
    readonly tags: pulumi.Output<string[] | undefined>;
    /**
     * List of upstream DNS server for this client
     */
    readonly upstreams: pulumi.Output<string[] | undefined>;
    /**
     * Whether to enable DNS caching for this client's custom upstream configuration. Defaults to `false`
     */
    readonly upstreamsCacheEnabled: pulumi.Output<boolean>;
    /**
     * The upstreams DNS cache size, in bytes
     */
    readonly upstreamsCacheSize: pulumi.Output<number>;
    /**
     * Whether to use global settings for blocked services. Defaults to `true`
     */
    readonly useGlobalBlockedServices: pulumi.Output<boolean>;
    /**
     * Whether to use global settings on this client. Defaults to `true`
     */
    readonly useGlobalSettings: pulumi.Output<boolean>;
    /**
     * Create a Client resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ClientArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Client resources.
 */
export interface ClientState {
    /**
     * Set of blocked services for this client
     */
    blockedServices?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Sets periods of inactivity for filtering blocked services. The schedule contains 7 days (Sunday to Saturday) and a time zone.
     */
    blockedServicesPauseSchedule?: pulumi.Input<inputs.ClientBlockedServicesPauseSchedule>;
    /**
     * Whether to have filtering enabled on this client. Defaults to `false`
     */
    filteringEnabled?: pulumi.Input<boolean>;
    /**
     * Set of identifiers for this client (IP, CIDR, MAC, or ClientID)
     */
    ids?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether to write to the query log. Defaults to `false`
     */
    ignoreQuerylog?: pulumi.Input<boolean>;
    /**
     * Whether to be included in the statistics. Defaults to `false`
     */
    ignoreStatistics?: pulumi.Input<boolean>;
    lastUpdated?: pulumi.Input<string>;
    /**
     * Name of the client
     */
    name?: pulumi.Input<string>;
    /**
     * Whether to have AdGuard parental controls enabled on this client. Defaults to `false`
     */
    parentalEnabled?: pulumi.Input<boolean>;
    /**
     * Whether to have AdGuard browsing security enabled on this client. Defaults to `false`
     */
    safebrowsingEnabled?: pulumi.Input<boolean>;
    safesearch?: pulumi.Input<inputs.ClientSafesearch>;
    /**
     * Set of tags for this client
     */
    tags?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * List of upstream DNS server for this client
     */
    upstreams?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether to enable DNS caching for this client's custom upstream configuration. Defaults to `false`
     */
    upstreamsCacheEnabled?: pulumi.Input<boolean>;
    /**
     * The upstreams DNS cache size, in bytes
     */
    upstreamsCacheSize?: pulumi.Input<number>;
    /**
     * Whether to use global settings for blocked services. Defaults to `true`
     */
    useGlobalBlockedServices?: pulumi.Input<boolean>;
    /**
     * Whether to use global settings on this client. Defaults to `true`
     */
    useGlobalSettings?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a Client resource.
 */
export interface ClientArgs {
    /**
     * Set of blocked services for this client
     */
    blockedServices?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Sets periods of inactivity for filtering blocked services. The schedule contains 7 days (Sunday to Saturday) and a time zone.
     */
    blockedServicesPauseSchedule?: pulumi.Input<inputs.ClientBlockedServicesPauseSchedule>;
    /**
     * Whether to have filtering enabled on this client. Defaults to `false`
     */
    filteringEnabled?: pulumi.Input<boolean>;
    /**
     * Set of identifiers for this client (IP, CIDR, MAC, or ClientID)
     */
    ids: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether to write to the query log. Defaults to `false`
     */
    ignoreQuerylog?: pulumi.Input<boolean>;
    /**
     * Whether to be included in the statistics. Defaults to `false`
     */
    ignoreStatistics?: pulumi.Input<boolean>;
    /**
     * Name of the client
     */
    name?: pulumi.Input<string>;
    /**
     * Whether to have AdGuard parental controls enabled on this client. Defaults to `false`
     */
    parentalEnabled?: pulumi.Input<boolean>;
    /**
     * Whether to have AdGuard browsing security enabled on this client. Defaults to `false`
     */
    safebrowsingEnabled?: pulumi.Input<boolean>;
    safesearch?: pulumi.Input<inputs.ClientSafesearch>;
    /**
     * Set of tags for this client
     */
    tags?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * List of upstream DNS server for this client
     */
    upstreams?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Whether to enable DNS caching for this client's custom upstream configuration. Defaults to `false`
     */
    upstreamsCacheEnabled?: pulumi.Input<boolean>;
    /**
     * The upstreams DNS cache size, in bytes
     */
    upstreamsCacheSize?: pulumi.Input<number>;
    /**
     * Whether to use global settings for blocked services. Defaults to `true`
     */
    useGlobalBlockedServices?: pulumi.Input<boolean>;
    /**
     * Whether to use global settings on this client. Defaults to `true`
     */
    useGlobalSettings?: pulumi.Input<boolean>;
}

import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class DynamicDns extends pulumi.CustomResource {
    /**
     * Get an existing DynamicDns resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: DynamicDnsState, opts?: pulumi.CustomResourceOptions): DynamicDns;
    /**
     * Returns true if the given object is an instance of DynamicDns.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is DynamicDns;
    /**
     * The host name to update in the dynamic DNS service.
     */
    readonly hostName: pulumi.Output<string>;
    /**
     * The interface for the dynamic DNS. Can be `wan` or `wan2`.
     */
    readonly interface: pulumi.Output<string>;
    /**
     * The login for the dynamic DNS service.
     */
    readonly login: pulumi.Output<string | undefined>;
    /**
     * The password for the dynamic DNS service.
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * The server for the dynamic DNS service.
     */
    readonly server: pulumi.Output<string | undefined>;
    /**
     * The Dynamic DNS service provider, various values are supported (for example `dyndns`, etc.).
     */
    readonly service: pulumi.Output<string>;
    /**
     * The name of the site to associate with the dynamic DNS resource.
     */
    readonly site: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.DynamicDnsTimeouts | undefined>;
    /**
     * Create a DynamicDns resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: DynamicDnsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering DynamicDns resources.
 */
export interface DynamicDnsState {
    /**
     * The host name to update in the dynamic DNS service.
     */
    hostName?: pulumi.Input<string | undefined>;
    /**
     * The interface for the dynamic DNS. Can be `wan` or `wan2`.
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * The login for the dynamic DNS service.
     */
    login?: pulumi.Input<string | undefined>;
    /**
     * The password for the dynamic DNS service.
     */
    password?: pulumi.Input<string | undefined>;
    /**
     * The server for the dynamic DNS service.
     */
    server?: pulumi.Input<string | undefined>;
    /**
     * The Dynamic DNS service provider, various values are supported (for example `dyndns`, etc.).
     */
    service?: pulumi.Input<string | undefined>;
    /**
     * The name of the site to associate with the dynamic DNS resource.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.DynamicDnsTimeouts | undefined>;
}
/**
 * The set of arguments for constructing a DynamicDns resource.
 */
export interface DynamicDnsArgs {
    /**
     * The host name to update in the dynamic DNS service.
     */
    hostName: pulumi.Input<string>;
    /**
     * The interface for the dynamic DNS. Can be `wan` or `wan2`.
     */
    interface?: pulumi.Input<string | undefined>;
    /**
     * The login for the dynamic DNS service.
     */
    login?: pulumi.Input<string | undefined>;
    /**
     * The password for the dynamic DNS service.
     */
    password?: pulumi.Input<string | undefined>;
    /**
     * The server for the dynamic DNS service.
     */
    server?: pulumi.Input<string | undefined>;
    /**
     * The Dynamic DNS service provider, various values are supported (for example `dyndns`, etc.).
     */
    service: pulumi.Input<string>;
    /**
     * The name of the site to associate with the dynamic DNS resource.
     */
    site?: pulumi.Input<string | undefined>;
    timeouts?: pulumi.Input<inputs.DynamicDnsTimeouts | undefined>;
}
//# sourceMappingURL=dynamicDns.d.ts.map
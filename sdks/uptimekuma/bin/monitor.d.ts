import * as pulumi from "@pulumi/pulumi";
export declare class Monitor extends pulumi.CustomResource {
    /**
     * Get an existing Monitor resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: MonitorState, opts?: pulumi.CustomResourceOptions): Monitor;
    /**
     * Returns true if the given object is an instance of Monitor.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Monitor;
    /**
     * Authentication method (basic, ntlm, mtls).
     */
    readonly authMethod: pulumi.Output<string | undefined>;
    /**
     * Basic auth password.
     */
    readonly basicAuthPass: pulumi.Output<string | undefined>;
    /**
     * Basic auth username.
     */
    readonly basicAuthUser: pulumi.Output<string | undefined>;
    /**
     * Request body for http monitors.
     */
    readonly body: pulumi.Output<string | undefined>;
    /**
     * Monitor description.
     */
    readonly description: pulumi.Output<string>;
    /**
     * Request headers for http monitors (JSON format).
     */
    readonly headers: pulumi.Output<string | undefined>;
    /**
     * Hostname for ping, port, etc. monitors.
     */
    readonly hostname: pulumi.Output<string | undefined>;
    /**
     * Ignore TLS/SSL errors.
     */
    readonly ignoreTls: pulumi.Output<boolean | undefined>;
    /**
     * Check interval in seconds.
     */
    readonly interval: pulumi.Output<number>;
    /**
     * Keyword to search for in response.
     */
    readonly keyword: pulumi.Output<string | undefined>;
    /**
     * Maximum number of redirects to follow.
     */
    readonly maxRedirects: pulumi.Output<number | undefined>;
    /**
     * Maximum number of retries.
     */
    readonly maxRetries: pulumi.Output<number>;
    /**
     * HTTP method (GET, POST, etc.) for http monitors.
     */
    readonly method: pulumi.Output<string | undefined>;
    /**
     * Monitor identifier.
     */
    readonly monitorId: pulumi.Output<number>;
    /**
     * Monitor name.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Port number for port monitors.
     */
    readonly port: pulumi.Output<number | undefined>;
    /**
     * Notification resend interval in seconds.
     */
    readonly resendInterval: pulumi.Output<number>;
    /**
     * Retry interval in seconds.
     */
    readonly retryInterval: pulumi.Output<number>;
    /**
     * Monitor type (http, ping, port, etc.).
     */
    readonly type: pulumi.Output<string>;
    /**
     * Invert status (treat DOWN as UP and vice versa).
     */
    readonly upsideDown: pulumi.Output<boolean | undefined>;
    /**
     * URL to monitor (required for http, keyword monitors).
     */
    readonly url: pulumi.Output<string | undefined>;
    /**
     * Create a Monitor resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: MonitorArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Monitor resources.
 */
export interface MonitorState {
    /**
     * Authentication method (basic, ntlm, mtls).
     */
    authMethod?: pulumi.Input<string>;
    /**
     * Basic auth password.
     */
    basicAuthPass?: pulumi.Input<string>;
    /**
     * Basic auth username.
     */
    basicAuthUser?: pulumi.Input<string>;
    /**
     * Request body for http monitors.
     */
    body?: pulumi.Input<string>;
    /**
     * Monitor description.
     */
    description?: pulumi.Input<string>;
    /**
     * Request headers for http monitors (JSON format).
     */
    headers?: pulumi.Input<string>;
    /**
     * Hostname for ping, port, etc. monitors.
     */
    hostname?: pulumi.Input<string>;
    /**
     * Ignore TLS/SSL errors.
     */
    ignoreTls?: pulumi.Input<boolean>;
    /**
     * Check interval in seconds.
     */
    interval?: pulumi.Input<number>;
    /**
     * Keyword to search for in response.
     */
    keyword?: pulumi.Input<string>;
    /**
     * Maximum number of redirects to follow.
     */
    maxRedirects?: pulumi.Input<number>;
    /**
     * Maximum number of retries.
     */
    maxRetries?: pulumi.Input<number>;
    /**
     * HTTP method (GET, POST, etc.) for http monitors.
     */
    method?: pulumi.Input<string>;
    /**
     * Monitor identifier.
     */
    monitorId?: pulumi.Input<number>;
    /**
     * Monitor name.
     */
    name?: pulumi.Input<string>;
    /**
     * Port number for port monitors.
     */
    port?: pulumi.Input<number>;
    /**
     * Notification resend interval in seconds.
     */
    resendInterval?: pulumi.Input<number>;
    /**
     * Retry interval in seconds.
     */
    retryInterval?: pulumi.Input<number>;
    /**
     * Monitor type (http, ping, port, etc.).
     */
    type?: pulumi.Input<string>;
    /**
     * Invert status (treat DOWN as UP and vice versa).
     */
    upsideDown?: pulumi.Input<boolean>;
    /**
     * URL to monitor (required for http, keyword monitors).
     */
    url?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Monitor resource.
 */
export interface MonitorArgs {
    /**
     * Authentication method (basic, ntlm, mtls).
     */
    authMethod?: pulumi.Input<string>;
    /**
     * Basic auth password.
     */
    basicAuthPass?: pulumi.Input<string>;
    /**
     * Basic auth username.
     */
    basicAuthUser?: pulumi.Input<string>;
    /**
     * Request body for http monitors.
     */
    body?: pulumi.Input<string>;
    /**
     * Monitor description.
     */
    description: pulumi.Input<string>;
    /**
     * Request headers for http monitors (JSON format).
     */
    headers?: pulumi.Input<string>;
    /**
     * Hostname for ping, port, etc. monitors.
     */
    hostname?: pulumi.Input<string>;
    /**
     * Ignore TLS/SSL errors.
     */
    ignoreTls?: pulumi.Input<boolean>;
    /**
     * Check interval in seconds.
     */
    interval?: pulumi.Input<number>;
    /**
     * Keyword to search for in response.
     */
    keyword?: pulumi.Input<string>;
    /**
     * Maximum number of redirects to follow.
     */
    maxRedirects?: pulumi.Input<number>;
    /**
     * Maximum number of retries.
     */
    maxRetries?: pulumi.Input<number>;
    /**
     * HTTP method (GET, POST, etc.) for http monitors.
     */
    method?: pulumi.Input<string>;
    /**
     * Monitor name.
     */
    name?: pulumi.Input<string>;
    /**
     * Port number for port monitors.
     */
    port?: pulumi.Input<number>;
    /**
     * Notification resend interval in seconds.
     */
    resendInterval?: pulumi.Input<number>;
    /**
     * Retry interval in seconds.
     */
    retryInterval?: pulumi.Input<number>;
    /**
     * Monitor type (http, ping, port, etc.).
     */
    type: pulumi.Input<string>;
    /**
     * Invert status (treat DOWN as UP and vice versa).
     */
    upsideDown?: pulumi.Input<boolean>;
    /**
     * URL to monitor (required for http, keyword monitors).
     */
    url?: pulumi.Input<string>;
}

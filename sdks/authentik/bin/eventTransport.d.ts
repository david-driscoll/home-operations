import * as pulumi from "@pulumi/pulumi";
export declare class EventTransport extends pulumi.CustomResource {
    /**
     * Get an existing EventTransport resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: EventTransportState, opts?: pulumi.CustomResourceOptions): EventTransport;
    /**
     * Returns true if the given object is an instance of EventTransport.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is EventTransport;
    /**
     * Defaults to `authentik Notification:`.
     */
    readonly emailSubjectPrefix: pulumi.Output<string | undefined>;
    /**
     * Defaults to `email/event_notification.html`.
     */
    readonly emailTemplate: pulumi.Output<string | undefined>;
    readonly eventTransportId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `local`
     *   - `webhook`
     *   - `webhook_slack`
     *   - `email`
     */
    readonly mode: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly sendOnce: pulumi.Output<boolean | undefined>;
    readonly webhookMappingBody: pulumi.Output<string | undefined>;
    readonly webhookMappingHeaders: pulumi.Output<string | undefined>;
    readonly webhookUrl: pulumi.Output<string | undefined>;
    /**
     * Create a EventTransport resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: EventTransportArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering EventTransport resources.
 */
export interface EventTransportState {
    /**
     * Defaults to `authentik Notification:`.
     */
    emailSubjectPrefix?: pulumi.Input<string>;
    /**
     * Defaults to `email/event_notification.html`.
     */
    emailTemplate?: pulumi.Input<string>;
    eventTransportId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `local`
     *   - `webhook`
     *   - `webhook_slack`
     *   - `email`
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    sendOnce?: pulumi.Input<boolean>;
    webhookMappingBody?: pulumi.Input<string>;
    webhookMappingHeaders?: pulumi.Input<string>;
    webhookUrl?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a EventTransport resource.
 */
export interface EventTransportArgs {
    /**
     * Defaults to `authentik Notification:`.
     */
    emailSubjectPrefix?: pulumi.Input<string>;
    /**
     * Defaults to `email/event_notification.html`.
     */
    emailTemplate?: pulumi.Input<string>;
    eventTransportId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `local`
     *   - `webhook`
     *   - `webhook_slack`
     *   - `email`
     */
    mode: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    sendOnce?: pulumi.Input<boolean>;
    webhookMappingBody?: pulumi.Input<string>;
    webhookMappingHeaders?: pulumi.Input<string>;
    webhookUrl?: pulumi.Input<string>;
}

import * as pulumi from "@pulumi/pulumi";
export declare class Application extends pulumi.CustomResource {
    /**
     * Get an existing Application resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ApplicationState, opts?: pulumi.CustomResourceOptions): Application;
    /**
     * Returns true if the given object is an instance of Application.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Application;
    readonly applicationId: pulumi.Output<string>;
    readonly backchannelProviders: pulumi.Output<number[] | undefined>;
    readonly group: pulumi.Output<string | undefined>;
    readonly metaDescription: pulumi.Output<string | undefined>;
    readonly metaIcon: pulumi.Output<string | undefined>;
    readonly metaLaunchUrl: pulumi.Output<string | undefined>;
    readonly metaPublisher: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly openInNewTab: pulumi.Output<boolean | undefined>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    readonly protocolProvider: pulumi.Output<number | undefined>;
    readonly slug: pulumi.Output<string>;
    /**
     * Generated.
     */
    readonly uuid: pulumi.Output<string>;
    /**
     * Create a Application resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ApplicationArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Application resources.
 */
export interface ApplicationState {
    applicationId?: pulumi.Input<string>;
    backchannelProviders?: pulumi.Input<pulumi.Input<number>[]>;
    group?: pulumi.Input<string>;
    metaDescription?: pulumi.Input<string>;
    metaIcon?: pulumi.Input<string>;
    metaLaunchUrl?: pulumi.Input<string>;
    metaPublisher?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    openInNewTab?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    protocolProvider?: pulumi.Input<number>;
    slug?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a Application resource.
 */
export interface ApplicationArgs {
    applicationId?: pulumi.Input<string>;
    backchannelProviders?: pulumi.Input<pulumi.Input<number>[]>;
    group?: pulumi.Input<string>;
    metaDescription?: pulumi.Input<string>;
    metaIcon?: pulumi.Input<string>;
    metaLaunchUrl?: pulumi.Input<string>;
    metaPublisher?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    openInNewTab?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    protocolProvider?: pulumi.Input<number>;
    slug: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}

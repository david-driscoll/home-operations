import * as pulumi from "@pulumi/pulumi";
export declare class SourcePlex extends pulumi.CustomResource {
    /**
     * Get an existing SourcePlex resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SourcePlexState, opts?: pulumi.CustomResourceOptions): SourcePlex;
    /**
     * Returns true if the given object is an instance of SourcePlex.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SourcePlex;
    /**
     * Defaults to `true`.
     */
    readonly allowFriends: pulumi.Output<boolean | undefined>;
    readonly allowedServers: pulumi.Output<string[] | undefined>;
    readonly authenticationFlow: pulumi.Output<string | undefined>;
    readonly clientId: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    readonly enrollmentFlow: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    readonly groupMatchingMode: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly plexToken: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    readonly policyEngineMode: pulumi.Output<string | undefined>;
    readonly slug: pulumi.Output<string>;
    readonly sourcePlexId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `email_link`
     *   - `email_deny`
     *   - `username_link`
     *   - `username_deny`
     *  Defaults to `identifier`.
     */
    readonly userMatchingMode: pulumi.Output<string | undefined>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    readonly userPathTemplate: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly uuid: pulumi.Output<string>;
    /**
     * Create a SourcePlex resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SourcePlexArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SourcePlex resources.
 */
export interface SourcePlexState {
    /**
     * Defaults to `true`.
     */
    allowFriends?: pulumi.Input<boolean>;
    allowedServers?: pulumi.Input<pulumi.Input<string>[]>;
    authenticationFlow?: pulumi.Input<string>;
    clientId?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    enrollmentFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    groupMatchingMode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    plexToken?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
    sourcePlexId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `email_link`
     *   - `email_deny`
     *   - `username_link`
     *   - `username_deny`
     *  Defaults to `identifier`.
     */
    userMatchingMode?: pulumi.Input<string>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SourcePlex resource.
 */
export interface SourcePlexArgs {
    /**
     * Defaults to `true`.
     */
    allowFriends?: pulumi.Input<boolean>;
    allowedServers?: pulumi.Input<pulumi.Input<string>[]>;
    authenticationFlow?: pulumi.Input<string>;
    clientId: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    enrollmentFlow?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `name_link`
     *   - `name_deny`
     *  Defaults to `identifier`.
     */
    groupMatchingMode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    plexToken: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `all`
     *   - `any`
     *  Defaults to `any`.
     */
    policyEngineMode?: pulumi.Input<string>;
    slug: pulumi.Input<string>;
    sourcePlexId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `identifier`
     *   - `email_link`
     *   - `email_deny`
     *   - `username_link`
     *   - `username_deny`
     *  Defaults to `identifier`.
     */
    userMatchingMode?: pulumi.Input<string>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}

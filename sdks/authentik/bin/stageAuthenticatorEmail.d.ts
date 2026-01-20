import * as pulumi from "@pulumi/pulumi";
export declare class StageAuthenticatorEmail extends pulumi.CustomResource {
    /**
     * Get an existing StageAuthenticatorEmail resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageAuthenticatorEmailState, opts?: pulumi.CustomResourceOptions): StageAuthenticatorEmail;
    /**
     * Returns true if the given object is an instance of StageAuthenticatorEmail.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageAuthenticatorEmail;
    readonly configureFlow: pulumi.Output<string | undefined>;
    /**
     * Defaults to ``.
     */
    readonly friendlyName: pulumi.Output<string | undefined>;
    /**
     * Defaults to `system@authentik.local`.
     */
    readonly fromAddress: pulumi.Output<string | undefined>;
    /**
     * Defaults to `localhost`.
     */
    readonly host: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly password: pulumi.Output<string | undefined>;
    /**
     * Defaults to `25`.
     */
    readonly port: pulumi.Output<number | undefined>;
    readonly stageAuthenticatorEmailId: pulumi.Output<string>;
    /**
     * Defaults to `authentik`.
     */
    readonly subject: pulumi.Output<string | undefined>;
    /**
     * Defaults to `email/password_reset.html`.
     */
    readonly template: pulumi.Output<string | undefined>;
    /**
     * Defaults to `30`.
     */
    readonly timeout: pulumi.Output<number | undefined>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    readonly tokenExpiry: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly useGlobalSettings: pulumi.Output<boolean | undefined>;
    readonly useSsl: pulumi.Output<boolean | undefined>;
    readonly useTls: pulumi.Output<boolean | undefined>;
    readonly username: pulumi.Output<string | undefined>;
    /**
     * Create a StageAuthenticatorEmail resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageAuthenticatorEmailArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageAuthenticatorEmail resources.
 */
export interface StageAuthenticatorEmailState {
    configureFlow?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    friendlyName?: pulumi.Input<string>;
    /**
     * Defaults to `system@authentik.local`.
     */
    fromAddress?: pulumi.Input<string>;
    /**
     * Defaults to `localhost`.
     */
    host?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    password?: pulumi.Input<string>;
    /**
     * Defaults to `25`.
     */
    port?: pulumi.Input<number>;
    stageAuthenticatorEmailId?: pulumi.Input<string>;
    /**
     * Defaults to `authentik`.
     */
    subject?: pulumi.Input<string>;
    /**
     * Defaults to `email/password_reset.html`.
     */
    template?: pulumi.Input<string>;
    /**
     * Defaults to `30`.
     */
    timeout?: pulumi.Input<number>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    tokenExpiry?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    useGlobalSettings?: pulumi.Input<boolean>;
    useSsl?: pulumi.Input<boolean>;
    useTls?: pulumi.Input<boolean>;
    username?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageAuthenticatorEmail resource.
 */
export interface StageAuthenticatorEmailArgs {
    configureFlow?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    friendlyName?: pulumi.Input<string>;
    /**
     * Defaults to `system@authentik.local`.
     */
    fromAddress?: pulumi.Input<string>;
    /**
     * Defaults to `localhost`.
     */
    host?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    password?: pulumi.Input<string>;
    /**
     * Defaults to `25`.
     */
    port?: pulumi.Input<number>;
    stageAuthenticatorEmailId?: pulumi.Input<string>;
    /**
     * Defaults to `authentik`.
     */
    subject?: pulumi.Input<string>;
    /**
     * Defaults to `email/password_reset.html`.
     */
    template?: pulumi.Input<string>;
    /**
     * Defaults to `30`.
     */
    timeout?: pulumi.Input<number>;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `minutes=30`.
     */
    tokenExpiry?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    useGlobalSettings?: pulumi.Input<boolean>;
    useSsl?: pulumi.Input<boolean>;
    useTls?: pulumi.Input<boolean>;
    username?: pulumi.Input<string>;
}

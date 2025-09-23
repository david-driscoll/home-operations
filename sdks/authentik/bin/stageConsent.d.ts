import * as pulumi from "@pulumi/pulumi";
export declare class StageConsent extends pulumi.CustomResource {
    /**
     * Get an existing StageConsent resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageConsentState, opts?: pulumi.CustomResourceOptions): StageConsent;
    /**
     * Returns true if the given object is an instance of StageConsent.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageConsent;
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `weeks=4`.
     */
    readonly consentExpireIn: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `always_require`
     *   - `permanent`
     *   - `expiring`
     *  Defaults to `always_require`.
     */
    readonly mode: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageConsentId: pulumi.Output<string>;
    /**
     * Create a StageConsent resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageConsentArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageConsent resources.
 */
export interface StageConsentState {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `weeks=4`.
     */
    consentExpireIn?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `always_require`
     *   - `permanent`
     *   - `expiring`
     *  Defaults to `always_require`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageConsentId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageConsent resource.
 */
export interface StageConsentArgs {
    /**
     * Format: hours=1;minutes=2;seconds=3. Defaults to `weeks=4`.
     */
    consentExpireIn?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `always_require`
     *   - `permanent`
     *   - `expiring`
     *  Defaults to `always_require`.
     */
    mode?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageConsentId?: pulumi.Input<string>;
}

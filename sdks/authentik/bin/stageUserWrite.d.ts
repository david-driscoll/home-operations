import * as pulumi from "@pulumi/pulumi";
export declare class StageUserWrite extends pulumi.CustomResource {
    /**
     * Get an existing StageUserWrite resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StageUserWriteState, opts?: pulumi.CustomResourceOptions): StageUserWrite;
    /**
     * Returns true if the given object is an instance of StageUserWrite.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StageUserWrite;
    /**
     * Defaults to `true`.
     */
    readonly createUsersAsInactive: pulumi.Output<boolean | undefined>;
    readonly createUsersGroup: pulumi.Output<string | undefined>;
    readonly name: pulumi.Output<string>;
    readonly stageUserWriteId: pulumi.Output<string>;
    /**
     * Allowed values:
     *   - `never_create`
     *   - `create_when_required`
     *   - `always_create`
     *  Defaults to `create_when_required`.
     */
    readonly userCreationMode: pulumi.Output<string | undefined>;
    /**
     * Defaults to ``.
     */
    readonly userPathTemplate: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `internal`
     *   - `external`
     *   - `service_account`
     *  Defaults to `external`.
     */
    readonly userType: pulumi.Output<string | undefined>;
    /**
     * Create a StageUserWrite resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: StageUserWriteArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StageUserWrite resources.
 */
export interface StageUserWriteState {
    /**
     * Defaults to `true`.
     */
    createUsersAsInactive?: pulumi.Input<boolean>;
    createUsersGroup?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageUserWriteId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `never_create`
     *   - `create_when_required`
     *   - `always_create`
     *  Defaults to `create_when_required`.
     */
    userCreationMode?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `internal`
     *   - `external`
     *   - `service_account`
     *  Defaults to `external`.
     */
    userType?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StageUserWrite resource.
 */
export interface StageUserWriteArgs {
    /**
     * Defaults to `true`.
     */
    createUsersAsInactive?: pulumi.Input<boolean>;
    createUsersGroup?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    stageUserWriteId?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `never_create`
     *   - `create_when_required`
     *   - `always_create`
     *  Defaults to `create_when_required`.
     */
    userCreationMode?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `internal`
     *   - `external`
     *   - `service_account`
     *  Defaults to `external`.
     */
    userType?: pulumi.Input<string>;
}

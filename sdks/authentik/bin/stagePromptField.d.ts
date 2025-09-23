import * as pulumi from "@pulumi/pulumi";
export declare class StagePromptField extends pulumi.CustomResource {
    /**
     * Get an existing StagePromptField resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StagePromptFieldState, opts?: pulumi.CustomResourceOptions): StagePromptField;
    /**
     * Returns true if the given object is an instance of StagePromptField.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StagePromptField;
    readonly fieldKey: pulumi.Output<string>;
    readonly initialValue: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly initialValueExpression: pulumi.Output<boolean | undefined>;
    readonly label: pulumi.Output<string>;
    readonly name: pulumi.Output<string>;
    readonly order: pulumi.Output<number | undefined>;
    readonly placeholder: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly placeholderExpression: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly required: pulumi.Output<boolean | undefined>;
    readonly stagePromptFieldId: pulumi.Output<string>;
    /**
     * Defaults to ``.
     */
    readonly subText: pulumi.Output<string | undefined>;
    /**
     * Allowed values:
     *   - `text`
     *   - `text_area`
     *   - `text_read_only`
     *   - `text_area_read_only`
     *   - `username`
     *   - `email`
     *   - `password`
     *   - `number`
     *   - `checkbox`
     *   - `radio-button-group`
     *   - `dropdown`
     *   - `date`
     *   - `date-time`
     *   - `file`
     *   - `separator`
     *   - `hidden`
     *   - `static`
     *   - `ak-locale`
     */
    readonly type: pulumi.Output<string>;
    /**
     * Create a StagePromptField resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StagePromptFieldArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StagePromptField resources.
 */
export interface StagePromptFieldState {
    fieldKey?: pulumi.Input<string>;
    initialValue?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    initialValueExpression?: pulumi.Input<boolean>;
    label?: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    order?: pulumi.Input<number>;
    placeholder?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    placeholderExpression?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    required?: pulumi.Input<boolean>;
    stagePromptFieldId?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    subText?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `text`
     *   - `text_area`
     *   - `text_read_only`
     *   - `text_area_read_only`
     *   - `username`
     *   - `email`
     *   - `password`
     *   - `number`
     *   - `checkbox`
     *   - `radio-button-group`
     *   - `dropdown`
     *   - `date`
     *   - `date-time`
     *   - `file`
     *   - `separator`
     *   - `hidden`
     *   - `static`
     *   - `ak-locale`
     */
    type?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a StagePromptField resource.
 */
export interface StagePromptFieldArgs {
    fieldKey: pulumi.Input<string>;
    initialValue?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    initialValueExpression?: pulumi.Input<boolean>;
    label: pulumi.Input<string>;
    name?: pulumi.Input<string>;
    order?: pulumi.Input<number>;
    placeholder?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    placeholderExpression?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    required?: pulumi.Input<boolean>;
    stagePromptFieldId?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    subText?: pulumi.Input<string>;
    /**
     * Allowed values:
     *   - `text`
     *   - `text_area`
     *   - `text_read_only`
     *   - `text_area_read_only`
     *   - `username`
     *   - `email`
     *   - `password`
     *   - `number`
     *   - `checkbox`
     *   - `radio-button-group`
     *   - `dropdown`
     *   - `date`
     *   - `date-time`
     *   - `file`
     *   - `separator`
     *   - `hidden`
     *   - `static`
     *   - `ak-locale`
     */
    type: pulumi.Input<string>;
}

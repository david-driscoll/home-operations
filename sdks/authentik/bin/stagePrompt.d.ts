import * as pulumi from "@pulumi/pulumi";
export declare class StagePrompt extends pulumi.CustomResource {
    /**
     * Get an existing StagePrompt resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: StagePromptState, opts?: pulumi.CustomResourceOptions): StagePrompt;
    /**
     * Returns true if the given object is an instance of StagePrompt.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is StagePrompt;
    readonly fields: pulumi.Output<string[]>;
    readonly name: pulumi.Output<string>;
    readonly stagePromptId: pulumi.Output<string>;
    readonly validationPolicies: pulumi.Output<string[] | undefined>;
    /**
     * Create a StagePrompt resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: StagePromptArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering StagePrompt resources.
 */
export interface StagePromptState {
    fields?: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
    stagePromptId?: pulumi.Input<string>;
    validationPolicies?: pulumi.Input<pulumi.Input<string>[]>;
}
/**
 * The set of arguments for constructing a StagePrompt resource.
 */
export interface StagePromptArgs {
    fields: pulumi.Input<pulumi.Input<string>[]>;
    name?: pulumi.Input<string>;
    stagePromptId?: pulumi.Input<string>;
    validationPolicies?: pulumi.Input<pulumi.Input<string>[]>;
}

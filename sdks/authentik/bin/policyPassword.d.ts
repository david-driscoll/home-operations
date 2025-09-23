import * as pulumi from "@pulumi/pulumi";
export declare class PolicyPassword extends pulumi.CustomResource {
    /**
     * Get an existing PolicyPassword resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PolicyPasswordState, opts?: pulumi.CustomResourceOptions): PolicyPassword;
    /**
     * Returns true if the given object is an instance of PolicyPassword.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PolicyPassword;
    readonly amountDigits: pulumi.Output<number | undefined>;
    readonly amountLowercase: pulumi.Output<number | undefined>;
    readonly amountSymbols: pulumi.Output<number | undefined>;
    readonly amountUppercase: pulumi.Output<number | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly checkHaveIBeenPwned: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly checkStaticRules: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly checkZxcvbn: pulumi.Output<boolean | undefined>;
    readonly errorMessage: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly executionLogging: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `1`.
     */
    readonly hibpAllowedCount: pulumi.Output<number | undefined>;
    readonly lengthMin: pulumi.Output<number | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Defaults to `password`.
     */
    readonly passwordField: pulumi.Output<string | undefined>;
    readonly policyPasswordId: pulumi.Output<string>;
    /**
     * Defaults to `!\"#$%&'()*+,-./:;<=>?@[\]^_`{|}~`.
     */
    readonly symbolCharset: pulumi.Output<string | undefined>;
    /**
     * Defaults to `2`.
     */
    readonly zxcvbnScoreThreshold: pulumi.Output<number | undefined>;
    /**
     * Create a PolicyPassword resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PolicyPasswordArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PolicyPassword resources.
 */
export interface PolicyPasswordState {
    amountDigits?: pulumi.Input<number>;
    amountLowercase?: pulumi.Input<number>;
    amountSymbols?: pulumi.Input<number>;
    amountUppercase?: pulumi.Input<number>;
    /**
     * Defaults to `false`.
     */
    checkHaveIBeenPwned?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    checkStaticRules?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    checkZxcvbn?: pulumi.Input<boolean>;
    errorMessage?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    /**
     * Defaults to `1`.
     */
    hibpAllowedCount?: pulumi.Input<number>;
    lengthMin?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `password`.
     */
    passwordField?: pulumi.Input<string>;
    policyPasswordId?: pulumi.Input<string>;
    /**
     * Defaults to `!\"#$%&'()*+,-./:;<=>?@[\]^_`{|}~`.
     */
    symbolCharset?: pulumi.Input<string>;
    /**
     * Defaults to `2`.
     */
    zxcvbnScoreThreshold?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a PolicyPassword resource.
 */
export interface PolicyPasswordArgs {
    amountDigits?: pulumi.Input<number>;
    amountLowercase?: pulumi.Input<number>;
    amountSymbols?: pulumi.Input<number>;
    amountUppercase?: pulumi.Input<number>;
    /**
     * Defaults to `false`.
     */
    checkHaveIBeenPwned?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    checkStaticRules?: pulumi.Input<boolean>;
    /**
     * Defaults to `false`.
     */
    checkZxcvbn?: pulumi.Input<boolean>;
    errorMessage: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    /**
     * Defaults to `1`.
     */
    hibpAllowedCount?: pulumi.Input<number>;
    lengthMin?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `password`.
     */
    passwordField?: pulumi.Input<string>;
    policyPasswordId?: pulumi.Input<string>;
    /**
     * Defaults to `!\"#$%&'()*+,-./:;<=>?@[\]^_`{|}~`.
     */
    symbolCharset?: pulumi.Input<string>;
    /**
     * Defaults to `2`.
     */
    zxcvbnScoreThreshold?: pulumi.Input<number>;
}

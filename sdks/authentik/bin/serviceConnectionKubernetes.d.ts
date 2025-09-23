import * as pulumi from "@pulumi/pulumi";
export declare class ServiceConnectionKubernetes extends pulumi.CustomResource {
    /**
     * Get an existing ServiceConnectionKubernetes resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ServiceConnectionKubernetesState, opts?: pulumi.CustomResourceOptions): ServiceConnectionKubernetes;
    /**
     * Returns true if the given object is an instance of ServiceConnectionKubernetes.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ServiceConnectionKubernetes;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly kubeconfig: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly local: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly serviceConnectionKubernetesId: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly verifySsl: pulumi.Output<boolean | undefined>;
    /**
     * Create a ServiceConnectionKubernetes resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: ServiceConnectionKubernetesArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ServiceConnectionKubernetes resources.
 */
export interface ServiceConnectionKubernetesState {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    kubeconfig?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    local?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    serviceConnectionKubernetesId?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    verifySsl?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a ServiceConnectionKubernetes resource.
 */
export interface ServiceConnectionKubernetesArgs {
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    kubeconfig?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    local?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    serviceConnectionKubernetesId?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    verifySsl?: pulumi.Input<boolean>;
}

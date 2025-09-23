import * as pulumi from "@pulumi/pulumi";
export declare class ServiceConnectionDocker extends pulumi.CustomResource {
    /**
     * Get an existing ServiceConnectionDocker resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ServiceConnectionDockerState, opts?: pulumi.CustomResourceOptions): ServiceConnectionDocker;
    /**
     * Returns true if the given object is an instance of ServiceConnectionDocker.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ServiceConnectionDocker;
    /**
     * Defaults to `false`.
     */
    readonly local: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    readonly serviceConnectionDockerId: pulumi.Output<string>;
    readonly tlsAuthentication: pulumi.Output<string | undefined>;
    readonly tlsVerification: pulumi.Output<string | undefined>;
    /**
     * Defaults to `http+unix:///var/run/docker.sock`.
     */
    readonly url: pulumi.Output<string | undefined>;
    /**
     * Create a ServiceConnectionDocker resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: ServiceConnectionDockerArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ServiceConnectionDocker resources.
 */
export interface ServiceConnectionDockerState {
    /**
     * Defaults to `false`.
     */
    local?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    serviceConnectionDockerId?: pulumi.Input<string>;
    tlsAuthentication?: pulumi.Input<string>;
    tlsVerification?: pulumi.Input<string>;
    /**
     * Defaults to `http+unix:///var/run/docker.sock`.
     */
    url?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a ServiceConnectionDocker resource.
 */
export interface ServiceConnectionDockerArgs {
    /**
     * Defaults to `false`.
     */
    local?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    serviceConnectionDockerId?: pulumi.Input<string>;
    tlsAuthentication?: pulumi.Input<string>;
    tlsVerification?: pulumi.Input<string>;
    /**
     * Defaults to `http+unix:///var/run/docker.sock`.
     */
    url?: pulumi.Input<string>;
}

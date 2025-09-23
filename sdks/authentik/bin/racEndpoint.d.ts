import * as pulumi from "@pulumi/pulumi";
export declare class RacEndpoint extends pulumi.CustomResource {
    /**
     * Get an existing RacEndpoint resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: RacEndpointState, opts?: pulumi.CustomResourceOptions): RacEndpoint;
    /**
     * Returns true if the given object is an instance of RacEndpoint.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is RacEndpoint;
    readonly host: pulumi.Output<string>;
    /**
     * Defaults to `0`.
     */
    readonly maximumConnections: pulumi.Output<number | undefined>;
    readonly name: pulumi.Output<string>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    /**
     * Allowed values:
     *   - `rdp`
     *   - `vnc`
     *   - `ssh`
     */
    readonly protocol: pulumi.Output<string>;
    readonly protocolProvider: pulumi.Output<number>;
    readonly racEndpointId: pulumi.Output<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    readonly settings: pulumi.Output<string | undefined>;
    /**
     * Create a RacEndpoint resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: RacEndpointArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering RacEndpoint resources.
 */
export interface RacEndpointState {
    host?: pulumi.Input<string>;
    /**
     * Defaults to `0`.
     */
    maximumConnections?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `rdp`
     *   - `vnc`
     *   - `ssh`
     */
    protocol?: pulumi.Input<string>;
    protocolProvider?: pulumi.Input<number>;
    racEndpointId?: pulumi.Input<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    settings?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a RacEndpoint resource.
 */
export interface RacEndpointArgs {
    host: pulumi.Input<string>;
    /**
     * Defaults to `0`.
     */
    maximumConnections?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Allowed values:
     *   - `rdp`
     *   - `vnc`
     *   - `ssh`
     */
    protocol: pulumi.Input<string>;
    protocolProvider: pulumi.Input<number>;
    racEndpointId?: pulumi.Input<string>;
    /**
     * JSON format expected. Use `jsonencode()` to pass objects. Defaults to `{}`.
     */
    settings?: pulumi.Input<string>;
}

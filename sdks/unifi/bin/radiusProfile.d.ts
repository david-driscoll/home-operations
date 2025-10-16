import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class RadiusProfile extends pulumi.CustomResource {
    /**
     * Get an existing RadiusProfile resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: RadiusProfileState, opts?: pulumi.CustomResourceOptions): RadiusProfile;
    /**
     * Returns true if the given object is an instance of RadiusProfile.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is RadiusProfile;
    /**
     * Specifies whether to use RADIUS accounting. Defaults to `false`.
     */
    readonly accountingEnabled: pulumi.Output<boolean | undefined>;
    /**
     * RADIUS accounting servers.
     */
    readonly acctServers: pulumi.Output<outputs.RadiusProfileAcctServer[] | undefined>;
    /**
     * RADIUS authentication servers.
     */
    readonly authServers: pulumi.Output<outputs.RadiusProfileAuthServer[] | undefined>;
    /**
     * Specifies whether to use interim_update. Defaults to `false`.
     */
    readonly interimUpdateEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies interim_update interval. Defaults to `3600`.
     */
    readonly interimUpdateInterval: pulumi.Output<number | undefined>;
    /**
     * The name of the profile.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The name of the site to associate the settings with.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Specifies whether to use usg as a RADIUS accounting server. Defaults to `false`.
     */
    readonly useUsgAcctServer: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether to use usg as a RADIUS authentication server. Defaults to `false`.
     */
    readonly useUsgAuthServer: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether to use vlan on wired connections. Defaults to `false`.
     */
    readonly vlanEnabled: pulumi.Output<boolean | undefined>;
    /**
     * Specifies whether to use vlan on wireless connections. Must be one of `disabled`, `optional`, or `required`. Defaults to ``.
     */
    readonly vlanWlanMode: pulumi.Output<string | undefined>;
    /**
     * Create a RadiusProfile resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: RadiusProfileArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering RadiusProfile resources.
 */
export interface RadiusProfileState {
    /**
     * Specifies whether to use RADIUS accounting. Defaults to `false`.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * RADIUS accounting servers.
     */
    acctServers?: pulumi.Input<pulumi.Input<inputs.RadiusProfileAcctServer>[]>;
    /**
     * RADIUS authentication servers.
     */
    authServers?: pulumi.Input<pulumi.Input<inputs.RadiusProfileAuthServer>[]>;
    /**
     * Specifies whether to use interim_update. Defaults to `false`.
     */
    interimUpdateEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies interim_update interval. Defaults to `3600`.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * The name of the profile.
     */
    name?: pulumi.Input<string>;
    /**
     * The name of the site to associate the settings with.
     */
    site?: pulumi.Input<string>;
    /**
     * Specifies whether to use usg as a RADIUS accounting server. Defaults to `false`.
     */
    useUsgAcctServer?: pulumi.Input<boolean>;
    /**
     * Specifies whether to use usg as a RADIUS authentication server. Defaults to `false`.
     */
    useUsgAuthServer?: pulumi.Input<boolean>;
    /**
     * Specifies whether to use vlan on wired connections. Defaults to `false`.
     */
    vlanEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether to use vlan on wireless connections. Must be one of `disabled`, `optional`, or `required`. Defaults to ``.
     */
    vlanWlanMode?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a RadiusProfile resource.
 */
export interface RadiusProfileArgs {
    /**
     * Specifies whether to use RADIUS accounting. Defaults to `false`.
     */
    accountingEnabled?: pulumi.Input<boolean>;
    /**
     * RADIUS accounting servers.
     */
    acctServers?: pulumi.Input<pulumi.Input<inputs.RadiusProfileAcctServer>[]>;
    /**
     * RADIUS authentication servers.
     */
    authServers?: pulumi.Input<pulumi.Input<inputs.RadiusProfileAuthServer>[]>;
    /**
     * Specifies whether to use interim_update. Defaults to `false`.
     */
    interimUpdateEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies interim_update interval. Defaults to `3600`.
     */
    interimUpdateInterval?: pulumi.Input<number>;
    /**
     * The name of the profile.
     */
    name?: pulumi.Input<string>;
    /**
     * The name of the site to associate the settings with.
     */
    site?: pulumi.Input<string>;
    /**
     * Specifies whether to use usg as a RADIUS accounting server. Defaults to `false`.
     */
    useUsgAcctServer?: pulumi.Input<boolean>;
    /**
     * Specifies whether to use usg as a RADIUS authentication server. Defaults to `false`.
     */
    useUsgAuthServer?: pulumi.Input<boolean>;
    /**
     * Specifies whether to use vlan on wired connections. Defaults to `false`.
     */
    vlanEnabled?: pulumi.Input<boolean>;
    /**
     * Specifies whether to use vlan on wireless connections. Must be one of `disabled`, `optional`, or `required`. Defaults to ``.
     */
    vlanWlanMode?: pulumi.Input<string>;
}

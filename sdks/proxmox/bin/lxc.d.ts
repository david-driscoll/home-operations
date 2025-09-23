import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class Lxc extends pulumi.CustomResource {
    /**
     * Get an existing Lxc resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: LxcState, opts?: pulumi.CustomResourceOptions): Lxc;
    /**
     * Returns true if the given object is an instance of Lxc.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Lxc;
    readonly arch: pulumi.Output<string | undefined>;
    readonly bwlimit: pulumi.Output<number | undefined>;
    readonly clone: pulumi.Output<string | undefined>;
    readonly cloneStorage: pulumi.Output<string | undefined>;
    readonly cmode: pulumi.Output<string | undefined>;
    readonly console: pulumi.Output<boolean | undefined>;
    readonly cores: pulumi.Output<number | undefined>;
    readonly cpulimit: pulumi.Output<number | undefined>;
    readonly cpuunits: pulumi.Output<number | undefined>;
    readonly description: pulumi.Output<string | undefined>;
    readonly features: pulumi.Output<outputs.LxcFeatures | undefined>;
    readonly force: pulumi.Output<boolean | undefined>;
    readonly full: pulumi.Output<boolean | undefined>;
    readonly hagroup: pulumi.Output<string | undefined>;
    readonly hastate: pulumi.Output<string | undefined>;
    readonly hookscript: pulumi.Output<string | undefined>;
    readonly hostname: pulumi.Output<string | undefined>;
    readonly ignoreUnpackErrors: pulumi.Output<boolean | undefined>;
    readonly lock: pulumi.Output<string | undefined>;
    readonly lxcId: pulumi.Output<string>;
    readonly memory: pulumi.Output<number | undefined>;
    readonly mountpoints: pulumi.Output<outputs.LxcMountpoint[] | undefined>;
    readonly nameserver: pulumi.Output<string | undefined>;
    readonly networks: pulumi.Output<outputs.LxcNetwork[] | undefined>;
    readonly onboot: pulumi.Output<boolean | undefined>;
    readonly ostemplate: pulumi.Output<string | undefined>;
    readonly ostype: pulumi.Output<string>;
    readonly password: pulumi.Output<string | undefined>;
    readonly pool: pulumi.Output<string | undefined>;
    readonly protection: pulumi.Output<boolean | undefined>;
    readonly restore: pulumi.Output<boolean | undefined>;
    readonly rootfs: pulumi.Output<outputs.LxcRootfs | undefined>;
    readonly searchdomain: pulumi.Output<string | undefined>;
    readonly sshPublicKeys: pulumi.Output<string | undefined>;
    readonly start: pulumi.Output<boolean | undefined>;
    readonly startup: pulumi.Output<string | undefined>;
    readonly swap: pulumi.Output<number | undefined>;
    readonly tags: pulumi.Output<string | undefined>;
    readonly targetNode: pulumi.Output<string>;
    readonly template: pulumi.Output<boolean | undefined>;
    readonly timeouts: pulumi.Output<outputs.LxcTimeouts | undefined>;
    readonly tty: pulumi.Output<number | undefined>;
    readonly unique: pulumi.Output<boolean | undefined>;
    readonly unprivileged: pulumi.Output<boolean | undefined>;
    readonly unuseds: pulumi.Output<string[]>;
    /**
     * The VM identifier in proxmox (100-999999999)
     */
    readonly vmid: pulumi.Output<number>;
    /**
     * Create a Lxc resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: LxcArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Lxc resources.
 */
export interface LxcState {
    arch?: pulumi.Input<string>;
    bwlimit?: pulumi.Input<number>;
    clone?: pulumi.Input<string>;
    cloneStorage?: pulumi.Input<string>;
    cmode?: pulumi.Input<string>;
    console?: pulumi.Input<boolean>;
    cores?: pulumi.Input<number>;
    cpulimit?: pulumi.Input<number>;
    cpuunits?: pulumi.Input<number>;
    description?: pulumi.Input<string>;
    features?: pulumi.Input<inputs.LxcFeatures>;
    force?: pulumi.Input<boolean>;
    full?: pulumi.Input<boolean>;
    hagroup?: pulumi.Input<string>;
    hastate?: pulumi.Input<string>;
    hookscript?: pulumi.Input<string>;
    hostname?: pulumi.Input<string>;
    ignoreUnpackErrors?: pulumi.Input<boolean>;
    lock?: pulumi.Input<string>;
    lxcId?: pulumi.Input<string>;
    memory?: pulumi.Input<number>;
    mountpoints?: pulumi.Input<pulumi.Input<inputs.LxcMountpoint>[]>;
    nameserver?: pulumi.Input<string>;
    networks?: pulumi.Input<pulumi.Input<inputs.LxcNetwork>[]>;
    onboot?: pulumi.Input<boolean>;
    ostemplate?: pulumi.Input<string>;
    ostype?: pulumi.Input<string>;
    password?: pulumi.Input<string>;
    pool?: pulumi.Input<string>;
    protection?: pulumi.Input<boolean>;
    restore?: pulumi.Input<boolean>;
    rootfs?: pulumi.Input<inputs.LxcRootfs>;
    searchdomain?: pulumi.Input<string>;
    sshPublicKeys?: pulumi.Input<string>;
    start?: pulumi.Input<boolean>;
    startup?: pulumi.Input<string>;
    swap?: pulumi.Input<number>;
    tags?: pulumi.Input<string>;
    targetNode?: pulumi.Input<string>;
    template?: pulumi.Input<boolean>;
    timeouts?: pulumi.Input<inputs.LxcTimeouts>;
    tty?: pulumi.Input<number>;
    unique?: pulumi.Input<boolean>;
    unprivileged?: pulumi.Input<boolean>;
    unuseds?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * The VM identifier in proxmox (100-999999999)
     */
    vmid?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a Lxc resource.
 */
export interface LxcArgs {
    arch?: pulumi.Input<string>;
    bwlimit?: pulumi.Input<number>;
    clone?: pulumi.Input<string>;
    cloneStorage?: pulumi.Input<string>;
    cmode?: pulumi.Input<string>;
    console?: pulumi.Input<boolean>;
    cores?: pulumi.Input<number>;
    cpulimit?: pulumi.Input<number>;
    cpuunits?: pulumi.Input<number>;
    description?: pulumi.Input<string>;
    features?: pulumi.Input<inputs.LxcFeatures>;
    force?: pulumi.Input<boolean>;
    full?: pulumi.Input<boolean>;
    hagroup?: pulumi.Input<string>;
    hastate?: pulumi.Input<string>;
    hookscript?: pulumi.Input<string>;
    hostname?: pulumi.Input<string>;
    ignoreUnpackErrors?: pulumi.Input<boolean>;
    lock?: pulumi.Input<string>;
    lxcId?: pulumi.Input<string>;
    memory?: pulumi.Input<number>;
    mountpoints?: pulumi.Input<pulumi.Input<inputs.LxcMountpoint>[]>;
    nameserver?: pulumi.Input<string>;
    networks?: pulumi.Input<pulumi.Input<inputs.LxcNetwork>[]>;
    onboot?: pulumi.Input<boolean>;
    ostemplate?: pulumi.Input<string>;
    ostype?: pulumi.Input<string>;
    password?: pulumi.Input<string>;
    pool?: pulumi.Input<string>;
    protection?: pulumi.Input<boolean>;
    restore?: pulumi.Input<boolean>;
    rootfs?: pulumi.Input<inputs.LxcRootfs>;
    searchdomain?: pulumi.Input<string>;
    sshPublicKeys?: pulumi.Input<string>;
    start?: pulumi.Input<boolean>;
    startup?: pulumi.Input<string>;
    swap?: pulumi.Input<number>;
    tags?: pulumi.Input<string>;
    targetNode: pulumi.Input<string>;
    template?: pulumi.Input<boolean>;
    timeouts?: pulumi.Input<inputs.LxcTimeouts>;
    tty?: pulumi.Input<number>;
    unique?: pulumi.Input<boolean>;
    unprivileged?: pulumi.Input<boolean>;
    /**
     * The VM identifier in proxmox (100-999999999)
     */
    vmid?: pulumi.Input<number>;
}

import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class VmQemu extends pulumi.CustomResource {
    /**
     * Get an existing VmQemu resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: VmQemuState, opts?: pulumi.CustomResourceOptions): VmQemu;
    /**
     * Returns true if the given object is an instance of VmQemu.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is VmQemu;
    readonly additionalWait: pulumi.Output<number | undefined>;
    readonly agent: pulumi.Output<number | undefined>;
    readonly args: pulumi.Output<string | undefined>;
    /**
     * Automatically reboot the VM if any of the modified parameters requires a reboot to take effect.
     */
    readonly automaticReboot: pulumi.Output<boolean | undefined>;
    readonly balloon: pulumi.Output<number | undefined>;
    /**
     * The VM bios, it can be seabios or ovmf
     */
    readonly bios: pulumi.Output<string | undefined>;
    /**
     * Boot order of the VM
     */
    readonly boot: pulumi.Output<string>;
    readonly bootdisk: pulumi.Output<string>;
    /**
     * @deprecated Deprecated
     */
    readonly bridge: pulumi.Output<string | undefined>;
    readonly ciWait: pulumi.Output<number | undefined>;
    readonly cicustom: pulumi.Output<string | undefined>;
    readonly cipassword: pulumi.Output<string | undefined>;
    readonly ciuser: pulumi.Output<string | undefined>;
    readonly clone: pulumi.Output<string | undefined>;
    readonly cloneWait: pulumi.Output<number | undefined>;
    readonly cloudinitCdromStorage: pulumi.Output<string | undefined>;
    readonly cores: pulumi.Output<number | undefined>;
    readonly cpu: pulumi.Output<string | undefined>;
    /**
     * Use to track vm ipv4 address
     */
    readonly defaultIpv4Address: pulumi.Output<string>;
    /**
     * By default define SSH for provisioner info
     */
    readonly defineConnectionInfo: pulumi.Output<boolean | undefined>;
    /**
     * The VM description
     */
    readonly desc: pulumi.Output<string | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly diskGb: pulumi.Output<number | undefined>;
    readonly disks: pulumi.Output<outputs.VmQemuDisk[] | undefined>;
    readonly forceCreate: pulumi.Output<boolean | undefined>;
    readonly forceRecreateOnChangeOf: pulumi.Output<string | undefined>;
    readonly fullClone: pulumi.Output<boolean | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly guestAgentReadyTimeout: pulumi.Output<number | undefined>;
    readonly hagroup: pulumi.Output<string | undefined>;
    readonly hastate: pulumi.Output<string | undefined>;
    readonly hostpcis: pulumi.Output<outputs.VmQemuHostpci[] | undefined>;
    readonly hotplug: pulumi.Output<string | undefined>;
    readonly ipconfig0: pulumi.Output<string | undefined>;
    readonly ipconfig1: pulumi.Output<string | undefined>;
    readonly ipconfig10: pulumi.Output<string | undefined>;
    readonly ipconfig11: pulumi.Output<string | undefined>;
    readonly ipconfig12: pulumi.Output<string | undefined>;
    readonly ipconfig13: pulumi.Output<string | undefined>;
    readonly ipconfig14: pulumi.Output<string | undefined>;
    readonly ipconfig15: pulumi.Output<string | undefined>;
    readonly ipconfig2: pulumi.Output<string | undefined>;
    readonly ipconfig3: pulumi.Output<string | undefined>;
    readonly ipconfig4: pulumi.Output<string | undefined>;
    readonly ipconfig5: pulumi.Output<string | undefined>;
    readonly ipconfig6: pulumi.Output<string | undefined>;
    readonly ipconfig7: pulumi.Output<string | undefined>;
    readonly ipconfig8: pulumi.Output<string | undefined>;
    readonly ipconfig9: pulumi.Output<string | undefined>;
    readonly iso: pulumi.Output<string | undefined>;
    readonly kvm: pulumi.Output<boolean | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly mac: pulumi.Output<string | undefined>;
    /**
     * Specifies the Qemu machine type.
     */
    readonly machine: pulumi.Output<string | undefined>;
    readonly memory: pulumi.Output<number | undefined>;
    /**
     * The VM name
     */
    readonly name: pulumi.Output<string>;
    readonly nameserver: pulumi.Output<string>;
    readonly networks: pulumi.Output<outputs.VmQemuNetwork[] | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly nic: pulumi.Output<string | undefined>;
    readonly numa: pulumi.Output<boolean | undefined>;
    /**
     * VM autostart on boot
     */
    readonly onboot: pulumi.Output<boolean | undefined>;
    /**
     * VM autostart on create
     */
    readonly oncreate: pulumi.Output<boolean | undefined>;
    readonly osNetworkConfig: pulumi.Output<string | undefined>;
    readonly osType: pulumi.Output<string | undefined>;
    readonly pool: pulumi.Output<string | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly preprovision: pulumi.Output<boolean | undefined>;
    readonly pxe: pulumi.Output<boolean | undefined>;
    readonly qemuOs: pulumi.Output<string | undefined>;
    /**
     * Internal variable, true if any of the modified parameters requires a reboot to take effect.
     */
    readonly rebootRequired: pulumi.Output<boolean>;
    readonly scsihw: pulumi.Output<string | undefined>;
    readonly searchdomain: pulumi.Output<string>;
    readonly serials: pulumi.Output<outputs.VmQemuSerial[] | undefined>;
    readonly sockets: pulumi.Output<number | undefined>;
    /**
     * Use to pass instance ip address, redundant
     */
    readonly sshForwardIp: pulumi.Output<string | undefined>;
    readonly sshHost: pulumi.Output<string>;
    readonly sshPort: pulumi.Output<string>;
    readonly sshPrivateKey: pulumi.Output<string | undefined>;
    readonly sshUser: pulumi.Output<string | undefined>;
    readonly sshkeys: pulumi.Output<string | undefined>;
    /**
     * Startup order of the VM
     */
    readonly startup: pulumi.Output<string | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly storage: pulumi.Output<string | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly storageType: pulumi.Output<string | undefined>;
    /**
     * Enable tablet mode in the VM
     */
    readonly tablet: pulumi.Output<boolean | undefined>;
    readonly tags: pulumi.Output<string | undefined>;
    /**
     * The node where VM goes to
     */
    readonly targetNode: pulumi.Output<string>;
    readonly timeouts: pulumi.Output<outputs.VmQemuTimeouts | undefined>;
    /**
     * Record unused disks in proxmox. This is intended to be read-only for now.
     */
    readonly unusedDisks: pulumi.Output<outputs.VmQemuUnusedDisk[]>;
    readonly usbs: pulumi.Output<outputs.VmQemuUsb[] | undefined>;
    readonly vcpus: pulumi.Output<number | undefined>;
    readonly vgas: pulumi.Output<outputs.VmQemuVga[] | undefined>;
    /**
     * @deprecated Deprecated
     */
    readonly vlan: pulumi.Output<number | undefined>;
    readonly vmQemuId: pulumi.Output<string>;
    /**
     * The VM identifier in proxmox (100-999999999)
     */
    readonly vmid: pulumi.Output<number>;
    /**
     * Create a VmQemu resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: VmQemuArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering VmQemu resources.
 */
export interface VmQemuState {
    additionalWait?: pulumi.Input<number>;
    agent?: pulumi.Input<number>;
    args?: pulumi.Input<string>;
    /**
     * Automatically reboot the VM if any of the modified parameters requires a reboot to take effect.
     */
    automaticReboot?: pulumi.Input<boolean>;
    balloon?: pulumi.Input<number>;
    /**
     * The VM bios, it can be seabios or ovmf
     */
    bios?: pulumi.Input<string>;
    /**
     * Boot order of the VM
     */
    boot?: pulumi.Input<string>;
    bootdisk?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    bridge?: pulumi.Input<string>;
    ciWait?: pulumi.Input<number>;
    cicustom?: pulumi.Input<string>;
    cipassword?: pulumi.Input<string>;
    ciuser?: pulumi.Input<string>;
    clone?: pulumi.Input<string>;
    cloneWait?: pulumi.Input<number>;
    cloudinitCdromStorage?: pulumi.Input<string>;
    cores?: pulumi.Input<number>;
    cpu?: pulumi.Input<string>;
    /**
     * Use to track vm ipv4 address
     */
    defaultIpv4Address?: pulumi.Input<string>;
    /**
     * By default define SSH for provisioner info
     */
    defineConnectionInfo?: pulumi.Input<boolean>;
    /**
     * The VM description
     */
    desc?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    diskGb?: pulumi.Input<number>;
    disks?: pulumi.Input<pulumi.Input<inputs.VmQemuDisk>[]>;
    forceCreate?: pulumi.Input<boolean>;
    forceRecreateOnChangeOf?: pulumi.Input<string>;
    fullClone?: pulumi.Input<boolean>;
    /**
     * @deprecated Deprecated
     */
    guestAgentReadyTimeout?: pulumi.Input<number>;
    hagroup?: pulumi.Input<string>;
    hastate?: pulumi.Input<string>;
    hostpcis?: pulumi.Input<pulumi.Input<inputs.VmQemuHostpci>[]>;
    hotplug?: pulumi.Input<string>;
    ipconfig0?: pulumi.Input<string>;
    ipconfig1?: pulumi.Input<string>;
    ipconfig10?: pulumi.Input<string>;
    ipconfig11?: pulumi.Input<string>;
    ipconfig12?: pulumi.Input<string>;
    ipconfig13?: pulumi.Input<string>;
    ipconfig14?: pulumi.Input<string>;
    ipconfig15?: pulumi.Input<string>;
    ipconfig2?: pulumi.Input<string>;
    ipconfig3?: pulumi.Input<string>;
    ipconfig4?: pulumi.Input<string>;
    ipconfig5?: pulumi.Input<string>;
    ipconfig6?: pulumi.Input<string>;
    ipconfig7?: pulumi.Input<string>;
    ipconfig8?: pulumi.Input<string>;
    ipconfig9?: pulumi.Input<string>;
    iso?: pulumi.Input<string>;
    kvm?: pulumi.Input<boolean>;
    /**
     * @deprecated Deprecated
     */
    mac?: pulumi.Input<string>;
    /**
     * Specifies the Qemu machine type.
     */
    machine?: pulumi.Input<string>;
    memory?: pulumi.Input<number>;
    /**
     * The VM name
     */
    name?: pulumi.Input<string>;
    nameserver?: pulumi.Input<string>;
    networks?: pulumi.Input<pulumi.Input<inputs.VmQemuNetwork>[]>;
    /**
     * @deprecated Deprecated
     */
    nic?: pulumi.Input<string>;
    numa?: pulumi.Input<boolean>;
    /**
     * VM autostart on boot
     */
    onboot?: pulumi.Input<boolean>;
    /**
     * VM autostart on create
     */
    oncreate?: pulumi.Input<boolean>;
    osNetworkConfig?: pulumi.Input<string>;
    osType?: pulumi.Input<string>;
    pool?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    preprovision?: pulumi.Input<boolean>;
    pxe?: pulumi.Input<boolean>;
    qemuOs?: pulumi.Input<string>;
    /**
     * Internal variable, true if any of the modified parameters requires a reboot to take effect.
     */
    rebootRequired?: pulumi.Input<boolean>;
    scsihw?: pulumi.Input<string>;
    searchdomain?: pulumi.Input<string>;
    serials?: pulumi.Input<pulumi.Input<inputs.VmQemuSerial>[]>;
    sockets?: pulumi.Input<number>;
    /**
     * Use to pass instance ip address, redundant
     */
    sshForwardIp?: pulumi.Input<string>;
    sshHost?: pulumi.Input<string>;
    sshPort?: pulumi.Input<string>;
    sshPrivateKey?: pulumi.Input<string>;
    sshUser?: pulumi.Input<string>;
    sshkeys?: pulumi.Input<string>;
    /**
     * Startup order of the VM
     */
    startup?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    storage?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    storageType?: pulumi.Input<string>;
    /**
     * Enable tablet mode in the VM
     */
    tablet?: pulumi.Input<boolean>;
    tags?: pulumi.Input<string>;
    /**
     * The node where VM goes to
     */
    targetNode?: pulumi.Input<string>;
    timeouts?: pulumi.Input<inputs.VmQemuTimeouts>;
    /**
     * Record unused disks in proxmox. This is intended to be read-only for now.
     */
    unusedDisks?: pulumi.Input<pulumi.Input<inputs.VmQemuUnusedDisk>[]>;
    usbs?: pulumi.Input<pulumi.Input<inputs.VmQemuUsb>[]>;
    vcpus?: pulumi.Input<number>;
    vgas?: pulumi.Input<pulumi.Input<inputs.VmQemuVga>[]>;
    /**
     * @deprecated Deprecated
     */
    vlan?: pulumi.Input<number>;
    vmQemuId?: pulumi.Input<string>;
    /**
     * The VM identifier in proxmox (100-999999999)
     */
    vmid?: pulumi.Input<number>;
}
/**
 * The set of arguments for constructing a VmQemu resource.
 */
export interface VmQemuArgs {
    additionalWait?: pulumi.Input<number>;
    agent?: pulumi.Input<number>;
    args?: pulumi.Input<string>;
    /**
     * Automatically reboot the VM if any of the modified parameters requires a reboot to take effect.
     */
    automaticReboot?: pulumi.Input<boolean>;
    balloon?: pulumi.Input<number>;
    /**
     * The VM bios, it can be seabios or ovmf
     */
    bios?: pulumi.Input<string>;
    /**
     * Boot order of the VM
     */
    boot?: pulumi.Input<string>;
    bootdisk?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    bridge?: pulumi.Input<string>;
    ciWait?: pulumi.Input<number>;
    cicustom?: pulumi.Input<string>;
    cipassword?: pulumi.Input<string>;
    ciuser?: pulumi.Input<string>;
    clone?: pulumi.Input<string>;
    cloneWait?: pulumi.Input<number>;
    cloudinitCdromStorage?: pulumi.Input<string>;
    cores?: pulumi.Input<number>;
    cpu?: pulumi.Input<string>;
    /**
     * By default define SSH for provisioner info
     */
    defineConnectionInfo?: pulumi.Input<boolean>;
    /**
     * The VM description
     */
    desc?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    diskGb?: pulumi.Input<number>;
    disks?: pulumi.Input<pulumi.Input<inputs.VmQemuDisk>[]>;
    forceCreate?: pulumi.Input<boolean>;
    forceRecreateOnChangeOf?: pulumi.Input<string>;
    fullClone?: pulumi.Input<boolean>;
    /**
     * @deprecated Deprecated
     */
    guestAgentReadyTimeout?: pulumi.Input<number>;
    hagroup?: pulumi.Input<string>;
    hastate?: pulumi.Input<string>;
    hostpcis?: pulumi.Input<pulumi.Input<inputs.VmQemuHostpci>[]>;
    hotplug?: pulumi.Input<string>;
    ipconfig0?: pulumi.Input<string>;
    ipconfig1?: pulumi.Input<string>;
    ipconfig10?: pulumi.Input<string>;
    ipconfig11?: pulumi.Input<string>;
    ipconfig12?: pulumi.Input<string>;
    ipconfig13?: pulumi.Input<string>;
    ipconfig14?: pulumi.Input<string>;
    ipconfig15?: pulumi.Input<string>;
    ipconfig2?: pulumi.Input<string>;
    ipconfig3?: pulumi.Input<string>;
    ipconfig4?: pulumi.Input<string>;
    ipconfig5?: pulumi.Input<string>;
    ipconfig6?: pulumi.Input<string>;
    ipconfig7?: pulumi.Input<string>;
    ipconfig8?: pulumi.Input<string>;
    ipconfig9?: pulumi.Input<string>;
    iso?: pulumi.Input<string>;
    kvm?: pulumi.Input<boolean>;
    /**
     * @deprecated Deprecated
     */
    mac?: pulumi.Input<string>;
    /**
     * Specifies the Qemu machine type.
     */
    machine?: pulumi.Input<string>;
    memory?: pulumi.Input<number>;
    /**
     * The VM name
     */
    name?: pulumi.Input<string>;
    nameserver?: pulumi.Input<string>;
    networks?: pulumi.Input<pulumi.Input<inputs.VmQemuNetwork>[]>;
    /**
     * @deprecated Deprecated
     */
    nic?: pulumi.Input<string>;
    numa?: pulumi.Input<boolean>;
    /**
     * VM autostart on boot
     */
    onboot?: pulumi.Input<boolean>;
    /**
     * VM autostart on create
     */
    oncreate?: pulumi.Input<boolean>;
    osNetworkConfig?: pulumi.Input<string>;
    osType?: pulumi.Input<string>;
    pool?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    preprovision?: pulumi.Input<boolean>;
    pxe?: pulumi.Input<boolean>;
    qemuOs?: pulumi.Input<string>;
    scsihw?: pulumi.Input<string>;
    searchdomain?: pulumi.Input<string>;
    serials?: pulumi.Input<pulumi.Input<inputs.VmQemuSerial>[]>;
    sockets?: pulumi.Input<number>;
    /**
     * Use to pass instance ip address, redundant
     */
    sshForwardIp?: pulumi.Input<string>;
    sshPrivateKey?: pulumi.Input<string>;
    sshUser?: pulumi.Input<string>;
    sshkeys?: pulumi.Input<string>;
    /**
     * Startup order of the VM
     */
    startup?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    storage?: pulumi.Input<string>;
    /**
     * @deprecated Deprecated
     */
    storageType?: pulumi.Input<string>;
    /**
     * Enable tablet mode in the VM
     */
    tablet?: pulumi.Input<boolean>;
    tags?: pulumi.Input<string>;
    /**
     * The node where VM goes to
     */
    targetNode: pulumi.Input<string>;
    timeouts?: pulumi.Input<inputs.VmQemuTimeouts>;
    usbs?: pulumi.Input<pulumi.Input<inputs.VmQemuUsb>[]>;
    vcpus?: pulumi.Input<number>;
    vgas?: pulumi.Input<pulumi.Input<inputs.VmQemuVga>[]>;
    /**
     * @deprecated Deprecated
     */
    vlan?: pulumi.Input<number>;
    vmQemuId?: pulumi.Input<string>;
    /**
     * The VM identifier in proxmox (100-999999999)
     */
    vmid?: pulumi.Input<number>;
}

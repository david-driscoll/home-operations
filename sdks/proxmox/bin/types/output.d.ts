export interface LxcDiskMountoptions {
    noatime?: boolean;
    nodev?: boolean;
    noexec?: string;
    nosuid?: boolean;
}
export interface LxcDiskTimeouts {
    create?: string;
    default?: string;
    delete?: string;
    read?: string;
    update?: string;
}
export interface LxcFeatures {
    fuse?: boolean;
    keyctl?: boolean;
    mknod?: boolean;
    mount?: string;
    nesting?: boolean;
}
export interface LxcMountpoint {
    acl?: boolean;
    backup?: boolean;
    file: string;
    key: string;
    mp: string;
    quota?: boolean;
    replicate?: boolean;
    shared?: boolean;
    size: string;
    slot: number;
    storage: string;
    volume: string;
}
export interface LxcNetwork {
    bridge?: string;
    firewall?: boolean;
    gw?: string;
    gw6?: string;
    hwaddr: string;
    ip?: string;
    ip6?: string;
    mtu?: number;
    name: string;
    rate?: number;
    tag: number;
    trunks: string;
    type: string;
}
export interface LxcRootfs {
    acl?: boolean;
    quota?: boolean;
    replicate?: boolean;
    ro?: boolean;
    shared?: boolean;
    size: string;
    storage: string;
    volume: string;
}
export interface LxcTimeouts {
    create?: string;
    default?: string;
    delete?: string;
    read?: string;
    update?: string;
}
export interface PoolTimeouts {
    create?: string;
    default?: string;
    delete?: string;
    read?: string;
    update?: string;
}
export interface VmQemuDisk {
    aio?: string;
    backup?: boolean;
    cache?: string;
    discard?: string;
    file: string;
    format: string;
    iops?: number;
    iopsMax?: number;
    iopsMaxLength?: number;
    iopsRd?: number;
    iopsRdMax?: number;
    iopsRdMaxLength?: number;
    iopsWr?: number;
    iopsWrMax?: number;
    iopsWrMaxLength?: number;
    iothread?: number;
    mbps?: number;
    mbpsRd?: number;
    mbpsRdMax?: number;
    mbpsWr?: number;
    mbpsWrMax?: number;
    media: string;
    replicate?: number;
    size: string;
    slot: number;
    ssd?: number;
    storage: string;
    storageType: string;
    type: string;
    volume: string;
}
export interface VmQemuHostpci {
    host?: string;
    pcie?: number;
    rombar?: number;
}
export interface VmQemuNetwork {
    bridge?: string;
    firewall?: boolean;
    linkDown?: boolean;
    macaddr: string;
    model: string;
    mtu?: number;
    queues: number;
    rate: number;
    /**
     * VLAN tag.
     */
    tag?: number;
}
export interface VmQemuSerial {
    id: number;
    type: string;
}
export interface VmQemuTimeouts {
    create?: string;
    default?: string;
    delete?: string;
    read?: string;
    update?: string;
}
export interface VmQemuUnusedDisk {
    file: string;
    slot: number;
    storage: string;
}
export interface VmQemuUsb {
    host: string;
    usb3?: boolean;
}
export interface VmQemuVga {
    memory?: number;
    type?: string;
}

// TODO: Pull from tailscale???

export const Groups = {
  System: "System",
  Applications: "Applications",
} as const;

export const Roles = {
  Admins: "admins",
  Editors: "editors",
  Users: "users",
  Family: "family",
  Friends: "friends",
  MediaManagers: "media-managers",
} as const;

import { TailscaleAutogroups, TailscaleCidr, TailscaleGroups, TailscaleNetworkCapability, TailscaleTags } from "@openapi/tailscale-grants.js";

const dnsServers = {
  "Alpha Site": {
    ips: ["10.10.10.9"],
    uptime: false,
    use: true,
    internal: true,
  },
  Discord: {
    ips: ["10.10.0.1"],
    uptime: true,
    use: true,
    internal: true,
  },
  "Stargate Command": {
    ips: ["10.10.209.201"],
    uptime: true,
    use: true,
    internal: true,
  },
  Quad9: {
    ips: ["9.9.9.9", "149.112.112.112"],
    uptime: true,
    use: true,
    internal: false,
  },
  CloudFlare: {
    ips: ["1.1.1.1", "1.0.0.1"],
    uptime: true,
    use: false,
    internal: false,
  },
};
export const dns = {
  config: dnsServers,
  ips: Object.values(dnsServers).flatMap((server) => (server.use ? server.ips : [])),
  externalIps: Object.values(dnsServers).flatMap((server) => (server.use && server.internal ? [] : server.ips)),
  internalIps: Object.values(dnsServers).flatMap((server) => (server.use && server.internal ? server.ips : [])),
} as const;

export const Tailscale = {
  subnets: {
    home: "10.10.0.0/16" as TailscaleCidr,
  } as const,

  ports: {
    any: ["*"] as TailscaleNetworkCapability[],
    web: ["tcp:443", "tcp:80", "udp:443", "udp:80"] as TailscaleNetworkCapability[],
    dns: ["tcp:53", "udp:53", "tcp:853", "udp:853", "udp:784", "tcp:443"] as TailscaleNetworkCapability[],
    ssh: ["tcp:22", "udp:22"] as TailscaleNetworkCapability[],
    dockge: ["tcp:80", "tcp:443"] as TailscaleNetworkCapability[],
    dockgeManagement: ["tcp:5001", "udp:5001", "tcp:9595", "tcp:2022", "udp:2022", "tcp:2375", "udp:2375"] as TailscaleNetworkCapability[],
    observability: ["tcp:9093", "tcp:19291", "tcp:9090", "tcp:3100", "tcp:8266", "udp:8266", "tcp:1883", "udp:1883", "tcp:8080", "udp:8080", "tcp:443", "udp:443"] as TailscaleNetworkCapability[],
    nut: ["tcp:3493", "udp:3493"] as TailscaleNetworkCapability[],
    proxmox: ["tcp:80", "tcp:443"] as TailscaleNetworkCapability[],
    proxmoxManagement: ["tcp:8006", "tcp:8007"] as TailscaleNetworkCapability[],
  } as const,
  autogroups: {
    member: "autogroup:member" as TailscaleAutogroups,
    self: "autogroup:self" as TailscaleAutogroups,
    tagged: "autogroup:tagged" as TailscaleAutogroups,
    shared: "autogroup:shared" as TailscaleAutogroups,
    internet: "autogroup:internet" as TailscaleAutogroups,
    admin: "autogroup:admin" as TailscaleAutogroups,
    owner: "autogroup:owner" as TailscaleAutogroups,
    iiAdmin: "autogroup:it-admin" as TailscaleAutogroups,
    networkAdmin: "autogroup:network-admin" as TailscaleAutogroups,
    billingAdmin: "autogroup:billing-admin" as TailscaleAutogroups,
    auditor: "autogroup:auditor" as TailscaleAutogroups,
  } as const,
  groups: {
    me: "group:me" as TailscaleGroups,
    admins: "group:admins" as TailscaleGroups,
    mediaManagers: "group:media-managers" as TailscaleGroups,
    family: "group:family" as TailscaleGroups,
    friends: "group:friends" as TailscaleGroups,
  } as const,
  tag: {
    exitNode: "tag:exit-node" as TailscaleTags,
    mediaDevice: "tag:media-device" as TailscaleTags,
    peerRelay: "tag:peer-relay" as TailscaleTags,
    sgc: "tag:sgc" as TailscaleTags,
    k8s: "tag:k8s" as TailscaleTags,
    equestria: "tag:equestria" as TailscaleTags,
    operator: "tag:operator" as TailscaleTags,
    recorder: "tag:recorder" as TailscaleTags,
    proxmox: "tag:proxmox" as TailscaleTags,
    dockge: "tag:dockge" as TailscaleTags,
    apps: "tag:apps" as TailscaleTags,
    sharedDrive: "tag:shared-drive" as TailscaleTags,
    egress: "tag:egress" as TailscaleTags,
    ingress: "tag:ingress" as TailscaleTags,
    management: "tag:management" as TailscaleTags,
    observability: "tag:observability" as TailscaleTags,
  } as const,
} as const;

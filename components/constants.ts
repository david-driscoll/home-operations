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

const tags = {
  sgc: "tag:sgc",
  equestria: "tag:equestria",
  operator: "tag:operator",
  proxmox: "tag:proxmox",
  dockge: "tag:dockge",
  apps: "tag:apps",
};

export const Tailscale = {
  tags,
  tagOwners: {
    [tags.proxmox]: [tags.proxmox],
    [tags.operator]: [tags.operator],
    [tags.sgc]: [tags.operator],
    [tags.equestria]: [tags.operator],
    "tag:ingress": [tags.operator],
    "tag:egress": [tags.operator],
    [tags.apps]: [tags.operator, tags.proxmox, tags.dockge],
    // Devices that really don't need much network access, except to things like plex.
    "tag:media-device": [],
    "tag:exit-node": [tags.operator, tags.proxmox],
    "tag:recorder": [tags.operator],
    [tags.dockge]: [tags.proxmox],
    "tag:automation-agent": [],
    "tag:ssh": [tags.operator],
  },

  autoApprovers: {
    exitNode: [tags.operator, tags.proxmox, tags.sgc, tags.equestria, tags.dockge],

    // todo:
    routes: {
      "10.10.0.0/16": [tags.sgc, tags.equestria],
      "10.196.0.0/16": [tags.equestria],
      "10.206.0.0/16": [tags.equestria],
      "10.199.0.0/16": [tags.sgc],
      "10.209.0.0/16": [tags.sgc],
    },

    services: {
      // "tag:ingress": [tags.apps, tags.sgc, tags.equestria, tags.operator],
      // "tag:egress": [tags.apps, tags.sgc, tags.equestria, tags.operator],
      // "tag:ssh": [tags.sgc, tags.equestria, tags.operator],
      "tag:apps": [tags.sgc, tags.equestria, tags.operator],
    },
  },
};

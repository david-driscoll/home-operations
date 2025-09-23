// TODO: Pull from tailscale???

export namespace Constants {
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
}

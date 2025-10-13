import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { Roles, Groups } from "../constants.ts";

interface GroupDef {
  groupName: string;
  parentName?: string;
}

export class AuthentikGroups extends pulumi.ComponentResource {
  private readonly groups = new Map<string, authentik.Group>();
  private readonly roles = new Map<string, authentik.RbacRole>();

  private readonly initialGroups: GroupDef[] = [
    { groupName: Roles.Users },
    { groupName: Roles.Admins, parentName: Roles.Users },
    { groupName: Roles.Editors, parentName: Roles.Users },
    { groupName: Roles.Family, parentName: Roles.Users },
    { groupName: Roles.Friends, parentName: Roles.Users },
    { groupName: Roles.MediaManagers, parentName: Roles.Users },
  ];

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikGroups", "authentik-groups", {}, opts);

    for (const group of this.initialGroups) {
      const roleResource = new authentik.RbacRole(
        group.groupName,
        {
          name: group.groupName,
        },
        { parent: this },
      );
      this.roles.set(group.groupName, roleResource);

      const parentGroup = group.parentName ? this.groups.get(group.parentName) : undefined;

      const groupResource = new authentik.Group(
        group.groupName,
        {
          name: group.groupName,
          roles: [roleResource.rbacRoleId],
          isSuperuser: group.groupName === Roles.Admins,
          ...(parentGroup && { parent: parentGroup.groupId }),
        },
        { parent: this },
      );
      this.groups.set(group.groupName, groupResource);
    }
  }

  public get allRoles() {
    return this.roles.entries();
  }
  public get allGroups() {
    return this.groups.entries();
  }

  public getGroup(groupName: string): authentik.Group {
    const group = this.groups.get(groupName);
    if (!group) {
      throw new Error(`Group '${groupName}' not found.`);
    }
    return group;
  }

  public getRole(roleName: string): authentik.RbacRole {
    const role = this.roles.get(roleName);
    if (!role) {
      throw new Error(`Role '${roleName}' not found.`);
    }
    return role;
  }
}

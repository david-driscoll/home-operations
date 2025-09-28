import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";

// Group resource types
export interface GroupInputs extends TruenasResourceInputs {
  /** Group name */
  name: pulumi.Input<string>;
  /** Group ID */
  gid?: pulumi.Input<number>;
  /** Allow sudo access */
  sudo?: pulumi.Input<boolean>;
  /** Allow sudo without password */
  sudo_nopasswd?: pulumi.Input<boolean>;
  /** Sudo commands */
  sudo_commands?: pulumi.Input<string[]>;
  /** Users in this group */
  users?: pulumi.Input<number[]>;
}

export interface GroupOutputs extends pulumi.Unwrap<GroupInputs>, TruenasResourceOutputs {
  /** Group ID (auto-assigned if not specified) */
  gid: number;
  /** Whether group is builtin */
  builtin: boolean;
  /** Whether group is local */
  local: boolean;
  /** NT name */
  nt_name?: string;
  /** SID */
  sid?: string;
  /** ID type both */
  id_type_both?: boolean;
}

// Group Provider Implementation
export class TruenasGroupProvider extends TruenasProvider<GroupInputs, GroupOutputs> {
  resourceType = "truenas:index:Group";

  protected isReplaceProperty(propertyName: string): boolean {
    // These properties require resource replacement
    return ["name"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<GroupInputs>): void {
    if (!inputs.name) {
      throw new Error("Group name is required");
    }
    if (inputs.name.includes(" ")) {
      throw new Error("Group name cannot contain spaces");
    }
    if (inputs.name.length > 32) {
      throw new Error("Group name cannot be longer than 32 characters");
    }
  }

  async create(inputs: pulumi.Unwrap<GroupInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const groupData: any = {
        name: inputs.name,
        sudo: inputs.sudo || false,
        sudo_nopasswd: inputs.sudo_nopasswd || false,
      };

      // Add optional properties
      if (inputs.gid !== undefined) groupData.gid = inputs.gid;
      if (inputs.sudo_commands) groupData.sudo_commands = inputs.sudo_commands;
      if (inputs.users) groupData.users = inputs.users;

      const truenas = await this.getClient(inputs.credential);
      const result = await truenas.group.create(groupData);

      const id = result.id?.toString() || this.generateId();

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          gid: result.gid,
          builtin: result.builtin,
          local: result.local,
          nt_name: result.nt_name,
          sid: result.sid,
          id_type_both: result.id_type_both,
        } as GroupOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to create group: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<GroupOutputs>, news: pulumi.Unwrap<GroupInputs>): Promise<Partial<pulumi.Unwrap<GroupOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.sudo !== olds.sudo) updateData.sudo = news.sudo;
      if (news.sudo_nopasswd !== olds.sudo_nopasswd) updateData.sudo_nopasswd = news.sudo_nopasswd;

      if (news.sudo_commands && JSON.stringify(news.sudo_commands) !== JSON.stringify(olds.sudo_commands)) {
        updateData.sudo_commands = news.sudo_commands;
      }
      if (news.users && JSON.stringify(news.users) !== JSON.stringify(olds.users)) {
        updateData.users = news.users;
      }

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await truenas.group.update(parseInt(id), updateData);
      }

      // Read updated group
      const result = await truenas.group.getInstance(parseInt(id));

      return {
        ...news,
        gid: result.gid,
        builtin: result.builtin,
        local: result.local,
        nt_name: result.nt_name,
        sid: result.sid,
        id_type_both: result.id_type_both,
      };
    } catch (error: any) {
      throw new Error(`Failed to update group: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<GroupOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      await truenas.group.delete(parseInt(id.toString()));
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete group: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<GroupOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<GroupOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await truenas.group.getInstance(parseInt(id.toString()));

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          name: result.name,
          gid: result.gid,
          sudo: result.sudo,
          sudo_nopasswd: result.sudo_nopasswd,
          sudo_commands: result.sudo_commands,
          users: result.users,
          builtin: result.builtin,
          local: result.local,
          nt_name: result.nt_name,
          sid: result.sid,
          id_type_both: result.id_type_both,
        } as pulumi.Unwrap<GroupOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// Group Resource Class
export class TruenasGroup extends TruenasResource<GroupInputs, GroupOutputs> {
  public readonly credential!: pulumi.Output<string>;
  public readonly name!: pulumi.Output<string>;
  public readonly gid!: pulumi.Output<number>;
  public readonly sudo!: pulumi.Output<boolean | undefined>;
  public readonly sudo_nopasswd!: pulumi.Output<boolean | undefined>;
  public readonly sudo_commands!: pulumi.Output<string[] | undefined>;
  public readonly users!: pulumi.Output<number[] | undefined>;
  public readonly builtin!: pulumi.Output<boolean>;
  public readonly local!: pulumi.Output<boolean>;
  public readonly nt_name!: pulumi.Output<string | undefined>;
  public readonly sid!: pulumi.Output<string | undefined>;
  public readonly id_type_both!: pulumi.Output<boolean | undefined>;

  constructor(name: string, args: GroupInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasGroupProvider();
    super("truenas:index:Group", name, args, provider, opts);
  }
}

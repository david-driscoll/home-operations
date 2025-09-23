import * as pulumi from "@pulumi/pulumi";
import { TruenasProvider, TruenasResource, TruenasResourceInputs, TruenasResourceOutputs } from "./truenas.js";
import { User } from "@components/truenas/truenas-types.js";

// User resource types
export interface UserInputs extends TruenasResourceInputs {
  /** Username */
  username: pulumi.Input<string>;
  /** Full name */
  full_name?: pulumi.Input<string>;
  /** Email address */
  email?: pulumi.Input<string>;
  /** Password */
  password?: pulumi.Input<string>;
  /** User ID */
  uid?: pulumi.Input<number>;
  /** Home directory */
  home?: pulumi.Input<string>;
  /** Shell */
  shell?: pulumi.Input<string>;
  /** Groups the user belongs to */
  groups?: pulumi.Input<number[]>;
  /** SSH public key */
  sshpubkey?: pulumi.Input<string>;
  /** Lock the user account */
  locked?: pulumi.Input<boolean>;
  /** Disable password authentication */
  password_disabled?: pulumi.Input<boolean>;
  /** Allow sudo access */
  sudo?: pulumi.Input<boolean>;
  /** Allow sudo without password */
  sudo_nopasswd?: pulumi.Input<boolean>;
  /** Sudo commands */
  sudo_commands?: pulumi.Input<string[]>;
  /** User attributes */
  attributes?: pulumi.Input<Record<string, any>>;
  /** Microsoft account integration */
  microsoft_account?: pulumi.Input<boolean>;
}

export interface UserOutputs extends pulumi.Unwrap<UserInputs>, TruenasResourceOutputs {
  /** User ID (auto-assigned if not specified) */
  uid: number;
  /** Unix hash (read-only) */
  unixhash?: string;
  /** SMB hash (read-only) */
  smbhash?: string;
  /** Whether user is builtin */
  builtin: boolean;
  /** Whether user is local */
  local: boolean;
  /** NT name */
  nt_name?: string;
  /** SID */
  sid?: string;
  /** ID type both */
  id_type_both?: boolean;
}

// User Provider Implementation
export class TruenasUserProvider extends TruenasProvider<UserInputs, UserOutputs> {
  resourceType = "truenas:index:User";

  protected isReplaceProperty(propertyName: string): boolean {
    // These properties require resource replacement
    return ["username"].includes(propertyName);
  }

  protected validateInputs(inputs: pulumi.Unwrap<UserInputs>): void {
    if (!inputs.username) {
      throw new Error("Username is required");
    }
    if (inputs.username.includes(" ")) {
      throw new Error("Username cannot contain spaces");
    }
    if (inputs.username.length > 32) {
      throw new Error("Username cannot be longer than 32 characters");
    }
  }

  async create(inputs: pulumi.Unwrap<UserInputs>): Promise<pulumi.dynamic.CreateResult> {
    this.validateInputs(inputs);

    try {
      const userData: any = {
        username: inputs.username,
        full_name: inputs.full_name || "",
        email: inputs.email || "",
        home: inputs.home || `/mnt/tank/home/${inputs.username}`,
        shell: inputs.shell || "/bin/bash",
        locked: inputs.locked || false,
        password_disabled: inputs.password_disabled || false,
        sudo: inputs.sudo || false,
        sudo_nopasswd: inputs.sudo_nopasswd || false,
        microsoft_account: inputs.microsoft_account || false,
      };

      // Add optional properties
      if (inputs.password) userData.password = inputs.password;
      if (inputs.uid !== undefined) userData.uid = inputs.uid;
      if (inputs.groups) userData.groups = inputs.groups;
      if (inputs.sshpubkey) userData.sshpubkey = inputs.sshpubkey;
      if (inputs.sudo_commands) userData.sudo_commands = inputs.sudo_commands;
      if (inputs.attributes) userData.attributes = inputs.attributes;

      const truenas = await this.getClient(inputs.credential);
      const result = await truenas["user.create"](userData);

      const id = result.id?.toString() || this.generateId();

      return {
        id: id,
        outs: {
          ...inputs,
          id: id,
          uid: result.uid,
          unixhash: result.unixhash,
          smbhash: result.smbhash,
          builtin: result.builtin,
          local: result.local,
          nt_name: result.nt_name,
          sid: result.sid,
          id_type_both: result.id_type_both,
        } as UserOutputs,
      };
    } catch (error: any) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  protected async doUpdate(id: string, olds: pulumi.Unwrap<UserOutputs>, news: pulumi.Unwrap<UserInputs>): Promise<Partial<pulumi.Unwrap<UserOutputs>>> {
    try {
      const updateData: any = {};

      // Update properties that can be changed
      if (news.full_name !== olds.full_name) updateData.full_name = news.full_name || "";
      if (news.email !== olds.email) updateData.email = news.email || "";
      if (news.password && news.password !== olds.password) updateData.password = news.password;
      if (news.home !== olds.home) updateData.home = news.home;
      if (news.shell !== olds.shell) updateData.shell = news.shell;
      if (news.locked !== olds.locked) updateData.locked = news.locked;
      if (news.password_disabled !== olds.password_disabled) updateData.password_disabled = news.password_disabled;
      if (news.sudo !== olds.sudo) updateData.sudo = news.sudo;
      if (news.sudo_nopasswd !== olds.sudo_nopasswd) updateData.sudo_nopasswd = news.sudo_nopasswd;
      if (news.microsoft_account !== olds.microsoft_account) updateData.microsoft_account = news.microsoft_account;

      if (news.groups && JSON.stringify(news.groups) !== JSON.stringify(olds.groups)) {
        updateData.groups = news.groups;
      }
      if (news.sshpubkey !== olds.sshpubkey) updateData.sshpubkey = news.sshpubkey;
      if (news.sudo_commands && JSON.stringify(news.sudo_commands) !== JSON.stringify(olds.sudo_commands)) {
        updateData.sudo_commands = news.sudo_commands;
      }
      if (news.attributes && JSON.stringify(news.attributes) !== JSON.stringify(olds.attributes)) {
        updateData.attributes = news.attributes;
      }

      const truenas = await this.getClient(news.credential);
      if (Object.keys(updateData).length > 0) {
        await truenas["user.update"](parseInt(id), updateData);
      }

      // Read updated user
      const result = await truenas["user.get_instance"](parseInt(id));

      return {
        ...news,
        uid: result.uid,
        unixhash: result.unixhash,
        smbhash: result.smbhash,
        builtin: result.builtin,
        local: result.local,
        nt_name: result.nt_name,
        sid: result.sid,
        id_type_both: result.id_type_both,
      };
    } catch (error: any) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  async delete(id: pulumi.ID, props: pulumi.Unwrap<UserOutputs>): Promise<void> {
    try {
      const truenas = await this.getClient(props.credential);
      await truenas["user.delete"](parseInt(id.toString()));
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw new Error(`Failed to delete user: ${error.message}`);
      }
    }
  }

  async read(id: pulumi.ID, props?: pulumi.Unwrap<UserOutputs>): Promise<pulumi.dynamic.ReadResult<pulumi.Unwrap<UserOutputs>>> {
    try {
      if (!props?.credential) {
        throw new Error("Credential is required for read operation");
      }

      const truenas = await this.getClient(props.credential);
      const result = await truenas["user.get_instance"](parseInt(id.toString()));

      return {
        id: id,
        props: {
          credential: props.credential,
          id: id.toString(),
          username: result.username,
          full_name: result.full_name,
          email: result.email,
          password: undefined, // Never return password
          uid: result.uid,
          home: result.home,
          shell: result.shell,
          groups: result.groups,
          sshpubkey: result.sshpubkey,
          locked: result.locked,
          password_disabled: result.password_disabled,
          sudo: result.sudo,
          sudo_nopasswd: result.sudo_nopasswd,
          sudo_commands: result.sudo_commands,
          attributes: result.attributes,
          microsoft_account: result.microsoft_account,
          unixhash: result.unixhash,
          smbhash: result.smbhash,
          builtin: result.builtin,
          local: result.local,
          nt_name: result.nt_name,
          sid: result.sid,
          id_type_both: result.id_type_both,
        } as pulumi.Unwrap<UserOutputs>,
      };
    } catch (error: any) {
      throw error;
    }
  }
}

// User Resource Class
export class TruenasUser extends TruenasResource<UserInputs, UserOutputs> {
  public readonly credential!: pulumi.Output<string>;
  public readonly username!: pulumi.Output<string>;
  public readonly full_name!: pulumi.Output<string | undefined>;
  public readonly email!: pulumi.Output<string | undefined>;
  public readonly password!: pulumi.Output<string | undefined>;
  public readonly uid!: pulumi.Output<number>;
  public readonly home!: pulumi.Output<string | undefined>;
  public readonly shell!: pulumi.Output<string | undefined>;
  public readonly groups!: pulumi.Output<number[] | undefined>;
  public readonly sshpubkey!: pulumi.Output<string | undefined>;
  public readonly locked!: pulumi.Output<boolean | undefined>;
  public readonly password_disabled!: pulumi.Output<boolean | undefined>;
  public readonly sudo!: pulumi.Output<boolean | undefined>;
  public readonly sudo_nopasswd!: pulumi.Output<boolean | undefined>;
  public readonly sudo_commands!: pulumi.Output<string[] | undefined>;
  public readonly attributes!: pulumi.Output<Record<string, any> | undefined>;
  public readonly microsoft_account!: pulumi.Output<boolean | undefined>;
  public readonly unixhash!: pulumi.Output<string | undefined>;
  public readonly smbhash!: pulumi.Output<string | undefined>;
  public readonly builtin!: pulumi.Output<boolean>;
  public readonly local!: pulumi.Output<boolean>;
  public readonly nt_name!: pulumi.Output<string | undefined>;
  public readonly sid!: pulumi.Output<string | undefined>;
  public readonly id_type_both!: pulumi.Output<boolean | undefined>;

  constructor(name: string, args: UserInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = new TruenasUserProvider();
    super("truenas:index:User", name, args, provider, opts);
  }
}

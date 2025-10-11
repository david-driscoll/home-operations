import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.js";

export class Fields extends SharedComponentResource {
  private _loginUser?: authentik.StagePromptField;
  private _username?: authentik.StagePromptField;
  private _email?: authentik.StagePromptField;
  private _name?: authentik.StagePromptField;
  private order = 0;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikFields", "authentik-fields", opts);
  }

  public get loginUser(): authentik.StagePromptField {
    if (!this._loginUser) {
      this._loginUser = this.createField("login-user", {
        label: "User",
        type: "username",
        fieldKey: "user",
        placeholder: "Username / Email",
        required: true,
      });
    }
    return this._loginUser;
  }

  public get username(): authentik.StagePromptField {
    if (!this._username) {
      this._username = this.createField("username", {
        label: "Username",
        type: "username",
        fieldKey: "username",
        placeholder: "Username",
      });
    }
    return this._username;
  }

  public get email(): authentik.StagePromptField {
    if (!this._email) {
      this._email = this.createField("email", {
        label: "Email",
        type: "email",
        fieldKey: "email",
        placeholder: "Email",
      });
    }
    return this._email;
  }

  public get name(): authentik.StagePromptField {
    if (!this._name) {
      this._name = this.createField("name", {
        label: "Name",
        type: "text",
        fieldKey: "name",
        placeholder: "Name (first is fine)",
        required: true,
      });
    }
    return this._name;
  }

  private createField(
    name: string,
    args: Omit<authentik.StagePromptFieldArgs, "order">
  ): authentik.StagePromptField {
    const currentOrder = this.order;
    this.order += 10;
    return new authentik.StagePromptField(
      name,
      {
        ...args,
        order: currentOrder,
      },
      this.parent
    );
  }
}

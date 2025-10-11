import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.js";

export class InvalidationStages extends SharedComponentResource {
  private _logout?: authentik.StageUserLogout;
  private _providerLogout?: authentik.StageUserLogout;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:InvalidationStages", "stages-invalidation", opts);
  }

  public get logout(): authentik.StageUserLogout {
    if (!this._logout) {
      this._logout = new authentik.StageUserLogout(
        "custom-authentication-logout",
        {},
        this.parent
      );
    }
    return this._logout;
  }

  public get providerLogout(): authentik.StageUserLogout {
    if (!this._providerLogout) {
      this._providerLogout = new authentik.StageUserLogout(
        "custom-authentication-provider-logout",
        {},
        this.parent
      );
    }
    return this._providerLogout;
  }
}

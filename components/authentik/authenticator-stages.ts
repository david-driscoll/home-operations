import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.js";
import { DefaultFlows } from "./default-flows.ts";

export class AuthenticatorStages extends SharedComponentResource {
  private _backupCodes?: authentik.StageAuthenticatorStatic;
  private _totp?: authentik.StageAuthenticatorTotp;
  private _passkey?: authentik.StageAuthenticatorWebauthn;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthenticatorStages", "stages-authenticator", opts);
  }

  public get backupCodes(): authentik.StageAuthenticatorStatic {
    if (!this._backupCodes) {
      this._backupCodes = new authentik.StageAuthenticatorStatic(
        "authenticator-static",
        {
          tokenCount: 8,
          tokenLength: 12,
          friendlyName: "Backup Codes",
          configureFlow: DefaultFlows.authenticatorStaticSetup.apply((z) => z.id),
        },
        this.parent
      );
    }
    return this._backupCodes;
  }

  public get totp(): authentik.StageAuthenticatorTotp {
    if (!this._totp) {
      this._totp = new authentik.StageAuthenticatorTotp(
        "authenticator-totp",
        {
          friendlyName: "TOTP Codes",
          configureFlow: DefaultFlows.authenticatorTotpSetup.apply((z) => z.id),
          digits: "8",
        },
        this.parent
      );
    }
    return this._totp;
  }

  public get passkey(): authentik.StageAuthenticatorWebauthn {
    if (!this._passkey) {
      this._passkey = new authentik.StageAuthenticatorWebauthn(
        "authenticator-passkey",
        {
          friendlyName: "Passkey",
          configureFlow: DefaultFlows.authenticatorWebauthnSetup.apply((z) => z.id),
          residentKeyRequirement: "preferred",
          userVerification: "required",
        },
        this.parent
      );
    }
    return this._passkey;
  }
}

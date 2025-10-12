import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { SharedComponentResource } from "./shared-component-resource.ts";
import { AuthenticatorStages } from "./authenticator-stages.js";
import { DefaultFlows } from "./default-flows.ts";

export class AuthenticationStages extends SharedComponentResource {
  private _mfa?: authentik.StageAuthenticatorValidate;
  private _login?: authentik.StageUserLogin;
  private _sourceLogin?: authentik.StageUserLogin;
  private _password?: authentik.StagePassword;

  constructor(private authenticatorStages: AuthenticatorStages, opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthenticationStages", "stages-authentication", opts);
  }

  public get mfa(): authentik.StageAuthenticatorValidate {
    if (!this._mfa) {
      this._mfa = new authentik.StageAuthenticatorValidate(
        "authentication-mfa",
        {
          deviceClasses: ["static", "totp", "webauthn"],
          notConfiguredAction: "configure",
          configurationStages: [
            this.authenticatorStages.passkey.stageAuthenticatorWebauthnId,
            this.authenticatorStages.totp.stageAuthenticatorTotpId,
            this.authenticatorStages.backupCodes.stageAuthenticatorStaticId,
          ],
          lastAuthThreshold: "days=7",
          webauthnUserVerification: "preferred",
        },
        this.parent
      );
    }
    return this._mfa;
  }

  public get login(): authentik.StageUserLogin {
    if (!this._login) {
      this._login = new authentik.StageUserLogin(
        "authentication-login",
        {
          rememberMeOffset: "days=29",
          sessionDuration: "days=1",
        },
        this.parent
      );
    }
    return this._login;
  }

  public get sourceLogin(): authentik.StageUserLogin {
    if (!this._sourceLogin) {
      this._sourceLogin = new authentik.StageUserLogin(
        "authentication-source-login",
        {
          rememberMeOffset: "days=29",
          sessionDuration: "days=1",
        },
        this.parent
      );
    }
    return this._sourceLogin;
  }

  public get password(): authentik.StagePassword {
    if (!this._password) {
      this._password = new authentik.StagePassword(
        "authentication-password",
        {
          backends: ["authentik.core.auth.InbuiltBackend", "authentik.core.auth.TokenBackend"],
          allowShowPassword: true,
          configureFlow: DefaultFlows.passwordChange.apply((z) => z.id),
        },
        this.parent
      );
    }
    return this._password;
  }
}

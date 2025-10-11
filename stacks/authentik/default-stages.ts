import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";

export const DefaultStagesParent = new pulumi.ComponentResource(
  "custom:resource:DefaultStages",
  "authentik-default-stages"
);

function getStageLazy(name: string): pulumi.Output<authentik.GetStageResult> {
  return pulumi.output(authentik.getStage({ name }, { parent: DefaultStagesParent }));
}

export class DefaultStages {
  private static _authenticationIdentification?: pulumi.Output<authentik.GetStageResult>;
  private static _authenticationLogin?: pulumi.Output<authentik.GetStageResult>;
  private static _authenticationMfaValidation?: pulumi.Output<authentik.GetStageResult>;
  private static _authenticationPassword?: pulumi.Output<authentik.GetStageResult>;
  private static _authenticatorStaticSetup?: pulumi.Output<authentik.GetStageResult>;
  private static _authenticatorTotpSetup?: pulumi.Output<authentik.GetStageResult>;
  private static _authenticatorWebauthnSetup?: pulumi.Output<authentik.GetStageResult>;
  private static _invalidationLogout?: pulumi.Output<authentik.GetStageResult>;
  private static _passwordChangePrompt?: pulumi.Output<authentik.GetStageResult>;
  private static _passwordChangeWrite?: pulumi.Output<authentik.GetStageResult>;
  private static _providerAuthorizationConsent?: pulumi.Output<authentik.GetStageResult>;
  private static _sourceAuthenticationLogin?: pulumi.Output<authentik.GetStageResult>;
  private static _sourceEnrollmentLogin?: pulumi.Output<authentik.GetStageResult>;
  private static _sourceEnrollmentPrompt?: pulumi.Output<authentik.GetStageResult>;
  private static _sourceEnrollmentWrite?: pulumi.Output<authentik.GetStageResult>;
  private static _userSettings?: pulumi.Output<authentik.GetStageResult>;
  private static _userSettingsWrite?: pulumi.Output<authentik.GetStageResult>;

  public static get authenticationIdentification(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticationIdentification ??= getStageLazy("default-authentication-identification");
  }

  public static get authenticationLogin(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticationLogin ??= getStageLazy("default-authentication-login");
  }

  public static get authenticationMfaValidation(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticationMfaValidation ??= getStageLazy("default-authentication-mfa-validation");
  }

  public static get authenticationPassword(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticationPassword ??= getStageLazy("default-authentication-password");
  }

  public static get authenticatorStaticSetup(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticatorStaticSetup ??= getStageLazy("default-authenticator-static-setup");
  }

  public static get authenticatorTotpSetup(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticatorTotpSetup ??= getStageLazy("default-authenticator-totp-setup");
  }

  public static get authenticatorWebauthnSetup(): pulumi.Output<authentik.GetStageResult> {
    return this._authenticatorWebauthnSetup ??= getStageLazy("default-authenticator-webauthn-setup");
  }

  public static get invalidationLogout(): pulumi.Output<authentik.GetStageResult> {
    return this._invalidationLogout ??= getStageLazy("default-invalidation-logout");
  }

  public static get passwordChangePrompt(): pulumi.Output<authentik.GetStageResult> {
    return this._passwordChangePrompt ??= getStageLazy("default-password-change-prompt");
  }

  public static get passwordChangeWrite(): pulumi.Output<authentik.GetStageResult> {
    return this._passwordChangeWrite ??= getStageLazy("default-password-change-write");
  }

  public static get providerAuthorizationConsent(): pulumi.Output<authentik.GetStageResult> {
    return this._providerAuthorizationConsent ??= getStageLazy("default-provider-authorization-consent");
  }

  public static get sourceAuthenticationLogin(): pulumi.Output<authentik.GetStageResult> {
    return this._sourceAuthenticationLogin ??= getStageLazy("default-source-authentication-login");
  }

  public static get sourceEnrollmentLogin(): pulumi.Output<authentik.GetStageResult> {
    return this._sourceEnrollmentLogin ??= getStageLazy("default-source-enrollment-login");
  }

  public static get sourceEnrollmentPrompt(): pulumi.Output<authentik.GetStageResult> {
    return this._sourceEnrollmentPrompt ??= getStageLazy("default-source-enrollment-prompt");
  }

  public static get sourceEnrollmentWrite(): pulumi.Output<authentik.GetStageResult> {
    return this._sourceEnrollmentWrite ??= getStageLazy("default-source-enrollment-write");
  }

  public static get userSettings(): pulumi.Output<authentik.GetStageResult> {
    return this._userSettings ??= getStageLazy("default-user-settings");
  }

  public static get userSettingsWrite(): pulumi.Output<authentik.GetStageResult> {
    return this._userSettingsWrite ??= getStageLazy("default-user-settings-write");
  }
}

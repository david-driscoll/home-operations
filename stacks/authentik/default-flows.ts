import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";

export const DefaultFlowsParent = new pulumi.ComponentResource(
  "custom:resource:DefaultFlows",
  "authentik-default-flows"
);

function getFlowLazy(slug: string): pulumi.Output<authentik.GetFlowResult> {
  return pulumi.output(authentik.getFlow({ slug }, { parent: DefaultFlowsParent }));
}

export class DefaultFlows {
  private static _authenticationFlow?: pulumi.Output<authentik.GetFlowResult>;
  private static _sourceAuthentication?: pulumi.Output<authentik.GetFlowResult>;
  private static _providerAuthorizationExplicitConsent?: pulumi.Output<authentik.GetFlowResult>;
  private static _providerAuthorizationImplicitConsent?: pulumi.Output<authentik.GetFlowResult>;
  private static _sourceEnrollment?: pulumi.Output<authentik.GetFlowResult>;
  private static _invalidationFlow?: pulumi.Output<authentik.GetFlowResult>;
  private static _providerInvalidationFlow?: pulumi.Output<authentik.GetFlowResult>;
  private static _authenticatorStaticSetup?: pulumi.Output<authentik.GetFlowResult>;
  private static _authenticatorTotpSetup?: pulumi.Output<authentik.GetFlowResult>;
  private static _authenticatorWebauthnSetup?: pulumi.Output<authentik.GetFlowResult>;
  private static _passwordChange?: pulumi.Output<authentik.GetFlowResult>;
  private static _sourcePreAuthentication?: pulumi.Output<authentik.GetFlowResult>;
  private static _userSettingsFlow?: pulumi.Output<authentik.GetFlowResult>;

  public static get authenticationFlow(): pulumi.Output<authentik.GetFlowResult> {
    return this._authenticationFlow ??= getFlowLazy("default-authentication-flow");
  }

  public static get sourceAuthentication(): pulumi.Output<authentik.GetFlowResult> {
    return this._sourceAuthentication ??= getFlowLazy("default-source-authentication");
  }

  public static get providerAuthorizationExplicitConsent(): pulumi.Output<authentik.GetFlowResult> {
    return this._providerAuthorizationExplicitConsent ??= getFlowLazy("default-provider-authorization-explicit-consent");
  }

  public static get providerAuthorizationImplicitConsent(): pulumi.Output<authentik.GetFlowResult> {
    return this._providerAuthorizationImplicitConsent ??= getFlowLazy("default-provider-authorization-implicit-consent");
  }

  public static get sourceEnrollment(): pulumi.Output<authentik.GetFlowResult> {
    return this._sourceEnrollment ??= getFlowLazy("default-source-enrollment");
  }

  public static get invalidationFlow(): pulumi.Output<authentik.GetFlowResult> {
    return this._invalidationFlow ??= getFlowLazy("default-invalidation-flow");
  }

  public static get providerInvalidationFlow(): pulumi.Output<authentik.GetFlowResult> {
    return this._providerInvalidationFlow ??= getFlowLazy("default-provider-invalidation-flow");
  }

  public static get authenticatorStaticSetup(): pulumi.Output<authentik.GetFlowResult> {
    return this._authenticatorStaticSetup ??= getFlowLazy("default-authenticator-static-setup");
  }

  public static get authenticatorTotpSetup(): pulumi.Output<authentik.GetFlowResult> {
    return this._authenticatorTotpSetup ??= getFlowLazy("default-authenticator-totp-setup");
  }

  public static get authenticatorWebauthnSetup(): pulumi.Output<authentik.GetFlowResult> {
    return this._authenticatorWebauthnSetup ??= getFlowLazy("default-authenticator-webauthn-setup");
  }

  public static get passwordChange(): pulumi.Output<authentik.GetFlowResult> {
    return this._passwordChange ??= getFlowLazy("default-password-change");
  }

  public static get sourcePreAuthentication(): pulumi.Output<authentik.GetFlowResult> {
    return this._sourcePreAuthentication ??= getFlowLazy("default-source-pre-authentication");
  }

  public static get userSettingsFlow(): pulumi.Output<authentik.GetFlowResult> {
    return this._userSettingsFlow ??= getFlowLazy("default-user-settings-flow");
  }
}

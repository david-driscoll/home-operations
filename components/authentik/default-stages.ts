import * as authentik from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";

export const DefaultStagesParent = new pulumi.ComponentResource("custom:resource:DefaultStages", "authentik-default-stages");

function getStageLazy(name: string) {
  return pulumi.output(authentik.getStage({ name }, { parent: DefaultStagesParent }));
}

let _authenticationIdentification: ReturnType<typeof getStageLazy>;
export function getAuthenticationIdentification() {
  return (_authenticationIdentification ??= getStageLazy("default-authentication-identification"));
}

let _authenticationLogin: ReturnType<typeof getStageLazy>;
export function getAuthenticationLogin() {
  return (_authenticationLogin ??= getStageLazy("default-authentication-login"));
}

let _authenticationMfaValidation: ReturnType<typeof getStageLazy>;
export function getAuthenticationMfaValidation() {
  return (_authenticationMfaValidation ??= getStageLazy("default-authentication-mfa-validation"));
}

let _authenticationPassword: ReturnType<typeof getStageLazy>;
export function getAuthenticationPassword() {
  return (_authenticationPassword ??= getStageLazy("default-authentication-password"));
}

let _authenticatorStaticSetup: ReturnType<typeof getStageLazy>;
export function getAuthenticatorStaticSetup() {
  return (_authenticatorStaticSetup ??= getStageLazy("default-authenticator-static-setup"));
}

let _authenticatorTotpSetup: ReturnType<typeof getStageLazy>;
export function getAuthenticatorTotpSetup() {
  return (_authenticatorTotpSetup ??= getStageLazy("default-authenticator-totp-setup"));
}

let _authenticatorWebauthnSetup: ReturnType<typeof getStageLazy>;
export function getAuthenticatorWebauthnSetup() {
  return (_authenticatorWebauthnSetup ??= getStageLazy("default-authenticator-webauthn-setup"));
}

let _invalidationLogout: ReturnType<typeof getStageLazy>;
export function getInvalidationLogout() {
  return (_invalidationLogout ??= getStageLazy("default-invalidation-logout"));
}

let _passwordChangePrompt: ReturnType<typeof getStageLazy>;
export function getPasswordChangePrompt() {
  return (_passwordChangePrompt ??= getStageLazy("default-password-change-prompt"));
}

let _passwordChangeWrite: ReturnType<typeof getStageLazy>;
export function getPasswordChangeWrite() {
  return (_passwordChangeWrite ??= getStageLazy("default-password-change-write"));
}

let _providerAuthorizationConsent: ReturnType<typeof getStageLazy>;
export function getProviderAuthorizationConsent() {
  return (_providerAuthorizationConsent ??= getStageLazy("default-provider-authorization-consent"));
}

let _sourceAuthenticationLogin: ReturnType<typeof getStageLazy>;
export function getSourceAuthenticationLogin() {
  return (_sourceAuthenticationLogin ??= getStageLazy("default-source-authentication-login"));
}

let _sourceEnrollmentLogin: ReturnType<typeof getStageLazy>;
export function getSourceEnrollmentLogin() {
  return (_sourceEnrollmentLogin ??= getStageLazy("default-source-enrollment-login"));
}

let _sourceEnrollmentPrompt: ReturnType<typeof getStageLazy>;
export function getSourceEnrollmentPrompt() {
  return (_sourceEnrollmentPrompt ??= getStageLazy("default-source-enrollment-prompt"));
}

let _sourceEnrollmentWrite: ReturnType<typeof getStageLazy>;
export function getSourceEnrollmentWrite() {
  return (_sourceEnrollmentWrite ??= getStageLazy("default-source-enrollment-write"));
}

let _userSettings: ReturnType<typeof getStageLazy>;
export function getUserSettings() {
  return (_userSettings ??= getStageLazy("default-user-settings"));
}

let _userSettingsWrite: ReturnType<typeof getStageLazy>;
export function getUserSettingsWrite() {
  return (_userSettingsWrite ??= getStageLazy("default-user-settings-write"));
}

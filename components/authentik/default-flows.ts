import * as authentik from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";

export const DefaultFlowsParent = new pulumi.ComponentResource("custom:resource:DefaultFlows", "authentik-default-flows");

function getFlowLazy(slug: string) {
  return pulumi.output(authentik.getFlow({ slug }, { parent: DefaultFlowsParent }));
}

let _authenticationFlow: ReturnType<typeof getFlowLazy>;
let _sourceAuthentication: ReturnType<typeof getFlowLazy>;
let _providerAuthorizationExplicitConsent: ReturnType<typeof getFlowLazy>;
let _providerAuthorizationImplicitConsent: ReturnType<typeof getFlowLazy>;
let _sourceEnrollment: ReturnType<typeof getFlowLazy>;
let _invalidationFlow: ReturnType<typeof getFlowLazy>;
let _providerInvalidationFlow: ReturnType<typeof getFlowLazy>;
let _authenticatorStaticSetup: ReturnType<typeof getFlowLazy>;
let _authenticatorTotpSetup: ReturnType<typeof getFlowLazy>;
let _authenticatorWebauthnSetup: ReturnType<typeof getFlowLazy>;
let _passwordChange: ReturnType<typeof getFlowLazy>;
let _sourcePreAuthentication: ReturnType<typeof getFlowLazy>;
let _userSettingsFlow: ReturnType<typeof getFlowLazy>;

export function authenticationFlow() {
  return (_authenticationFlow ??= getFlowLazy("default-authentication-flow"));
}

export function sourceAuthentication() {
  return (_sourceAuthentication ??= getFlowLazy("default-source-authentication"));
}

export function providerAuthorizationExplicitConsent() {
  return (_providerAuthorizationExplicitConsent ??= getFlowLazy("default-provider-authorization-explicit-consent"));
}

export function providerAuthorizationImplicitConsent() {
  return (_providerAuthorizationImplicitConsent ??= getFlowLazy("default-provider-authorization-implicit-consent"));
}

export function sourceEnrollment() {
  return (_sourceEnrollment ??= getFlowLazy("default-source-enrollment"));
}

export function invalidationFlow() {
  return (_invalidationFlow ??= getFlowLazy("default-invalidation-flow"));
}

export function providerInvalidationFlow() {
  return (_providerInvalidationFlow ??= getFlowLazy("default-provider-invalidation-flow"));
}

export function authenticatorStaticSetup() {
  return (_authenticatorStaticSetup ??= getFlowLazy("default-authenticator-static-setup"));
}

export function authenticatorTotpSetup() {
  return (_authenticatorTotpSetup ??= getFlowLazy("default-authenticator-totp-setup"));
}

export function authenticatorWebauthnSetup() {
  return (_authenticatorWebauthnSetup ??= getFlowLazy("default-authenticator-webauthn-setup"));
}

export function passwordChange() {
  return (_passwordChange ??= getFlowLazy("default-password-change"));
}

export function sourcePreAuthentication() {
  return (_sourcePreAuthentication ??= getFlowLazy("default-source-pre-authentication"));
}

export function userSettingsFlow() {
  return (_userSettingsFlow ??= getFlowLazy("default-user-settings-flow"));
}

# Flows Manager

Comprehensive Authentik flow management system handling authentication, enrollment, consent, and MFA configuration flows.

## Overview

The `FlowsManager` creates and configures all Authentik flows, stages, and sources needed for a complete authentication system.

## Created Flows

### Authentication Flows

- **Authentication Flow** (`authentication-flow`): Main login flow with source identification, password authentication, and MFA validation
- **Source Authentication Flow** (`source-authentication-flow`): Login flow for external sources (Plex, Tailscale)

### Enrollment Flows

- **Enrollment Flow** (`enrollment-flow`): New user registration with default group assignment

### Consent Flows

- **Implicit Consent Flow** (`implicit-consent-flow`): Automatic redirect without user consent
- **Explicit Consent Flow** (`explicit-consent-flow`): Requires user consent before redirecting

### Logout Flows

- **Logout Flow** (`logout-flow`): Standard user logout
- **Provider Logout Flow** (`provider-logout-flow`): Provider-specific logout with custom messaging

### MFA Configuration Flows

- **Authenticator Backup Codes Flow** (`authenticator-backup-codes-flow`): Setup recovery codes
- **Authenticator TOTP Flow** (`authenticator-totp-flow`): Setup TOTP authenticator
- **Authenticator WebAuthn Flow** (`authenticator-webauthn-flow`): Setup passkey/FIDO2

### User Settings Flow

- **User Settings Flow** (`user-settings-flow`): User profile editing with authorization policy

## Sources

### Tailscale Source

- **Provider**: OpenID Connect
- **Well-Known URL**: `https://idp.opossum-yo.ts.net/.well-known/openid-configuration`
- **User Matching**: Email linking
- **User Path Template**: `driscoll.dev/tailscale/%(slug)s`

### Plex Source

- **Provider**: Plex.tv
- **Credentials**: Loaded from 1Password ("Authentik Plex Source")
- **Server Restrictions**: Configurable allowed servers
- **Friend Access**: Enabled
- **User Path Template**: `driscoll.dev/plex/%(slug)s`

## Flow Architecture

### Authentication Flow Stages

1. Source Identification (Tailscale/Plex login buttons)
2. Username/Email Identification
3. MFA Validation
4. User Login

### Enrollment Flow Stages

1. Enrollment Prompt (username, email, name)
2. Default Groups Policy (assigns users to default groups)
3. Internal Enrollment Write Stage
4. Source Login

### User Settings Flow Stages

1. User Settings Prompt (editable fields)
2. User Settings Authorization Policy (restricts field access)
3. Internal Enrollment Write Stage

## Dependencies

The FlowsManager aggregates all stage and policy managers:

- `PropertyMappings` - OAuth scope mappings
- `Policies` - Authorization policies
- `ConsentStages` - Consent stage definitions
- `Fields` - Form field definitions
- `StagePrompts` - Prompt stages with fields
- `InvalidationStages` - Logout stages
- `AuthenticatorStages` - MFA device setup stages
- `AuthenticationStages` - Login and password stages

## Usage

```typescript
import { FlowsManager } from "./resources/flows.js";
import { OPClient } from "../components/op.ts";

const opClient = new OPClient({ parent: this });
const flowsManager = new FlowsManager({ parent: this });
const flows = flowsManager.createFlows(opClient);

// Use flows in application providers
const provider = new authentik.ProviderOauth2({
  authorizationFlow: flows.authenticationFlow.uuid,
  invalidationFlow: flows.providerLogoutFlow.uuid,
});
```

## Integration Points

### 1Password Integration

- Plex source credentials fetched from 1Password vault
- Item: "Authentik Plex Source"
- Fields: `username` (clientId), `credential` (plexToken)
- Sections: `servers` (allowed server UUIDs)

### Policy Bindings

- **Source Authentication**: Requires SSO authentication
- **Enrollment**: Requires SSO enrollment
- **Default Groups**: Assigns new users to default groups
- **User Settings**: Restricts field editing permissions

### Flow Bindings

- Stages are bound to flows using `addFlowStageBinding`
- Policies are bound using `addPolicyBindingToFlow`
- Order matters - stages execute in binding order

## Customization

### Adding a New Source

```typescript
const mySource = new authentik.SourceOauth("my-source", {
  providerType: "openidconnect",
  oidcWellKnownUrl: "https://provider/.well-known/openid-configuration",
  authenticationFlow: authenticationFlow.uuid,
  enrollmentFlow: enrollmentFlow.uuid,
});
```

### Adding Flow Stages

```typescript
addFlowStageBinding(flow, stage.stageId);
```

### Adding Flow Policies

```typescript
addPolicyBindingToFlow(flow, policy.policyExpressionId);
```

## Notes

- All flows use `compatibilityMode: true` for backwards compatibility
- Policy engine mode is set to `any` (any policy can match)
- Authentication flows use `sidebar_left` layout
- Configuration flows use `stacked` layout
- Consent flows use `content_right` layout

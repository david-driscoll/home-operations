import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { addFlowStageBinding, addPolicyBindingToFlow } from "./extension-methods.js";

/**
 * Example flows implementation (simplified from the C# version)
 *
 * This shows the pattern for creating Authentik flows and stages.
 * The full implementation would include all flows from Flows2.cs
 */

export interface CustomFlows {
  logoutFlow: authentik.Flow;
  authenticationFlow: authentik.Flow;
  // Add other flows as needed
}

export class FlowsManager extends pulumi.ComponentResource {
  public readonly flows: CustomFlows;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikFlows", "authentik-flows", {}, opts);

    // Create logout flow
    const logoutFlow = new authentik.Flow(
      "logout-flow",
      {
        name: "Logout",
        title: "Logout",
        slug: "logout-flow",
        layout: "stacked",
        designation: "invalidation",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "none",
      },
      { parent: this }
    );

    // Create logout stage
    const logoutStage = new authentik.StageUserLogout(
      "logout-stage",
      {},
      { parent: this }
    );

    // Add stage to flow
    addFlowStageBinding(logoutFlow, logoutStage.stageUserLogoutId);

    // Create authentication flow
    const authenticationFlow = new authentik.Flow(
      "authentication-flow",
      {
        name: "Driscoll Home",
        title: "Welcome to Driscoll Tech Net!",
        slug: "authentication-flow",
        layout: "sidebar_left",
        designation: "authentication",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "none",
      },
      { parent: this }
    );

    // Create identification stage
    const identificationStage = new authentik.StageIdentification(
      "authentication-identification",
      {
        caseInsensitiveMatching: true,
        // passwordStage: passwordStage.stagePasswordId, // Reference password stage
        enableRememberMe: true,
        showMatchedUser: true,
        userFields: ["email", "username"],
        pretendUserExists: false,
      },
      { parent: this }
    );

    // Create password stage
    const passwordStage = new authentik.StagePassword(
      "authentication-password",
      {
        backends: [
          "authentik.core.auth.InbuiltBackend",
          "authentik.sources.ldap.auth.LDAPBackend",
          "authentik.core.auth.TokenBackend",
        ],
      },
      { parent: this }
    );

    // Create login stage
    const loginStage = new authentik.StageUserLogin(
      "authentication-login",
      {
        sessionDuration: "seconds=0", // Use default duration
      },
      { parent: this }
    );

    // Add stages to authentication flow
    addFlowStageBinding(authenticationFlow, identificationStage.stageIdentificationId);
    addFlowStageBinding(authenticationFlow, passwordStage.stagePasswordId);
    addFlowStageBinding(authenticationFlow, loginStage.stageUserLoginId);

    this.flows = {
      logoutFlow,
      authenticationFlow,
    };
  }
}

// Example of creating source integrations
export function createTailscaleSource(
  enrollmentFlow: authentik.Flow,
  authenticationFlow: authentik.Flow,
  opts?: pulumi.ComponentResourceOptions
): authentik.SourceOauth {
  return new authentik.SourceOauth(
    "tailscale",
    {
      name: "Tailscale",
      slug: "tailscale",
      providerType: "openidconnect",
      enabled: true,
      policyEngineMode: "any",
      userPathTemplate: "driscoll.dev/tailscale/%(slug)s",
      oidcWellKnownUrl: "https://idp.opossum-yo.ts.net/.well-known/openid-configuration",
      consumerKey: "unused",
      consumerSecret: "unused",
      userMatchingMode: "email_link",
      groupMatchingMode: "name_link",
      authenticationFlow: authenticationFlow.uuid,
      enrollmentFlow: enrollmentFlow.uuid,
    },
    opts
  );
}

// Example of creating OAuth2 scopes
export function createOAuth2Scopes(opts?: pulumi.ComponentResourceOptions): authentik.ScopeMapping[] {
  const immichScope = new authentik.ScopeMapping(
    "immich_role",
    {
      scopeName: "immich_role",
      description: "Enable better Immich support in authentik",
      expression: 'return {"immich_role": "admin" if request.user.is_superuser else "user"}',
    },
    opts
  );

  const vikunjaScope = new authentik.ScopeMapping(
    "vikunja",
    {
      scopeName: "vikunja",
      description: "Enable better vikunja support in authentik",
      expression: `groupsDict = {"vikunja_groups": []}
for group in request.user.ak_groups.all():
  groupsDict["vikunja_groups"].append({"name": group.name, "oidcID": group.num_pk})
return groupsDict`,
    },
    opts
  );

  return [immichScope, vikunjaScope];
}

import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { PropertyMappings } from "./property-mappings.js";
import { Policies } from "./policies.js";
import { ConsentStages } from "./consent-stages.js";
import { Fields } from "./fields.js";
import { StagePrompts } from "./stage-prompts.js";
import { InvalidationStages } from "./invalidation-stages.js";
import { AuthenticatorStages } from "./authenticator-stages.js";
import { AuthenticationStages } from "./authentication-stages.js";
import { addFlowStageBinding, addPolicyBindingToFlow } from "./extension-methods.js";
import { OPClient } from "../op.ts";

interface PlexServerField {
  value?: string;
}

interface PlexItemFields {
  username: { value?: string };
  credential: { value?: string };
}

interface PlexItemSections {
  servers?: {
    fields?: Record<string, PlexServerField>;
  };
}

interface PlexItem {
  fields: PlexItemFields;
  sections: PlexItemSections;
}

export interface CustomFlows {
  logoutFlow: authentik.Flow;
  providerLogoutFlow: authentik.Flow;
  authenticatorBackupCodesFlow: authentik.Flow;
  authenticatorTotpFlow: authentik.Flow;
  authenticatorWebauthnFlow: authentik.Flow;
  userSettingsFlow: authentik.Flow;
  implicitConsentFlow: authentik.Flow;
  explicitConsentFlow: authentik.Flow;
  authenticationFlow: authentik.Flow;
  sourceAuthenticationFlow: authentik.Flow;
  enrollmentFlow: authentik.Flow;
}

export class FlowsManager extends pulumi.ComponentResource {
  public readonly propertyMappings: PropertyMappings;
  public readonly policies: Policies;
  private readonly stagesComponent: pulumi.ComponentResource;
  private readonly sourcesComponent: pulumi.ComponentResource;
  private readonly flowsComponent: pulumi.ComponentResource;
  public readonly consentStages: ConsentStages;
  public readonly fields: Fields;
  public readonly stagePrompts: StagePrompts;
  public readonly invalidationStages: InvalidationStages;
  public readonly authenticatorStages: AuthenticatorStages;
  public readonly authenticationStages: AuthenticationStages;

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:FlowsManager", "flows-manager", {}, opts);

    this.propertyMappings = new PropertyMappings({ parent: this });
    this.policies = new Policies({ parent: this });

    this.stagesComponent = new pulumi.ComponentResource("custom:resource:AuthentikStages", "authentik-stages", {}, { parent: this });
    this.sourcesComponent = new pulumi.ComponentResource("custom:resource:sources", "authentik-sources", {}, { parent: this });
    this.flowsComponent = new pulumi.ComponentResource("custom:resource:flows", "authentik-flows", {}, { parent: this });

    this.consentStages = new ConsentStages({ parent: this.stagesComponent });
    this.fields = new Fields({ parent: this.stagesComponent });
    this.stagePrompts = new StagePrompts(this.fields, { parent: this.stagesComponent });
    this.invalidationStages = new InvalidationStages({ parent: this.stagesComponent });
    this.authenticatorStages = new AuthenticatorStages({ parent: this.stagesComponent });
    this.authenticationStages = new AuthenticationStages(this.authenticatorStages, { parent: this.stagesComponent });
  }

  public createFlows(opClient: OPClient): CustomFlows {
    const logoutFlow = this.createLogoutFlow();
    const providerLogoutFlow = this.createProviderLogoutFlow();
    const authenticatorBackupCodesFlow = this.createAuthenticatorBackupCodesFlow();
    const authenticatorTotpFlow = this.createAuthenticatorTotpFlow();
    const authenticatorWebauthnFlow = this.createAuthenticatorWebauthnFlow();
    const userSettingsFlow = this.createUserSettingsFlow();
    const implicitConsentFlow = this.createImplicitConsent();
    const explicitConsentFlow = this.createExplicitConsent();

    const enrollmentFlow = this.createEnrollmentFlow();
    const authenticationFlow = this.createAuthenticationFlow();
    const sourceAuthenticationFlow = this.createSourceAuthenticationFlow();

    // Create sources
    const tailscaleSource = this.createTailscaleSource(enrollmentFlow, sourceAuthenticationFlow);
    const plexSource = this.createPlexSource(enrollmentFlow, sourceAuthenticationFlow, opClient);

    // Create source identification stage
    const sourceIdentificationStage = new authentik.StageIdentification(
      "source-identification",
      {
        sources: [tailscaleSource.uuid, plexSource.uuid],
        showSourceLabels: true,
        enableRememberMe: true,
        showMatchedUser: true,
        passwordlessFlow: authenticationFlow.uuid,
      },
      { parent: this.stagesComponent }
    );

    // Create identification stage
    const identificationStage = new authentik.StageIdentification(
      "authentication-identification",
      {
        caseInsensitiveMatching: true,
        passwordStage: this.authenticationStages.password.stagePasswordId,
        enableRememberMe: true,
        showMatchedUser: true,
        userFields: ["email", "username"],
        pretendUserExists: false,
      },
      { parent: this.stagesComponent }
    );

    // Add stages to authentication flow
    addFlowStageBinding(authenticationFlow, sourceIdentificationStage.stageIdentificationId);
    addFlowStageBinding(authenticationFlow, identificationStage.stageIdentificationId);
    addFlowStageBinding(authenticationFlow, this.authenticationStages.mfa.stageAuthenticatorValidateId);
    addFlowStageBinding(authenticationFlow, this.authenticationStages.login.stageUserLoginId);

    return {
      logoutFlow,
      providerLogoutFlow,
      authenticatorBackupCodesFlow,
      authenticatorTotpFlow,
      authenticatorWebauthnFlow,
      userSettingsFlow,
      implicitConsentFlow,
      explicitConsentFlow,
      authenticationFlow,
      sourceAuthenticationFlow,
      enrollmentFlow,
    };
  }

  private createAuthenticationFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "authentication-flow",
      {
        name: "Driscoll Home",
        title: "Welcome to Driscoll Tech Net!",
        slug: "authentication-flow-ts",
        layout: "sidebar_left",
        designation: "authentication",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "none",
      },
      { parent: this.flowsComponent }
    );
    return flow;
  }

  private createPlexSource(enrollmentFlow: authentik.Flow, authenticationFlow: authentik.Flow, opClient: OPClient): authentik.SourcePlex {
    const plexDetails = pulumi.output(opClient.getItemByTitle("Authentik Plex Source"));

    return new authentik.SourcePlex(
      "plex",
      {
        name: "Plex",
        slug: "plex-ts",
        enabled: true,
        policyEngineMode: "any",
        userPathTemplate: "driscoll.dev/plex/%(slug)s",
        userMatchingMode: "email_link",
        groupMatchingMode: "name_link",
        clientId: plexDetails.apply((z) => z.fields["username"].value!),
        plexToken: plexDetails.apply((z) => z.fields["credential"].value!),
        allowedServers: plexDetails.apply((z) =>
          Object.entries(z.sections?.servers?.fields || {})
            .map((z) => z[1].value!)
        ),
        allowFriends: true,
        authenticationFlow: authenticationFlow.uuid,
        enrollmentFlow: enrollmentFlow.uuid,
      },
      { parent: this.sourcesComponent }
    );
  }

  private createTailscaleSource(enrollmentFlow: authentik.Flow, authenticationFlow: authentik.Flow): authentik.SourceOauth {
    return new authentik.SourceOauth(
      "tailscale",
      {
        name: "Tailscale",
        slug: "tailscale-ts",
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
      { parent: this.sourcesComponent }
    );
  }

  private createSourceAuthenticationFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "source-authentication-flow",
      {
        name: "Welcome back!",
        title: "Welcome back to Driscoll Tech Net!",
        slug: "source-authentication-flow-ts",
        layout: "sidebar_left",
        designation: "authentication",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "continue",
        authentication: "none",
      },
      { parent: this.flowsComponent }
    );

    addPolicyBindingToFlow(flow, this.policies.sourceAuthenticationIfSingleSignOn.policyExpressionId);
    addFlowStageBinding(flow, this.authenticationStages.sourceLogin.stageUserLoginId);

    return flow;
  }

  private createEnrollmentFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "enrollment-flow",
      {
        name: "Driscoll Home",
        title: "Welcome to Driscoll Tech Net! Please enter your user details.",
        slug: "enrollment-flow-ts",
        layout: "sidebar_left",
        designation: "enrollment",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "none",
      },
      { parent: this.flowsComponent }
    );

    addPolicyBindingToFlow(flow, this.policies.sourceEnrollmentIfSingleSignOn.policyExpressionId);
    const enrollmentBinding = addFlowStageBinding(flow, this.stagePrompts.enrollment.stagePromptId);
    addPolicyBindingToFlow(enrollmentBinding as any, this.policies.defaultGroups.policyExpressionId);
    addFlowStageBinding(flow, this.stagePrompts.internalEnrollmentWrite.stageUserWriteId);
    addFlowStageBinding(flow, this.authenticationStages.sourceLogin.stageUserLoginId);

    return flow;
  }

  private createImplicitConsent(): authentik.Flow {
    return new authentik.Flow(
      "implicit-consent-flow",
      {
        name: "Redirect",
        title: "Redirecting to %(app)s!",
        slug: "implicit-consent-flow-ts",
        layout: "content_right",
        designation: "authorization",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "continue",
        authentication: "require_authenticated",
      },
      { parent: this.flowsComponent }
    );
  }

  private createExplicitConsent(): authentik.Flow {
    const flow = new authentik.Flow(
      "explicit-consent-flow",
      {
        name: "Redirect",
        title: "Redirecting to %(app)s!",
        slug: "explicit-consent-flow-ts",
        layout: "content_right",
        designation: "authorization",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "require_authenticated",
      },
      { parent: this.flowsComponent }
    );
    addFlowStageBinding(flow, this.consentStages.permanent.stageConsentId);
    return flow;
  }

  private createLogoutFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "logout-flow",
      {
        name: "Logout",
        title: "Logout",
        slug: "logout-flow-ts",
        layout: "stacked",
        designation: "invalidation",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "none",
      },
      { parent: this.flowsComponent }
    );

    addFlowStageBinding(flow, this.invalidationStages.logout.stageUserLogoutId);
    return flow;
  }

  private createProviderLogoutFlow(): authentik.Flow {
    return new authentik.Flow(
      "provider-logout-flow",
      {
        name: "Logout",
        title: "You've logged out of %(app)s.",
        slug: "provider-logout-flow-ts",
        layout: "stacked",
        designation: "invalidation",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "none",
      },
      { parent: this.flowsComponent }
    );
  }

  private createUserSettingsFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "user-settings-flow",
      {
        name: "User Settings",
        title: "User Settings",
        slug: "user-settings-flow-ts",
        layout: "content_left",
        designation: "stage_configuration",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "require_authenticated",
      },
      { parent: this.flowsComponent }
    );

    const userSettingsBinding = addFlowStageBinding(flow, this.stagePrompts.userSettings.stagePromptId);
    addPolicyBindingToFlow(userSettingsBinding as any, this.policies.userSettingsAuthorization.policyExpressionId);
    addFlowStageBinding(flow, this.stagePrompts.internalEnrollmentWrite.stageUserWriteId);

    return flow;
  }

  private createAuthenticatorBackupCodesFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "authenticator-backup-codes-flow",
      {
        name: "Backup Codes",
        title: "Setup Backup Codes",
        slug: "authenticator-backup-codes-flow-ts",
        layout: "stacked",
        designation: "stage_configuration",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "require_authenticated",
      },
      { parent: this.flowsComponent }
    );

    addFlowStageBinding(flow, this.authenticatorStages.backupCodes.stageAuthenticatorStaticId);
    return flow;
  }

  private createAuthenticatorWebauthnFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "authenticator-webauthn-flow",
      {
        name: "Passkey",
        title: "Setup Passkey",
        slug: "authenticator-webauthn-flow-ts",
        layout: "stacked",
        designation: "stage_configuration",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "require_authenticated",
      },
      { parent: this.flowsComponent }
    );

    addFlowStageBinding(flow, this.authenticatorStages.passkey.stageAuthenticatorWebauthnId);
    return flow;
  }

  private createAuthenticatorTotpFlow(): authentik.Flow {
    const flow = new authentik.Flow(
      "authenticator-totp-flow",
      {
        name: "TOTP",
        title: "Setup TOTP Code",
        slug: "authenticator-totp-flow-ts",
        layout: "stacked",
        designation: "stage_configuration",
        compatibilityMode: true,
        policyEngineMode: "any",
        deniedAction: "message_continue",
        authentication: "require_authenticated",
      },
      { parent: this.flowsComponent }
    );

    addFlowStageBinding(flow, this.authenticatorStages.totp.stageAuthenticatorTotpId);
    return flow;
  }
}

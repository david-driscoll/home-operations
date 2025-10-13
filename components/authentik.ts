import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import * as random from "@pulumi/random";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";
import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { Application } from "sdks/authentik/bin/application.js";
import { OnePasswordItem, TypeEnum } from "../dynamic/1password/OnePasswordItem.ts";
import { Roles } from "./constants.ts";
import { OPClientItem, OPClient } from "./op.ts";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { addPolicyBindingToApplication } from "./authentik/extension-methods.ts";
import { ApplicationCertificate } from "./authentik/application-certificate.ts";
import { ApplicationDefinitionSchema } from "@openapi/application-definition.js";

const op = new OPClient();
type AuthentikDefinition = NonNullable<ApplicationDefinitionSchema["spec"]["authentik"]>;
export interface AuthentikResourcesArgs {
  globals: GlobalResources;
  cluster: ClusterDefinition;
  authentikCredential: pulumi.Input<string>;
}
type RolesKeys = keyof typeof Roles;
type RolesValues = (typeof Roles)[RolesKeys];

export interface AuthentikOutputs {
  groups: { [K in RolesValues]: string };
  roles: { [K in RolesValues]: string };
  scopeMappings: Record<string, string>;
  flows: { [K in keyof ReturnType<import("./authentik/flows.ts").FlowsManager["createFlows"]>]: string };
}

export class AuthentikOutputs {
  constructor(value: OPClientItem) {
    this.groups = Object.fromEntries(Object.entries(value.sections["groups"].fields).map(([key, value]) => [key, value.value] as const)) as any;
    this.roles = Object.fromEntries(Object.entries(value.sections["roles"].fields).map(([key, value]) => [key, value.value] as const)) as any;
    this.scopeMappings = Object.fromEntries(Object.entries(value.sections["scopeMappings"].fields).map(([key, value]) => [key, value.value] as const)) as any;
    this.flows = Object.fromEntries(Object.entries(value.sections["flows"].fields).map(([key, value]) => [key, value.value] as const)) as any;
  }
}

export class AuthentikApplicationManager extends pulumi.ComponentResource {
  private readonly providersComponent: pulumi.ComponentResource;
  private readonly applicationsComponent: pulumi.ComponentResource;
  private readonly outpostsComponent: pulumi.ComponentResource;
  private readonly proxyProviders: pulumi.Output<number>[] = [];
  public readonly cluster: ClusterDefinition;
  private readonly authentik: pulumi.Output<AuthentikOutputs>;

  constructor(
    private readonly args: AuthentikResourcesArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("custom:resource:AuthentikResourceManager", "authentik-resource-manager", {}, opts);

    this.authentik = pulumi
      .output(args.authentikCredential)
      .apply((title) => op.getItemByTitle(title))
      .apply((item) => new AuthentikOutputs(item));
    this.cluster = args.cluster;
    this.providersComponent = new pulumi.ComponentResource("custom:resource:providers", "providers", {}, { parent: this });
    this.applicationsComponent = new pulumi.ComponentResource("custom:resource:applications", "applications", {}, { parent: this });
    this.outpostsComponent = new pulumi.ComponentResource("custom:resource:outposts", "outposts", {}, { parent: this });
  }

  public createApplication(application: ApplicationDefinitionSchema) {
    let provider: pulumi.CustomResource | undefined;

    if (application.spec.authentik) {
      const result = this.createProvider(application, application.spec.authentik);
      provider = result.provider;
      if (result.isProxy) {
        this.proxyProviders.push(provider.id.apply((id) => parseFloat(id)));
      }
    }

    const app = this.createAuthentikApplication(application, provider);

    return { app, provider };
  }

  public async createOutpost(serviceConnectionId: pulumi.Output<string>) {
    // Create outpost
    if (this.proxyProviders.length > 0) {
      return new authentik.Outpost(
        this.cluster.key,
        {
          serviceConnection: serviceConnectionId,
          type: "proxy",
          name: `Outpost for ${this.cluster.title}`,
          config: JSON.stringify({
            authentik_host: "https://authentik.driscoll.tech/",
            authentik_host_insecure: false,
            authentik_host_browser: this.cluster.authentikDomain,
            log_level: "info",
            object_naming_template: `ak-outpost-${this.cluster.key}`,
            kubernetes_replicas: 2,
            kubernetes_namespace: this.cluster.key,
            kubernetes_ingress_class_name: "internal",
          }),
          protocolProviders: this.proxyProviders,
        },
        { parent: this.outpostsComponent, deleteBeforeReplace: true },
      );
    }
  }

  private resolveResourceName(definition: ApplicationDefinitionSchema) {
    return (definition.spec.slug ?? (definition.metadata.namespace ?? this.cluster.key) === this.cluster.key)
      ? `${this.cluster.key}-${definition.metadata.name}`
      : `${this.cluster.key}-${definition.metadata.namespace}-${definition.metadata.name}`;
  }

  private createProvider(definition: ApplicationDefinitionSchema, authentikDefinition: AuthentikDefinition) {
    const resourceName = this.resolveResourceName(definition);
    const providerName = `Provider for ${definition.spec.name} (${this.cluster.title})`;
    const opts = { parent: this.providersComponent, deleteBeforeReplace: true };

    // Proxy Provider
    if (authentikDefinition.proxy) {
      return {
        provider: new authentik.ProviderProxy(
          resourceName,
          {
            name: providerName,
            authorizationFlow: authentikDefinition.proxy.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
            authenticationFlow: authentikDefinition.proxy.authenticationFlow ?? this.authentik.flows.authenticationFlow,
            invalidationFlow: authentikDefinition.proxy.invalidationFlow ?? this.authentik.flows.providerLogoutFlow,
            ...authentikDefinition.proxy,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.proxy.propertyMappings),
          },
          opts,
        ),
        isProxy: true,
      };
    }

    // OAuth2 Provider
    if (authentikDefinition.oauth2) {
      const oauth2 = authentikDefinition.oauth2;
      const clientId = new random.RandomString(
        `${resourceName}-client-id`,
        {
          length: 16,
          upper: false,
          special: false,
        },
        opts,
      );
      const clientSecret = new random.RandomPassword(
        `${resourceName}-client-secret`,
        {
          length: 32,
          upper: false,
          special: false,
        },
        opts,
      );
      const signingKey = new ApplicationCertificate(resourceName, { globals: this.args.globals }, { parent: this });

      const provider = new authentik.ProviderOauth2(
        resourceName,
        {
          name: providerName,
          authorizationFlow: oauth2.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
          authenticationFlow: oauth2.authenticationFlow || this.authentik.flows.authenticationFlow,
          invalidationFlow: oauth2.invalidationFlow || this.authentik.flows.providerLogoutFlow,
          clientId: clientId.result,
          clientSecret: clientSecret.result,
          signingKey: signingKey.signingKey.id,
          clientType: oauth2.clienttype,
          allowedRedirectUris: oauth2.allowedRedirectUris?.map((uri) => ({
            matching_mode: uri.matching_mode ?? "strict",
            url: uri.url,
          })),
          ...oauth2,
          propertyMappings: this.resolvePropertyMappings(oauth2.propertyMappings),
        },
        opts,
      );

      const oidcCredentials = new OnePasswordItem(`${definition.metadata.name}-oidc-credentials`, {
        category: FullItem.CategoryEnum.APICredential,
        title: pulumi.interpolate`${definition.metadata.name}-oidc-credentials`,
        fields: pulumi.output({
          client_id: { label: "Client ID", value: clientId.result, type: TypeEnum.String },
          client_secret: { label: "Client Secret", value: clientSecret.result, type: TypeEnum.Concealed },
          authorization_url: { label: "Authorization URL", value: `${this.cluster.authentikDomain}/application/o/authorize/`, type: TypeEnum.String },
          token_url: { label: "Token URL", value: `${this.cluster.authentikDomain}/application/o/token/`, type: TypeEnum.String },
          userinfo_url: { label: "Userinfo URL", value: `${this.cluster.authentikDomain}/application/o/userinfo/`, type: TypeEnum.String },
          revoke_url: { label: "Revoke URL", value: `${this.cluster.authentikDomain}/application/o/revoke/`, type: TypeEnum.String },
          issuer: { label: "Issuer", value: `${this.cluster.authentikDomain}/application/o/${resourceName}/`, type: TypeEnum.String },
          end_session_url: { label: "End Session URL", value: `${this.cluster.authentikDomain}/application/o/${resourceName}/end-session/`, type: TypeEnum.String },
          jwks_url: { label: "JWKS URL", value: `${this.cluster.authentikDomain}/application/o/${resourceName}/jwks/`, type: TypeEnum.String },
          openid_configuration_url: {
            label: "OpenID Configuration URL",
            value: `${this.cluster.authentikDomain}/application/o/${resourceName}/.well-known/openid-configuration`,
            type: TypeEnum.String,
          },
        }),
      });

      return { provider, oidcCredentials, isProxy: false };
    }

    // LDAP Provider
    if (authentikDefinition.ldap) {
      return {
        provider: new authentik.ProviderLdap(
          resourceName,
          {
            name: providerName,
            bindFlow: this.authentik.flows.authenticationFlow,
            unbindFlow: this.authentik.flows.providerLogoutFlow,
            ...authentikDefinition.ldap,
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // SAML Provider
    if (authentikDefinition.saml) {
      return {
        provider: new authentik.ProviderSaml(
          resourceName,
          {
            name: providerName,
            authorizationFlow: authentikDefinition.saml.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
            authenticationFlow: authentikDefinition.saml.authenticationFlow ?? this.authentik.flows.authenticationFlow,
            invalidationFlow: authentikDefinition.saml.invalidationFlow ?? this.authentik.flows.providerLogoutFlow,
            ...authentikDefinition.saml,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.saml.propertyMappings),
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // RAC Provider
    if (authentikDefinition.rac) {
      return {
        provider: new authentik.ProviderRac(
          resourceName,
          {
            name: providerName,
            authorizationFlow: this.authentik.flows.implicitConsentFlow,
            authenticationFlow: this.authentik.flows.authenticationFlow,
            ...authentikDefinition.rac,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.rac.propertyMappings),
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // Radius Provider
    if (authentikDefinition.radius) {
      return {
        provider: new authentik.ProviderRadius(
          resourceName,
          {
            name: providerName,
            authorizationFlow: this.authentik.flows.implicitConsentFlow,
            invalidationFlow: this.authentik.flows.providerLogoutFlow,
            ...authentikDefinition.radius,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.radius.propertyMappings),
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // SSF Provider
    if (authentikDefinition.ssf) {
      return {
        provider: new authentik.ProviderSsf(
          resourceName,
          {
            name: providerName,
            ...authentikDefinition.ssf,
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // SCIM Provider
    if (authentikDefinition.scim) {
      return {
        provider: new authentik.ProviderScim(
          resourceName,
          {
            name: providerName,
            ...authentikDefinition.scim,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.scim.propertyMappings),
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // Microsoft Entra Provider
    if (authentikDefinition.microsoftEntra) {
      return {
        provider: new authentik.ProviderMicrosoftEntra(
          resourceName,
          {
            name: providerName,
            ...authentikDefinition.microsoftEntra,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.microsoftEntra.propertyMappings),
          },
          opts,
        ),
        isProxy: false,
      };
    }

    // Google Workspace Provider
    if (authentikDefinition.googleWorkspace) {
      return {
        provider: new authentik.ProviderGoogleWorkspace(
          resourceName,
          {
            name: providerName,
            ...authentikDefinition.googleWorkspace,

            propertyMappings: this.resolvePropertyMappings(authentikDefinition.googleWorkspace.propertyMappings),
          },
          opts,
        ),
        isProxy: false,
      };
    }

    throw new Error("Unknown authentik provider type");
  }

  private resolvePropertyMappings(mappings?: pulumi.Input<string>[]): pulumi.Output<string[]> | undefined {
    if (!mappings) return undefined;

    return pulumi
      .output(mappings)
      .apply((maps) => pulumi.all([this.authentik.scopeMappings, maps]))
      .apply(([mappings, scopeNames]) => scopeNames.map((scopeName) => mappings[scopeName]));
  }

  private createAuthentikApplication(definition: ApplicationDefinitionSchema, provider?: pulumi.CustomResource): authentik.Application {
    const resourceName = this.resolveResourceName(definition);
    const args: authentik.ApplicationArgs = {
      name: definition.spec.name,
      slug: resourceName,
      group: definition.spec.category,
      metaIcon: definition.spec.icon,
      metaPublisher: this.cluster.title,
      metaDescription: definition.spec.description || "",
      metaLaunchUrl: definition.spec.url,
      openInNewTab: true,
    };

    if (provider) {
      args.protocolProvider = provider.id.apply((id) => parseFloat(id));
    }

    const app = new authentik.Application(resourceName, args, {
      parent: this.applicationsComponent,
      deleteBeforeReplace: true,
    });

    // Add group bindings for access control
    if (definition.spec.access_policy?.groups) {
      for (const groupName of definition.spec.access_policy.groups) {
        const group = this.authentik.groups[groupName];
        addPolicyBindingToApplication(app, { group: group });
      }
    }

    return app;
  }
}

import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import * as random from "@pulumi/random";
import * as k8s from "@pulumi/kubernetes";
import * as tls from "@pulumi/tls";
import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";
import { Application } from "sdks/authentik/bin/application.js";
import { OnePasswordItem } from "../dynamic/1password/OnePasswordItem.ts";
import { Roles } from "./constants.ts";
import { OPClientItem, OPClient } from "./op.ts";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { addPolicyBindingToApplication } from "./authentik/extension-methods.ts";
import { ApplicationCertificate } from "./authentik/application-certificate.ts";

const op = new OPClient();
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

  constructor(private readonly args: AuthentikResourcesArgs, opts?: pulumi.ComponentResourceOptions) {
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

  public createApplication(application: ApplicationDefinition) {
    let provider: pulumi.CustomResource | undefined;

    if (application.authentik) {
      const result = this.createAuthentikProvider(application.name, application, application.authentik);
      provider = result.provider;
    }

    const app = this.createAuthentikApplication(application.name, application, provider);

    return { app, provider };
  }

  public async createOutpost(serviceConnectionId: pulumi.Output<string>) {
    // Create outpost
    if (this.proxyProviders.length > 0) {
      return new authentik.Outpost(
        this.cluster.name,
        {
          serviceConnection: serviceConnectionId,
          type: "proxy",
          name: `Outpost for ${this.cluster.title}`,
          config: JSON.stringify({
            authentik_host: "https://authentik.driscoll.tech/",
            authentik_host_insecure: false,
            authentik_host_browser: this.cluster.authentikDomain,
            log_level: "info",
            object_naming_template: `ak-outpost-${this.cluster.name}`,
            kubernetes_replicas: 2,
            kubernetes_namespace: this.cluster.name,
            kubernetes_ingress_class_name: "internal",
          }),
          protocolProviders: this.proxyProviders,
        },
        { parent: this.outpostsComponent }
      );
    }
  }

  private createAuthentikProvider(resourceName: string, definition: ApplicationDefinition, authentikDefinition: ApplicationDefinitionAuthentik) {
    const slug = definition.slug || resourceName;
    const providerName = `Provider for ${definition.name} (${this.cluster.name})`;
    const opts = { parent: this.providersComponent };

    // Proxy Provider
    if (authentikDefinition.providerProxy) {
      const provider = new authentik.ProviderProxy(
        resourceName,
        {
          name: providerName,
          ...this.mapFlowsToProvider(authentikDefinition.providerProxy),
          mode: authentikDefinition.providerProxy.mode,
          externalHost: authentikDefinition.providerProxy.externalHost!,
          internalHost: authentikDefinition.providerProxy.internalHost!,
          skipPathRegex: authentikDefinition.providerProxy.skipPathRegex!,
        },
        opts
      );
      this.proxyProviders.push(provider.providerProxyId.apply((id) => parseFloat(id)));
      return { provider };
    }

    // OAuth2 Provider
    if (authentikDefinition.providerOauth2) {
      const oauth2 = authentikDefinition.providerOauth2;
      const clientId = new random.RandomString(
        `${resourceName}-client-id`,
        {
          length: 16,
          upper: false,
          special: false,
        },
        opts
      );
      const clientSecret = new random.RandomPassword(
        `${resourceName}-client-secret`,
        {
          length: 32,
          upper: false,
          special: false,
        },
        opts
      );
      const signingKey = new ApplicationCertificate(resourceName, { globals: this.args.globals }, opts);

      const provider = new authentik.ProviderOauth2(
        resourceName,
        {
          name: providerName,
          ...this.mapFlowsToProvider(oauth2),
          clientId: clientId.result,
          clientSecret: clientSecret.result,
          signingKey: signingKey.signingKey.id,
          clientType: oauth2.clientType,
          allowedRedirectUris: oauth2.redirectUris?.map((uri) => ({
            matching_mode: uri.matchingMode ?? "strict",
            url: uri.url,
          })),
          subMode: oauth2.subMode,
          issuerMode: oauth2.issuerMode,
          jwksSources: oauth2.jwksSources,
          propertyMappings: this.resolvePropertyMappings(oauth2.propertyMappings),
        },
        opts
      );

      const oidcCredentials = new OnePasswordItem(`${definition.name}-oidc-credentials`, {
        category: FullItem.CategoryEnum.APICredential,
        title: `${definition.name}-oidc-credentials`,
        fields: pulumi.output({
          client_id: { value: clientId.result, type: FullItemAllOfFields.TypeEnum.String },
          client_secret: { value: clientSecret.result, type: FullItemAllOfFields.TypeEnum.Concealed },
          authorization_url: { value: `${this.cluster.authentikDomain}/application/o/authorize/`, type: FullItemAllOfFields.TypeEnum.String },
          token_url: { value: `${this.cluster.authentikDomain}/application/o/token/`, type: FullItemAllOfFields.TypeEnum.String },
          userinfo_url: { value: `${this.cluster.authentikDomain}/application/o/userinfo/`, type: FullItemAllOfFields.TypeEnum.String },
          revoke_url: { value: `${this.cluster.authentikDomain}/application/o/revoke/`, type: FullItemAllOfFields.TypeEnum.String },
          issuer: { value: `${this.cluster.authentikDomain}/application/o/${slug}/`, type: FullItemAllOfFields.TypeEnum.String },
          end_session_url: { value: `${this.cluster.authentikDomain}/application/o/${slug}/end-session/`, type: FullItemAllOfFields.TypeEnum.String },
          jwks_url: { value: `${this.cluster.authentikDomain}/application/o/${slug}/jwks/`, type: FullItemAllOfFields.TypeEnum.String },
          openid_configuration_url: {
            label: "openid_configuration_url",
            value: `${this.cluster.authentikDomain}/application/o/${slug}/.well-known/openid-configuration`,
            type: FullItemAllOfFields.TypeEnum.String,
          },
        }),
      });

      return { provider, oidcCredentials };
    }

    // // LDAP Provider
    // if (authentikDefinition.providerLdap) {
    //   return {
    //     provider: new authentik.ProviderLdap(
    //       resourceName,
    //       {
    //         name: providerName,
    //         ...this.mapFlowsToProvider(authentikDefinition.providerLdap),
    //         baseDn: authentikDefinition.providerLdap.baseDn,
    //         // searchGroup: authentikDefinition.providerLdap.searchGroup,
    //         tlsServerName: authentikDefinition.providerLdap.tlsServerName,
    //         uidStartNumber: authentikDefinition.providerLdap.uidStartNumber,
    //         gidStartNumber: authentikDefinition.providerLdap.gidStartNumber,
    //         searchMode: authentikDefinition.providerLdap.searchMode,
    //         bindMode: authentikDefinition.providerLdap.bindMode,
    //         mfaSupport: authentikDefinition.providerLdap.mfaSupport,
    //         // bindFlow: this.authentik.flows.apply(z => z.authenticationFlow!),
    //         // unbindFlow: this.authentik.flows.apply(z => z.invalidationFlow!),
    //       },
    //       opts
    //     )
    //   };
    // }

    // SAML Provider
    if (authentikDefinition.providerSaml) {
      return {
        provider: new authentik.ProviderSaml(
          resourceName,
          {
            name: providerName,
            ...this.mapFlowsToProvider(authentikDefinition.providerSaml),
            acsUrl: authentikDefinition.providerSaml.acsUrl,
            issuer: authentikDefinition.providerSaml.issuer,
            audience: authentikDefinition.providerSaml.audience,
            assertionValidNotBefore: authentikDefinition.providerSaml.assertionValidNotBefore,
            assertionValidNotOnOrAfter: authentikDefinition.providerSaml.assertionValidNotOnOrAfter,
            sessionValidNotOnOrAfter: authentikDefinition.providerSaml.sessionValidNotOnOrAfter,
            nameIdMapping: authentikDefinition.providerSaml.nameIdMapping,
            digestAlgorithm: authentikDefinition.providerSaml.digestAlgorithm,
            signatureAlgorithm: authentikDefinition.providerSaml.signatureAlgorithm,
            signingKp: authentikDefinition.providerSaml.signingKp,
            verificationKp: authentikDefinition.providerSaml.verificationKp,
            propertyMappings: authentikDefinition.providerSaml.propertyMappings,
            spBinding: authentikDefinition.providerSaml.spBinding,
            defaultRelayState: authentikDefinition.providerSaml.defaultRelayState,
          },
          opts
        ),
      };
    }

    // RAC Provider
    if (authentikDefinition.providerRac) {
      return {
        provider: new authentik.ProviderRac(
          resourceName,
          {
            name: providerName,
            ...this.mapFlowsToProvider(authentikDefinition.providerRac),
            settings: JSON.stringify(authentikDefinition.providerRac.settings || {}),
            connectionExpiry: authentikDefinition.providerRac.connectionExpiry,
          },
          opts
        ),
      };
    }

    // Radius Provider
    if (authentikDefinition.providerRadius) {
      return {
        provider: new authentik.ProviderRadius(
          resourceName,
          {
            name: providerName,
            ...this.mapFlowsToProvider(authentikDefinition.providerRadius),
            clientNetworks: authentikDefinition.providerRadius.clientNetworks,
            sharedSecret: authentikDefinition.providerRadius.sharedSecret!,
          },
          opts
        ),
      };
    }

    // SSF Provider
    if (authentikDefinition.providerSsf) {
      return {
        provider: new authentik.ProviderSsf(
          resourceName,
          {
            name: providerName,
            ...this.mapFlowsToProvider(authentikDefinition.providerSsf),
          },
          opts
        ),
      };
    }

    // SCIM Provider
    if (authentikDefinition.providerScim) {
      return {
        provider: new authentik.ProviderScim(
          resourceName,
          {
            name: providerName,
            ...this.mapFlowsToProvider(authentikDefinition.providerScim),
            url: authentikDefinition.providerScim.url,
            token: authentikDefinition.providerScim.token,
            excludeUsersServiceAccount: authentikDefinition.providerScim.excludeUsersServiceAccount,
            filterGroup: authentikDefinition.providerScim.filterGroup,
            propertyMappings: authentikDefinition.providerScim.propertyMappings,
            propertyMappingsGroups: authentikDefinition.providerScim.propertyMappingsGroups,
          },
          opts
        ),
      };
    }

    // Microsoft Entra Provider
    if (authentikDefinition.providerMicrosoftEntra) {
      return {
        provider: new authentik.ProviderMicrosoftEntra(
          resourceName,
          {
            name: providerName,
            clientId: authentikDefinition.providerMicrosoftEntra.clientId,
            clientSecret: authentikDefinition.providerMicrosoftEntra.clientSecret,
            tenantId: authentikDefinition.providerMicrosoftEntra.tenantId,
            excludeUsersServiceAccount: authentikDefinition.providerMicrosoftEntra.excludeUsersServiceAccount,
            filterGroup: authentikDefinition.providerMicrosoftEntra.filterGroup,
          },
          opts
        ),
      };
    }

    // Google Workspace Provider
    if (authentikDefinition.providerGoogleWorkspace) {
      return {
        provider: new authentik.ProviderGoogleWorkspace(
          resourceName,
          {
            name: providerName,
            delegatedSubject: authentikDefinition.providerGoogleWorkspace.delegatedSubject,
            credentials: authentikDefinition.providerGoogleWorkspace.credentials,
            excludeUsersServiceAccount: authentikDefinition.providerGoogleWorkspace.excludeUsersServiceAccount,
            filterGroup: authentikDefinition.providerGoogleWorkspace.filterGroup,
            defaultGroupEmailDomain: authentikDefinition.providerGoogleWorkspace.defaultGroupEmailDomain,
          },
          opts
        ),
      };
    }

    throw new Error("Unknown authentik provider type");
  }

  private mapFlowsToProvider(providerConfig: AuthentikProviderBase) {
    return {
      authorizationFlow: providerConfig.authorizationFlow || this.authentik.flows.implicitConsentFlow,
      authenticationFlow: providerConfig.authenticationFlow || this.authentik.flows.authenticationFlow,
      invalidationFlow: providerConfig.invalidationFlow || this.authentik.flows.providerLogoutFlow,
    };
  }

  private resolvePropertyMappings(mappings?: pulumi.Input<string>[]) {
    if (!mappings) return pulumi.output([]);

    return pulumi.output(mappings).apply((maps) => maps.map((scopeName) => pulumi.output(this.authentik.scopeMappings[scopeName])));
  }

  private createAuthentikApplication(resourceName: string, definition: ApplicationDefinition, provider?: pulumi.CustomResource): authentik.Application {
    const slug = definition.slug || resourceName;
    const args: authentik.ApplicationArgs = {
      name: definition.title,
      slug,
      group: definition.category,
      metaIcon: definition.icon,
      metaPublisher: this.cluster.title,
      metaDescription: definition.description || "",
      metaLaunchUrl: definition.url,
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
    if (definition.accessPolicy?.groups) {
      for (const groupName of definition.accessPolicy.groups) {
        const group = this.authentik.groups[groupName];
        addPolicyBindingToApplication(app, { group });
      }
    }

    return app;
  }

  private parseClusterInfo(app: ApplicationDefinition): ClusterDefinition {
    throw new Error("Cluster info parsing not yet implemented");
    // return {
    //   clusterName: app.metadata.labels?.["driscoll.dev/cluster"] || "sgc",
    //   clusterTitle: app.metadata.annotations?.["driscoll.dev/clusterTitle"] || "Stargate Command",
    //   namespace: app.metadata.namespace,
    //   originalName: app.metadata.annotations?.["driscoll.dev/originalName"] || app.metadata.name,
    // };
  }
}

export interface ApplicationDefinition {
  name: string;
  title: string;
  slug?: string;
  icon?: string;
  url?: string;
  description?: string;
  category: string;
  accessPolicy?: {
    entitlements?: string[];
    groups?: RolesValues[];
  };
  authentik?: ApplicationDefinitionAuthentik;
}

export interface ApplicationDefinitionAuthentik {
  providerProxy?: AuthentikProviderProxy;
  providerOauth2?: AuthentikProviderOauth2;
  providerLdap?: AuthentikProviderLdap;
  providerSaml?: AuthentikProviderSaml;
  providerRac?: AuthentikProviderRac;
  providerRadius?: AuthentikProviderRadius;
  providerSsf?: AuthentikProviderSsf;
  providerScim?: AuthentikProviderScim;
  providerMicrosoftEntra?: AuthentikProviderMicrosoftEntra;
  providerGoogleWorkspace?: AuthentikProviderGoogleWorkspace;
}

// Provider type interfaces (simplified - extend as needed)
export interface AuthentikProviderBase {
  authorizationFlow?: pulumi.Input<string>;
  authenticationFlow?: pulumi.Input<string>;
  invalidationFlow?: pulumi.Input<string>;
}

export interface AuthentikProviderProxy extends AuthentikProviderBase {
  mode?: string;
  externalHost?: string;
  internalHost?: string;
  skipPathRegex?: string;
}

export interface AuthentikProviderOauth2 extends AuthentikProviderBase {
  clientType?: string;
  redirectUris?: Array<{ url: string; matchingMode?: string }>;
  signingKey?: pulumi.Input<string>;
  propertyMappings?: pulumi.Input<string>[];
  subMode?: string;
  issuerMode?: string;
  jwksSources?: pulumi.Input<string>[];
}

export interface AuthentikProviderLdap extends AuthentikProviderBase {
  baseDn: string;
  // searchGroup?: pulumi.Input<string>;
  tlsServerName?: string;
  uidStartNumber?: number;
  gidStartNumber?: number;
  searchMode?: string;
  bindMode?: string;
  mfaSupport?: boolean;
}

export interface AuthentikProviderSaml extends AuthentikProviderBase {
  acsUrl: string;
  issuer?: string;
  audience?: string;
  assertionValidNotBefore?: string;
  assertionValidNotOnOrAfter?: string;
  sessionValidNotOnOrAfter?: string;
  nameIdMapping?: pulumi.Input<string>;
  digestAlgorithm?: string;
  signatureAlgorithm?: string;
  signingKp?: pulumi.Input<string>;
  verificationKp?: pulumi.Input<string>;
  propertyMappings?: pulumi.Input<string>[];
  spBinding?: string;
  defaultRelayState?: string;
}

export interface AuthentikProviderRac extends AuthentikProviderBase {
  settings?: Record<string, any>;
  connectionExpiry?: string;
  deleteTokenOnDisconnect?: boolean;
}

export interface AuthentikProviderRadius extends AuthentikProviderBase {
  clientNetworks?: string;
  sharedSecret?: pulumi.Input<string>;
}

export interface AuthentikProviderSsf extends AuthentikProviderBase {
  // SSF-specific properties
}

export interface AuthentikProviderScim extends AuthentikProviderBase {
  url: string;
  token: pulumi.Input<string>;
  excludeUsersServiceAccount?: boolean;
  filterGroup?: pulumi.Input<string>;
  propertyMappings?: pulumi.Input<string>[];
  propertyMappingsGroups?: pulumi.Input<string>[];
}

export interface AuthentikProviderMicrosoftEntra extends AuthentikProviderBase {
  clientId: string;
  clientSecret: pulumi.Input<string>;
  tenantId: string;
  excludeUsersServiceAccount?: boolean;
  filterGroup?: pulumi.Input<string>;
}

export interface AuthentikProviderGoogleWorkspace extends AuthentikProviderBase {
  delegatedSubject?: string;
  credentials?: any;
  excludeUsersServiceAccount?: boolean;
  filterGroup?: pulumi.Input<string>;
  defaultGroupEmailDomain: string;
}

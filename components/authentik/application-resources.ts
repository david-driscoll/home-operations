import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import * as random from "@pulumi/random";
import * as k8s from "@pulumi/kubernetes";
import { ApplicationCertificate } from "./application-certificate.js";
import { PropertyMappings } from "./property-mappings.ts";
import { AuthentikGroups } from "./groups.ts";
import { addPolicyBindingToApplication } from "./extension-methods.ts";
import { OPClient } from "../op.ts";
import { OnePasswordItem } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/fullItemAllOfFields.js";

export interface ClusterFlows {
  signingKey?: pulumi.Input<string>;
  encryptionKey?: pulumi.Input<string>;
  authorizationFlow: pulumi.Input<string>;
  authenticationFlow: pulumi.Input<string>;
  invalidationFlow: pulumi.Input<string>;
}

export interface ApplicationDefinitionSpec {
  name: string;
  slug?: string;
  icon?: string;
  url?: string;
  description?: string;
  category: string;
  accessPolicy?: {
    entitlements?: string[];
    groups?: string[];
  };
  authentik?: ApplicationDefinitionAuthentik;
}

export interface ApplicationDefinition {
  metadata: {
    name: string;
    namespace: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec: ApplicationDefinitionSpec;
}

export interface ClusterDefinition {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    name: string;
    secret: string;
    domain: string;
    icon: string;
    background: string;
    favicon: string;
  };
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

export interface ApplicationResourcesArgs {
  groups: AuthentikGroups;
  propertyMappings: PropertyMappings;
  clusterFlows: ClusterFlows;
  k8sProvider?: k8s.Provider;
  opClient: OPClient;
}

interface ClusterApplicationGroup {
  clusterName: string;
  clusterTitle: string;
  applications: ApplicationDefinition[];
}

export class ApplicationResourcesManager extends pulumi.ComponentResource {
  private readonly stagesComponent: pulumi.ComponentResource;
  private readonly providersComponent: pulumi.ComponentResource;
  private readonly applicationsComponent: pulumi.ComponentResource;
  private readonly outpostsComponent: pulumi.ComponentResource;

  constructor(private readonly args: ApplicationResourcesArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:ApplicationResourcesManager", "application-resources-manager", {}, opts);

    this.stagesComponent = new pulumi.ComponentResource("custom:resource:stages", "stages", {}, { parent: this });
    this.providersComponent = new pulumi.ComponentResource("custom:resource:providers", "providers", {}, { parent: this });
    this.applicationsComponent = new pulumi.ComponentResource("custom:resource:applications", "applications", {}, { parent: this });
    this.outpostsComponent = new pulumi.ComponentResource("custom:resource:outposts", "outposts", {}, { parent: this });
  }

  public async createApplications(clusterDefinition: ClusterDefinition, applications: ApplicationDefinition[]): Promise<void> {
    await this.createClusterApplications(clusterDefinition, applications);
  }

  private async createClusterApplications(clusterDefinition: ClusterDefinition, applications: ApplicationDefinition[]): Promise<void> {
    // Create applications and collect providers
    const appResources = applications.map((app) => this.createResource(app));
    const proxyProviders = appResources.filter((r) => r.provider && r.isProxy).map((r) => r.provider!.id.apply((id) => parseFloat(id)));

    // Create service connection
    const serviceConnection = await this.createServiceConnection(clusterDefinition);

    // Create outpost
    if (proxyProviders.length > 0) {
      new authentik.Outpost(
        clusterDefinition.metadata.name,
        {
          serviceConnection: serviceConnection.id,
          type: "proxy",
          name: `Outpost for ${clusterDefinition.spec.name}`,
          config: JSON.stringify({
            authentik_host: "https://authentik.driscoll.tech/",
            authentik_host_insecure: false,
            authentik_host_browser: clusterDefinition.spec.domain,
            log_level: "info",
            object_naming_template: `ak-outpost-${clusterDefinition.metadata.name}`,
            kubernetes_replicas: 2,
            kubernetes_namespace: clusterDefinition.metadata.name,
            kubernetes_ingress_class_name: "internal",
          }),
          protocolProviders: proxyProviders,
        },
        { parent: this.outpostsComponent }
      );
    }
  }

  private async createServiceConnection(clusterDefinition: ClusterDefinition): Promise<authentik.ServiceConnectionKubernetes> {
    if (clusterDefinition.metadata.name === "sgc") {
      // Local cluster - use in-cluster config
      return new authentik.ServiceConnectionKubernetes(
        clusterDefinition.metadata.name,
        {
          name: clusterDefinition.spec.name,
          local: true,
          verifySsl: true,
        },
        { parent: this.outpostsComponent }
      );
    } else {
      // Remote cluster - read kubeconfig from secret
      const kubeConfigSecret = pulumi.output(this.getKubeConfigSecret(clusterDefinition.metadata.name));

      return new authentik.ServiceConnectionKubernetes(
        clusterDefinition.metadata.name,
        {
          name: clusterDefinition.spec.name,
          kubeconfig: kubeConfigSecret.apply((secret) => Buffer.from(secret.data["kubeconfig.json"], "base64").toString("utf-8")),
          verifySsl: true,
        },
        { parent: this.outpostsComponent }
      );
    }
  }

  private async getKubeConfigSecret(clusterName: string): Promise<{ data: Record<string, string> }> {
    // This would be implemented using the k8s provider
    // For now, return a placeholder
    throw new Error(`Reading kubeconfig for cluster ${clusterName} not yet implemented`);
  }

  private createResource(application: ApplicationDefinition): { app: authentik.Application; provider?: pulumi.CustomResource; isProxy: boolean } {
    const clusterDefinition = this.parseClusterInfo(application);
    const resourceName = this.getResourceName(clusterDefinition.metadata.name, clusterDefinition.metadata.namespace, application.metadata.name);

    let provider: pulumi.CustomResource | undefined;
    let isProxy = false;

    if (application.spec.authentik) {
      const result = this.createAuthentikProvider(resourceName, clusterDefinition, application, application.spec.authentik);
      provider = result.provider;
      isProxy = result.isProxy;
    }

    const app = this.createApplication(resourceName, application, provider);

    return { app, provider, isProxy };
  }

  private createAuthentikProvider(resourceName: string, clusterDefinition: ClusterDefinition, definition: ApplicationDefinition, authentikDefinition: ApplicationDefinitionAuthentik) {
    const slug = definition.spec.slug || resourceName;
    const providerName = `Provider for ${definition.spec.name} (${clusterDefinition.spec.name})`;
    const opts = { parent: this.providersComponent };

    // Proxy Provider
    if (authentikDefinition.providerProxy) {
      return {
        provider: new authentik.ProviderProxy(
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
        ),
        isProxy: true,
      };
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
      const signingKey = new ApplicationCertificate(resourceName, { parent: opts.parent });

      const provider = new authentik.ProviderOauth2(
        resourceName,
        {
          name: providerName,
          ...this.mapFlowsToProvider(oauth2),
          clientId: clientId.result,
          clientSecret: clientSecret.result,
          signingKey: signingKey.signingKeyPair.id,
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

      const oidcCredentials = new OnePasswordItem(`${definition.metadata.name}-oidc-credentials`, {
        category: FullItem.CategoryEnum.APICredential,
        title: `${definition.metadata.name}-oidc-credentials`,
        fields: pulumi.output({
          client_id: { label: "client_id", value: clientId.result, type: FullItemAllOfFields.TypeEnum.String },
          client_secret: { label: "client_secret", value: clientSecret.result, type: FullItemAllOfFields.TypeEnum.Concealed },
          authorization_url: { label: "authorization_url", value: `${clusterDefinition.spec.domain}/application/o/authorize/`, type: FullItemAllOfFields.TypeEnum.String },
          token_url: { label: "token_url", value: `${clusterDefinition.spec.domain}/application/o/token/`, type: FullItemAllOfFields.TypeEnum.String },
          userinfo_url: { label: "userinfo_url", value: `${clusterDefinition.spec.domain}/application/o/userinfo/`, type: FullItemAllOfFields.TypeEnum.String },
          revoke_url: { label: "revoke_url", value: `${clusterDefinition.spec.domain}/application/o/revoke/`, type: FullItemAllOfFields.TypeEnum.String },
          issuer: { label: "issuer", value: `${clusterDefinition.spec.domain}/application/o/${slug}/`, type: FullItemAllOfFields.TypeEnum.String },
          end_session_url: { label: "end_session_url", value: `${clusterDefinition.spec.domain}/application/o/${slug}/end-session/`, type: FullItemAllOfFields.TypeEnum.String },
          jwks_url: { label: "jwks_url", value: `${clusterDefinition.spec.domain}/application/o/${slug}/jwks/`, type: FullItemAllOfFields.TypeEnum.String },
          openid_configuration_url: {
            label: "openid_configuration_url",
            value: `${clusterDefinition.spec.domain}/application/o/${slug}/.well-known/openid-configuration`,
            type: FullItemAllOfFields.TypeEnum.String,
          },
        }),
      });

      return { provider, oidcCredentials, isProxy: false };
    }

    // LDAP Provider
    if (authentikDefinition.providerLdap) {
      return {
        provider: new authentik.ProviderLdap(
          resourceName,
          {
            name: providerName,
            ...this.mapFlowsToProvider(authentikDefinition.providerLdap),
            baseDn: authentikDefinition.providerLdap.baseDn,
            // searchGroup: authentikDefinition.providerLdap.searchGroup,
            tlsServerName: authentikDefinition.providerLdap.tlsServerName,
            uidStartNumber: authentikDefinition.providerLdap.uidStartNumber,
            gidStartNumber: authentikDefinition.providerLdap.gidStartNumber,
            searchMode: authentikDefinition.providerLdap.searchMode,
            bindMode: authentikDefinition.providerLdap.bindMode,
            mfaSupport: authentikDefinition.providerLdap.mfaSupport,
            bindFlow: this.args.clusterFlows.authenticationFlow,
            unbindFlow: this.args.clusterFlows.invalidationFlow,
          },
          opts
        ),
        isProxy: false,
      };
    }

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
        isProxy: false,
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
        isProxy: false,
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
        isProxy: false,
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
        isProxy: false,
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
        isProxy: false,
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
        isProxy: false,
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
        isProxy: false,
      };
    }

    throw new Error("Unknown authentik provider type");
  }

  private mapFlowsToProvider(providerConfig: AuthentikProviderBase) {
    return {
      authorizationFlow: providerConfig.authorizationFlow || this.args.clusterFlows.authorizationFlow,
      authenticationFlow: providerConfig.authenticationFlow || this.args.clusterFlows.authenticationFlow,
      invalidationFlow: providerConfig.invalidationFlow || this.args.clusterFlows.invalidationFlow,
    };
  }

  private resolvePropertyMappings(mappings?: pulumi.Input<string>[]): pulumi.Output<string>[] | undefined {
    if (!mappings) return undefined;

    return pulumi.output(mappings).apply((maps) => maps.map((scopeName) => this.args.propertyMappings.getScopeMappingId(scopeName as string))) as any;
  }

  private createApplication(resourceName: string, definition: ApplicationDefinition, provider?: pulumi.CustomResource): authentik.Application {
    const slug = definition.spec.slug || resourceName;
    const args: authentik.ApplicationArgs = {
      name: definition.spec.name,
      slug,
      group: definition.spec.category,
      metaIcon: definition.spec.icon,
      metaPublisher: definition.metadata.annotations?.["driscoll.dev/clusterTitle"],
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
    if (definition.spec.accessPolicy?.groups) {
      for (const groupName of definition.spec.accessPolicy.groups) {
        const group = this.args.groups.getGroup(groupName);
        addPolicyBindingToApplication(app, { group: group.id });
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

  private getResourceName(clusterName: string, namespace: string, originalName: string): string {
    if (namespace.toLowerCase() === clusterName.toLowerCase()) {
      return clusterName;
    }
    return `${clusterName}-${namespace}-${originalName}`;
  }
}

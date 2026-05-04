import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import * as kubernetes from "@pulumi/kubernetes";
import * as random from "@pulumi/random";
import { CategoryEnum, OnePasswordItem, TypeEnum } from "../dynamic/1password/OnePasswordItem.ts";
import { Roles } from "./constants.ts";
import { OPClientItem, OPClient } from "./op.ts";
import { ClusterDefinition, GlobalResources } from "./globals.ts";
import { addPolicyBindingToApplication } from "./authentik/extension-methods.ts";
import { ApplicationCertificate } from "./authentik/application-certificate.ts";
import { ApplicationDefinitionSchema, AuthentikDefinition, Endpoint, GatusDefinition } from "@openapi/application-definition.js";
import * as yaml from "yaml";
import { addUptimeGatus, awaitOutput, clientIdPair } from "./helpers.ts";

const op = new OPClient();
export interface AuthentikResourcesArgs {
  globals: GlobalResources;
  clusterKey: string;
  outputs: pulumi.Input<AuthentikOutputs>;
  cluster: pulumi.Input<ClusterDefinition>;
  loadFromResource<T>(application: ApplicationDefinitionSchema, type: "authentik" | "uptime" | "gatus", from: { type: string; name: string }): Promise<T>;
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
  public readonly outpostsComponent: pulumi.ComponentResource;
  public readonly proxyProviders: pulumi.Output<number>[] = [];
  public get uptimeInstances() {
    return this._uptimeInstances;
  }
  private _uptimeInstances: pulumi.Output<GatusDefinition[]> = pulumi.output([]);
  public readonly cluster: pulumi.Output<ClusterDefinition>;
  private readonly authentik: pulumi.Output<AuthentikOutputs>;

  constructor(
    private readonly args: AuthentikResourcesArgs,
    private readonly opts?: pulumi.ComponentResourceOptions,
  ) {
    super("custom:resource:AuthentikResourceManager", `${args.clusterKey}-authentik-resource-manager`, {}, opts);

    this.authentik = pulumi.output(args.outputs);
    this.cluster = pulumi.output(args.cluster);
    this.providersComponent = new pulumi.ComponentResource("custom:resource:providers", `${args.clusterKey}-providers`, {}, { parent: this });
    this.applicationsComponent = new pulumi.ComponentResource("custom:resource:applications", `${args.clusterKey}-applications`, {}, { parent: this });
    this.outpostsComponent = new pulumi.ComponentResource("custom:resource:outposts", `${args.clusterKey}-outposts`, {}, { parent: this });
  }

  public createApplication(application: ApplicationDefinitionSchema) {
    return pulumi
      .output(application)
      .apply((application) =>
        (application.spec.authentikFrom
          ? pulumi.output(this.args.loadFromResource<ApplicationDefinitionSchema["spec"]["authentik"]>(application, "authentik", application.spec.authentikFrom))
          : pulumi.output(application.spec.authentik)
        ).apply((authentik) => ({ application, authentik })),
      )
      .apply(async ({ application, authentik }) => {
        if (authentik) {
          const result = await this.createProvider(application, authentik);
          if (result.isProxy && result.provider) {
            this.proxyProviders.push(result.provider.id.apply((id) => parseFloat(id)));
          }
          return { application, result: result };
        }
        return {
          application,
          result: {
            provider: undefined,
          },
        };
      })
      .apply(async ({ application, result }) => {
        const app = this.createAuthentikApplication(application, result?.provider);
        return application.spec.gatus
          ? await awaitOutput(this.addGatusInstances(application, application.spec.gatus).apply((defs) => Object.assign(result, { app, gatus: defs })))
          : Object.assign(result, { app, gatus: [] });
      });
  }

  private resolveResourceName(definition: ApplicationDefinitionSchema) {
    return (definition.spec.slug ?? (definition.metadata.namespace ?? this.args.clusterKey) === this.args.clusterKey)
      ? `${this.args.clusterKey}-${definition.metadata.name}`
      : `${this.args.clusterKey}-${definition.metadata.namespace}-${definition.metadata.name}`;
  }

  private async createProvider(definition: ApplicationDefinitionSchema, authentikDefinition: AuthentikDefinition) {
    const opts = { parent: this.providersComponent, deleteBeforeReplace: true };
    const resourceName = this.resolveResourceName(definition);

    // Proxy Provider
    if (authentikDefinition.proxy) {
      return {
        provider: new authentik.ProviderProxy(
          resourceName,
          {
            // name: providerName,
            authorizationFlow: authentikDefinition.proxy.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
            authenticationFlow: authentikDefinition.proxy.authenticationFlow ?? this.authentik.flows.authenticationFlow,
            invalidationFlow: authentikDefinition.proxy.invalidationFlow ?? this.authentik.flows.providerLogoutFlow,
            externalHost: authentikDefinition.proxy.externalHost,
            accessTokenValidity: authentikDefinition.proxy.accessTokenValidity,
            refreshTokenValidity: authentikDefinition.proxy.refreshTokenValidity,
            basicAuthEnabled: authentikDefinition.proxy.basicAuthEnabled,
            basicAuthPasswordAttribute: authentikDefinition.proxy.basicAuthPasswordAttribute,
            basicAuthUsernameAttribute: authentikDefinition.proxy.basicAuthUsernameAttribute,
            cookieDomain: authentikDefinition.proxy.cookieDomain,
            interceptHeaderAuth: authentikDefinition.proxy.interceptHeaderAuth,
            internalHost: authentikDefinition.proxy.internalHost,
            internalHostSslValidation: authentikDefinition.proxy.internalHostSslValidation,
            jwksSources: authentikDefinition.proxy.jwksSources,
            jwtFederationProviders: authentikDefinition.proxy.jwtFederationProviders,
            jwtFederationSources: authentikDefinition.proxy.jwtFederationSources,
            mode: authentikDefinition.proxy.mode,
            skipPathRegex: authentikDefinition.proxy.skipPathRegex,
            propertyMappings: this.resolvePropertyMappings(authentikDefinition.proxy.propertyMappings),
          },
          opts,
        ),
        isProxy: true as const,
      };
    }

    // OAuth2 Provider
    if (authentikDefinition.oauth2) {
      const oauth2 = authentikDefinition.oauth2;
      const { clientId, clientSecret } = clientIdPair(resourceName, { clientId: oauth2.clientId, clientSecret: oauth2.clientSecret, options: opts });
      const signingKey = new ApplicationCertificate(resourceName, { globals: this.args.globals }, { parent: this });

      const provider = new authentik.ProviderOauth2(
        resourceName,
        {
          // name: providerName,
          authorizationFlow: oauth2.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
          authenticationFlow: oauth2.authenticationFlow || this.authentik.flows.authenticationFlow,
          invalidationFlow: oauth2.invalidationFlow || this.authentik.flows.providerLogoutFlow,
          clientId: clientId,
          clientSecret: clientSecret,
          signingKey: signingKey.signingKey.id,
          allowedRedirectUris: oauth2.allowedRedirectUris?.map((uri) => ({
            matching_mode: uri.matching_mode ?? "strict",
            url: uri.url,
          })),
          accessCodeValidity: oauth2.accessCodeValidity,
          accessTokenValidity: oauth2.accessTokenValidity,
          refreshTokenValidity: oauth2.refreshTokenValidity,
          logoutUri: oauth2.logoutUri,
          clientType: oauth2.clientType,
          encryptionKey: oauth2.encryptionKey,
          includeClaimsInIdToken: oauth2.includeClaimsInIdToken,
          issuerMode: oauth2.issuerMode,
          jwksSources: oauth2.jwksSources,
          jwtFederationProviders: oauth2.jwtFederationProviders,
          jwtFederationSources: oauth2.jwtFederationSources,
          subMode: oauth2.subMode,
          propertyMappings: this.resolvePropertyMappings(oauth2.propertyMappings),
        },
        opts,
      );

      const providerConfig = authentik.getProviderOauth2ConfigOutput({ name: provider.name }, { parent: provider });

      const oidcCredentials = new OnePasswordItem(
        `${resourceName}-oidc-credentials`,
        {
          category: CategoryEnum.APICredential,
          title: pulumi.interpolate`${this.cluster.key}-${definition.metadata.name}-oidc-credentials`,
          fields: pulumi.output({
            client_id: { value: clientId, type: TypeEnum.String },
            client_secret: { value: clientSecret, type: TypeEnum.Concealed },
            authorization_url: { value: providerConfig.authorizeUrl, type: TypeEnum.String },
            token_url: { value: providerConfig.tokenUrl, type: TypeEnum.String },
            userinfo_url: { value: providerConfig.userInfoUrl, type: TypeEnum.String },
            issuer: { value: providerConfig.issuerUrl, type: TypeEnum.String },
            end_session_url: { value: providerConfig.logoutUrl, type: TypeEnum.String },
            jwks_url: { value: providerConfig.jwksUrl, type: TypeEnum.String },
            openid_configuration_url: {
              value: pulumi.interpolate`${providerConfig.issuerUrl}.well-known/openid-configuration`,
              type: TypeEnum.String,
            },
          }),
        },
        { parent: provider },
      );

      return { provider, config: providerConfig, oidcCredentials, isProxy: false as const, clientId: await awaitOutput(clientId), clientSecret: await awaitOutput(clientSecret) };
    }

    // // LDAP Provider
    // if (authentikDefinition.ldap) {
    //   return {
    //     provider: new authentik.ProviderLdap(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         bindFlow: this.authentik.flows.authenticationFlow,
    //         unbindFlow: this.authentik.flows.providerLogoutFlow,
    //         baseDn: authentikDefinition.ldap.baseDn,
    //         bindMode: authentikDefinition.ldap.bindMode,
    //         certificate: authentikDefinition.ldap.certificate,
    //         gidStartNumber: authentikDefinition.ldap.gidStartNumber,
    //         mfaSupport: authentikDefinition.ldap.mfaSupport,
    //         searchMode: authentikDefinition.ldap.searchMode,
    //         tlsServerName: authentikDefinition.ldap.tlsServerName,
    //         uidStartNumber: authentikDefinition.ldap.uidStartNumber,
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // SAML Provider
    // if (authentikDefinition.saml) {
    //   return {
    //     provider: new authentik.ProviderSaml(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         authorizationFlow: authentikDefinition.saml.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
    //         authenticationFlow: authentikDefinition.saml.authenticationFlow ?? this.authentik.flows.authenticationFlow,
    //         invalidationFlow: authentikDefinition.saml.invalidationFlow ?? this.authentik.flows.providerLogoutFlow,
    //         acsUrl: authentikDefinition.saml.acsUrl,
    //         assertionValidNotBefore: authentikDefinition.saml.assertionValidNotBefore,
    //         assertionValidNotOnOrAfter: authentikDefinition.saml.assertionValidNotOnOrAfter,
    //         audience: authentikDefinition.saml.audience,
    //         authnContextClassRefMapping: authentikDefinition.saml.authnContextClassRefMapping,
    //         defaultRelayState: authentikDefinition.saml.defaultRelayState,
    //         digestAlgorithm: authentikDefinition.saml.digestAlgorithm,
    //         encryptionKp: authentikDefinition.saml.encryptionKp,
    //         issuer: authentikDefinition.saml.issuer,

    //         ...removeUndefinedProperties(authentikDefinition.saml),
    //         propertyMappings: this.resolvePropertyMappings(authentikDefinition.saml.propertyMappings),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // RAC Provider
    // if (authentikDefinition.rac) {
    //   return {
    //     provider: new authentik.ProviderRac(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         authorizationFlow: this.authentik.flows.implicitConsentFlow,
    //         authenticationFlow: this.authentik.flows.authenticationFlow,
    //         ...removeUndefinedProperties(authentikDefinition.rac),
    //         propertyMappings: this.resolvePropertyMappings(authentikDefinition.rac.propertyMappings),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // Radius Provider
    // if (authentikDefinition.radius) {
    //   return {
    //     provider: new authentik.ProviderRadius(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         authorizationFlow: this.authentik.flows.implicitConsentFlow,
    //         invalidationFlow: this.authentik.flows.providerLogoutFlow,
    //         ...removeUndefinedProperties(authentikDefinition.radius),
    //         propertyMappings: this.resolvePropertyMappings(authentikDefinition.radius.propertyMappings),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // SSF Provider
    // if (authentikDefinition.ssf) {
    //   return {
    //     provider: new authentik.ProviderSsf(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         ...removeUndefinedProperties(authentikDefinition.ssf),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // SCIM Provider
    // if (authentikDefinition.scim) {
    //   return {
    //     provider: new authentik.ProviderScim(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         ...removeUndefinedProperties(authentikDefinition.scim),
    //         propertyMappings: this.resolvePropertyMappings(authentikDefinition.scim.propertyMappings),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // Microsoft Entra Provider
    // if (authentikDefinition.microsoftEntra) {
    //   return {
    //     provider: new authentik.ProviderMicrosoftEntra(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         ...removeUndefinedProperties(authentikDefinition.microsoftEntra),
    //         propertyMappings: this.resolvePropertyMappings(authentikDefinition.microsoftEntra.propertyMappings),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    // // Google Workspace Provider
    // if (authentikDefinition.googleWorkspace) {
    //   return {
    //     provider: new authentik.ProviderGoogleWorkspace(
    //       definition.metadata.name,
    //       {
    //         name: providerName,
    //         ...removeUndefinedProperties(authentikDefinition.googleWorkspace),
    //         propertyMappings: this.resolvePropertyMappings(authentikDefinition.googleWorkspace.propertyMappings),
    //       },
    //       opts,
    //     ),
    //     isProxy: false,
    //   };
    // }

    throw new Error("Unknown authentik provider type");
  }

  private resolvePropertyMappings(mappings?: pulumi.Input<string>[]): pulumi.Output<string[]> | undefined {
    if (!mappings) return undefined;

    return pulumi
      .output(mappings)
      .apply((maps) => pulumi.all([this.authentik.scopeMappings, maps]))
      .apply(([mappings, scopeNames]) => scopeNames.map((scopeName) => mappings[scopeName.replace(/\//g, "~1")]).filter((mapping): mapping is string => !!mapping));
  }

  private createAuthentikApplication(definition: ApplicationDefinitionSchema, provider?: pulumi.CustomResource) {
    const resourceName = this.resolveResourceName(definition);
    const args: authentik.ApplicationArgs = {
      name: definition.spec.name,
      slug: new random.RandomPet(resourceName, { prefix: resourceName, length: 1 }, { parent: this }).id,
      group: this.cluster.apply((cluster) => (definition.spec.category === "System" || cluster.title === definition.spec.category ? "System: " + cluster.title : definition.spec.category)),
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
        addPolicyBindingToApplication(app, { group: this.authentik.apply((z) => z.groups[groupName]) });
      }
    }

    return app;
  }

  private addGatusInstances(definition: ApplicationDefinitionSchema, gatusDefinitions: GatusDefinition[]) {
    return this.cluster
      .apply((cluster) => {
        return pulumi.all(
          gatusDefinitions.map((endpoint, i) => {
            endpoint.name = `${definition.spec.name} ${endpoint.name ?? (i == 0 ? "" : i + 1).toString()}`;
            endpoint.group ??= definition.spec.category;
            endpoint.group = endpoint.group === "System" || endpoint.group === cluster.title ? `Cluster: ${cluster.title}` : endpoint.group;
            endpoint.interval ??= "2m";
            endpoint.timeout ??= "60s";
            endpoint.alerts ??= [];
            endpoint.alerts.push({
              enabled: true,
              type: "pushover",
            });

            const yamlString = yaml.stringify(endpoint, { lineWidth: 0 });
            return pulumi.output(replaceOnePasswordPlaceholders(op, yamlString)).apply((y) => yaml.parse(y) as GatusDefinition);
          }),
        );
      })
      .apply((defs) => {
        this._uptimeInstances = this._uptimeInstances.apply((existing) => [...existing, ...defs]);
        return defs;
      });
  }
}

const vaultRegex = /op\:\/\/Eris\/([\w| ]+)\/([\w| ]+)/g;
async function replaceOnePasswordPlaceholders(op: OPClient, value: string): Promise<string> {
  const matches = value.matchAll(vaultRegex);
  const items = new Map();
  for (const [, itemTitle, fieldName] of matches) {
    if (items.has(`op://Eris/${itemTitle}/${fieldName}`)) {
      continue;
    }
    const item = await op.getItemByTitle(itemTitle);
    const fieldValue = item.fields?.[fieldName]?.value;
    if (!fieldValue) {
      console.error(`Field ${fieldName} not found in 1Password item ${itemTitle}`);
    }
    items.set(`op://Eris/${itemTitle}/${fieldName}`, fieldValue);
  }

  return value.replace(vaultRegex, (fullMatch) => {
    return items.get(fullMatch) || fullMatch;
  });
}

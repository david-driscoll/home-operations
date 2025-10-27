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
import { addUptimeGatus } from "./helpers.ts";

const op = new OPClient();
export interface AuthentikResourcesArgs {
  globals: GlobalResources;
  outputs: AuthentikOutputs;
  cluster: ClusterDefinition;
  authentikCredential: pulumi.Input<string>;
  loadFromResource<T>(application: ApplicationDefinitionSchema, type: "authentik" | "uptime" | "gatus", from: { type: string; name: string }): Promise<T>;
  createGatus(name: string, definition: ApplicationDefinitionSchema, gatusDefinitions: GatusDefinition[]): Promise<void>;
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
  public readonly cluster: ClusterDefinition;
  private readonly authentik: AuthentikOutputs;

  constructor(private readonly args: AuthentikResourcesArgs, private readonly opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikResourceManager", "authentik-resource-manager", {}, opts);

    this.authentik = args.outputs;
    this.cluster = args.cluster;
    this.providersComponent = new pulumi.ComponentResource("custom:resource:providers", "providers", {}, { parent: this });
    this.applicationsComponent = new pulumi.ComponentResource("custom:resource:applications", "applications", {}, { parent: this });
    this.outpostsComponent = new pulumi.ComponentResource("custom:resource:outposts", "outposts", {}, { parent: this });
  }

  public async createApplication(application: ApplicationDefinitionSchema) {
    let provider: pulumi.CustomResource | undefined;

    let authentik = application.spec.authentik;
    if (application.spec.authentikFrom) {
      // for docker this is a file
      // for kubernetes it's a config map or secret.
      authentik = await this.args.loadFromResource<AuthentikDefinition>(application, "authentik", application.spec.authentikFrom);
    }

    if (authentik) {
      const result = this.createProvider(application, authentik);
      provider = result.provider;
      if (result.isProxy) {
        this.proxyProviders.push(provider.id.apply((id) => parseFloat(id)));
      }
    }

    const app = this.createAuthentikApplication(application, provider);

    let gatus = application.spec.gatus;

    if (gatus) {
      const instance = await this.createGatus(application, gatus);
      // we have to save to k8s secret
      // that secret needs to be mounted as a directory for gatus
    }

    return { app, provider };
  }

  private resolveResourceName(definition: ApplicationDefinitionSchema) {
    return definition.spec.slug ?? (definition.metadata.namespace ?? this.cluster.key) === this.cluster.key
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
          opts
        ),
        isProxy: true,
      };
    }

    // OAuth2 Provider
    if (authentikDefinition.oauth2) {
      const oauth2 = authentikDefinition.oauth2;
      const clientId = oauth2.clientId
        ? pulumi.output(oauth2.clientId)
        : new random.RandomString(
            `${resourceName}-client-id`,
            {
              length: 16,
              upper: false,
              special: false,
            },
            opts
          ).result;
      const clientSecret = oauth2.clientSecret
        ? pulumi.output(oauth2.clientSecret)
        : new random.RandomPassword(
            `${resourceName}-client-secret`,
            {
              length: 32,
              upper: false,
              special: false,
            },
            opts
          ).result;
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
          backchannelLogoutUri: oauth2.backchannelLogoutUri,
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
        opts
      );

      const oidcCredentials = new OnePasswordItem(
        `${this.cluster.key}-${definition.metadata.name}-oidc-credentials`,
        {
          category: CategoryEnum.APICredential,
          title: pulumi.interpolate`${this.cluster.key}-${definition.metadata.name}-oidc-credentials`,
          fields: pulumi.output({
            client_id: { value: clientId, type: TypeEnum.String },
            client_secret: { value: clientSecret, type: TypeEnum.Concealed },
            authorization_url: { value: `https://${this.cluster.authentikDomain}/application/o/authorize/`, type: TypeEnum.String },
            token_url: { value: `https://${this.cluster.authentikDomain}/application/o/token/`, type: TypeEnum.String },
            userinfo_url: { value: `https://${this.cluster.authentikDomain}/application/o/userinfo/`, type: TypeEnum.String },
            revoke_url: { value: `https://${this.cluster.authentikDomain}/application/o/revoke/`, type: TypeEnum.String },
            issuer: { value: `https://${this.cluster.authentikDomain}/application/o/${resourceName}/`, type: TypeEnum.String },
            end_session_url: { value: `https://${this.cluster.authentikDomain}/application/o/${resourceName}/end-session/`, type: TypeEnum.String },
            jwks_url: { value: `https://${this.cluster.authentikDomain}/application/o/${resourceName}/jwks/`, type: TypeEnum.String },
            openid_configuration_url: {
              value: `https://${this.cluster.authentikDomain}/application/o/${resourceName}/.well-known/openid-configuration`,
              type: TypeEnum.String,
            },
          }),
        },
        { parent: provider }
      );

      return { provider, oidcCredentials, isProxy: false, clientId, clientSecret };
    }

    // // LDAP Provider
    // if (authentikDefinition.ldap) {
    //   return {
    //     provider: new authentik.ProviderLdap(
    //       resourceName,
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
    //       resourceName,
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
    //       resourceName,
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
    //       resourceName,
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
    //       resourceName,
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
    //       resourceName,
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
    //       resourceName,
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
    //       resourceName,
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
      .apply(([mappings, scopeNames]) => scopeNames.map((scopeName) => mappings[scopeName.replace(/\//g, "~1")]));
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

  private async createGatus(definition: ApplicationDefinitionSchema, gatusDefinitions: GatusDefinition[]) {
    const resourceName = this.resolveResourceName(definition);
    for (let i = 0; i < gatusDefinitions.length; i++) {
      const endpoint = gatusDefinitions[i];
      endpoint.name = `${definition.spec.name} ${endpoint.name ?? (i == 0 ? "" : i + 1).toString()}`;
      endpoint.interval ??= "1m";
      const yamlString = yaml.stringify(endpoint, { lineWidth: 0 });
      gatusDefinitions[i] = yaml.parse(await replaceOnePasswordPlaceholders(op, yamlString));
    }
    await addUptimeGatus(
      `${this.cluster.key}-${definition.metadata.name}`,
      this.args.globals,
      gatusDefinitions
        .map((e) => yaml.parse(yaml.stringify(e, { lineWidth: 0 })) as GatusDefinition)
        .map((e) => {
          e.group = e.group === "System" ? this.cluster.title : e.group;
          return e;
        }),
      this
    );
    return await this.args.createGatus(resourceName, definition, gatusDefinitions);
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
    items.set(`op://Eris/${itemTitle}/${fieldName}`, item.fields?.[fieldName].value);
  }

  return value.replace(vaultRegex, (fullMatch) => {
    return items.get(fullMatch) || fullMatch;
  });
}

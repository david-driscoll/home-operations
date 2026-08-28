import type { ApplicationDefinitionSchema, AuthentikDefinition, GatusDefinition } from "@openapi/application-definition.js";
import * as authentik from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as yaml from "yaml";
import { CategoryEnum, OnePasswordItem, TypeEnum } from "../dynamic/1password/OnePasswordItem.ts";
import type { Application } from "../sdks/authentik/bin/application.js";
import type { ProviderOauth2 } from "../sdks/authentik/bin/providerOauth2.js";
import type { ProviderProxy } from "../sdks/authentik/bin/providerProxy.js";
import { ApplicationCertificate } from "./authentik/application-certificate.ts";
import { addPolicyBindingToApplication } from "./authentik/extension-methods.ts";
import { baoKvSecret, baoProvenance, oidcBaoPath } from "./bao.ts";
import type { Roles } from "./constants.ts";
import type { GlobalResources } from "./globals.ts";
import { awaitOutput, clientIdPair } from "./helpers.ts";
import type { ClusterDefinition, VaultStore } from "./store/index.ts";

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
  flows: {
    [K in keyof ReturnType<import("./authentik/flows.ts").FlowsManager["createFlows"]>]: string;
  };
}
export class AuthentikApplicationManager extends pulumi.ComponentResource {
  private readonly providersComponent: pulumi.ComponentResource;
  private readonly applicationsComponent: pulumi.ComponentResource;
  public readonly outpostsComponent: pulumi.ComponentResource;
  public readonly cluster: pulumi.Output<ClusterDefinition>;
  private readonly authentik: pulumi.Output<AuthentikOutputs>;
  private store: VaultStore;
  private _applications: pulumi.Output<
    ((
      | {
          provider: ProviderProxy;
          // The twin registered against spec.tailnetUrl. Present only for a
          // proxy app that declares one. It has to travel alongside `provider`
          // because the outpost is built from this list -- a provider the
          // outpost does not carry is a provider that answers nothing.
          tailnetProvider?: ProviderProxy;
          isProxy: true;
          config?: undefined;
          oidcCredentials?: undefined;
          clientId?: undefined;
          clientSecret?: undefined;
        }
      | {
          provider: ProviderOauth2;
          config: pulumi.Output<authentik.GetProviderOauth2ConfigResult>;
          oidcCredentials: OnePasswordItem;
          isProxy: false;
          clientId: string;
          clientSecret: string;
        }
      | {
          provider: undefined;
          isProxy: false;
        }
    ) & {
      definition: ApplicationDefinitionSchema;
      app: Application;
      gatus: GatusDefinition[];
    })[]
  > = pulumi.output([]);
  public get applications() {
    return this._applications;
  }

  constructor(
    private readonly args: AuthentikResourcesArgs,
    readonly opts?: pulumi.ComponentResourceOptions,
  ) {
    super("custom:resource:AuthentikResourceManager", `${args.clusterKey}-authentik-resource-manager`, {}, opts);

    this.authentik = pulumi.output(args.outputs);
    this.cluster = pulumi.output(args.cluster);
    this.store = args.globals.store;
    this.providersComponent = new pulumi.ComponentResource("custom:resource:providers", `${args.clusterKey}-providers`, {}, { parent: this });
    this.applicationsComponent = new pulumi.ComponentResource("custom:resource:applications", `${args.clusterKey}-applications`, {}, { parent: this });
    this.outpostsComponent = new pulumi.ComponentResource("custom:resource:outposts", `${args.clusterKey}-outposts`, {}, { parent: this });
  }

  public createApplication(application: pulumi.Input<ApplicationDefinitionSchema>) {
    return pulumi
      .output(application)
      .apply(application =>
        (application.spec.authentikFrom
          ? pulumi.output(this.args.loadFromResource<ApplicationDefinitionSchema["spec"]["authentik"]>(application, "authentik", application.spec.authentikFrom))
          : pulumi.output(application.spec.authentik)
        ).apply(authentik => ({ application, authentik })),
      )
      .apply(async ({ application, authentik }) => {
        if (authentik) {
          const result = await this.createProvider(application, authentik);
          return { application, result: result };
        }
        return {
          application,
          result: {
            provider: undefined,
            isProxy: false as const,
          },
        };
      })
      .apply(({ application, result }) => {
        const app = this.createAuthentikApplication(application, result?.provider);
        // A ProxyProvider is only reachable through an Application -- the outpost
        // resolves an incoming host to a provider by way of the application bound
        // to it, so the tailnet twin needs its own or it is inert and the tailnet
        // host still answers "no app for hostname". Same access_policy bindings,
        // because createAuthentikApplication reads them off the same definition.
        if ("tailnetProvider" in result && result.tailnetProvider) {
          this.createAuthentikApplication(application, result.tailnetProvider, "tailnet");
        }
        const r = pulumi.output(this.addGatusInstances(application, application.spec.gatus ?? [])).apply(defs => {
          const r = Object.assign(result, {
            definition: application,
            app,
            gatus: defs,
          });
          return r;
        });
        return r;
      })
      .apply(result => {
        this._applications = this._applications.apply(apps => [...apps, result]);
        return result;
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
      const proxy = authentikDefinition.proxy;
      // Everything except the hostname. The tailnet twin below has to be
      // configured IDENTICALLY -- same flows, same mode, same skipPathRegex --
      // or the two hostnames enforce different policy, so the shared shape is
      // built once rather than restated.
      const proxyArgs = (externalHost: pulumi.Input<string>) =>
        ({
          // name: providerName,
          authorizationFlow: proxy.authorizationFlow ?? this.authentik.flows.implicitConsentFlow,
          authenticationFlow: proxy.authenticationFlow ?? this.authentik.flows.authenticationFlow,
          invalidationFlow: proxy.invalidationFlow ?? this.authentik.flows.providerLogoutFlow,
          externalHost,
          accessTokenValidity: proxy.accessTokenValidity,
          refreshTokenValidity: proxy.refreshTokenValidity,
          basicAuthEnabled: proxy.basicAuthEnabled,
          basicAuthPasswordAttribute: proxy.basicAuthPasswordAttribute,
          basicAuthUsernameAttribute: proxy.basicAuthUsernameAttribute,
          cookieDomain: proxy.cookieDomain,
          interceptHeaderAuth: proxy.interceptHeaderAuth,
          internalHost: proxy.internalHost,
          internalHostSslValidation: proxy.internalHostSslValidation,
          jwksSources: proxy.jwksSources,
          jwtFederationProviders: proxy.jwtFederationProviders,
          jwtFederationSources: proxy.jwtFederationSources,
          mode: proxy.mode,
          skipPathRegex: proxy.skipPathRegex,
          propertyMappings: this.resolvePropertyMappings(proxy.propertyMappings),
        }) satisfies authentik.ProviderProxyArgs;

      // authentik's ProxyProvider.external_host is a SINGLE string -- there is no
      // list form -- so one provider can only ever answer for one hostname. An app
      // published on both `<app>.${ROOT_DOMAIN}` and its tailnet name therefore
      // needs two, or the outpost rejects the second with
      //   400 {"message":"no app for hostname"}
      // which is what every authentik-gated tailnet route on the Dockge hosts
      // (backrest-*, garage-*) answered before this existed.
      //
      // A twin rather than a `forward_domain` provider: forward_domain protects a
      // whole cookie domain with one policy, and these apps each carry their own
      // spec.access_policy groups. Splitting per app is the only shape that keeps
      // those distinct.
      const tailnetProvider = definition.spec.tailnetUrl ? new authentik.ProviderProxy(`${resourceName}-tailnet`, proxyArgs(definition.spec.tailnetUrl), opts) : undefined;

      return {
        tailnetProvider,
        provider: new authentik.ProviderProxy(resourceName, proxyArgs(proxy.externalHost), opts),
        isProxy: true as const,
      };
    }

    // OAuth2 Provider
    if (authentikDefinition.oauth2) {
      const oauth2 = authentikDefinition.oauth2;
      const { clientId, clientSecret } = clientIdPair(resourceName, {
        clientId: oauth2.clientId,
        clientSecret: oauth2.clientSecret,
        options: opts,
      });
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
          allowedRedirectUris: oauth2.allowedRedirectUris?.map(uri => ({
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
          grantTypes: oauth2.grantTypes ?? ["implicit", "authorization_code", "refresh_token", "client_credentials"],
          subMode: oauth2.subMode,
          propertyMappings: this.resolvePropertyMappings(oauth2.propertyMappings),
        },
        opts,
      );

      const providerConfig = authentik.getProviderOauth2ConfigOutput({ name: provider.name }, { parent: provider });

      const oidcCredentials = new OnePasswordItem(
        `${this.args.clusterKey}-${definition.metadata.name}-oidc-credentials`,
        {
          category: CategoryEnum.APICredential,
          title: pulumi.interpolate`${this.args.clusterKey}-${definition.metadata.name}-oidc-credentials`,
          fields: pulumi.output({
            client_id: { value: clientId, type: TypeEnum.String },
            client_secret: { value: clientSecret, type: TypeEnum.Concealed },
            authorization_url: {
              value: providerConfig.authorizeUrl,
              type: TypeEnum.String,
            },
            token_url: {
              value: providerConfig.tokenUrl,
              type: TypeEnum.String,
            },
            userinfo_url: {
              value: providerConfig.userInfoUrl,
              type: TypeEnum.String,
            },
            issuer: { value: providerConfig.issuerUrl, type: TypeEnum.String },
            end_session_url: {
              value: providerConfig.logoutUrl,
              type: TypeEnum.String,
            },
            jwks_url: { value: providerConfig.jwksUrl, type: TypeEnum.String },
            openid_configuration_url: {
              value: pulumi.interpolate`${providerConfig.issuerUrl}.well-known/openid-configuration`,
              type: TypeEnum.String,
            },
          }),
        },
        { parent: provider },
      );

      // Phase 8a dual-write (openbao-migration PLAN §G): the same generated
      // OIDC credential also lands at its canonical OpenBao path so the
      // Phase 6-7 ESO cutovers have data to read. 1Password stays
      // authoritative until Phase 11 — this is written ALONGSIDE the
      // OnePasswordItem above, never instead of it; rollback is a plain
      // `git revert` of this block.
      if (this.args.globals.baoDualWriteEnabled) {
        baoKvSecret(
          `${resourceName}-oidc-bao`,
          {
            mount: "secrets",
            path: oidcBaoPath(this.args.clusterKey, definition.metadata.name),
            data: {
              client_id: clientId,
              client_secret: clientSecret,
              authorization_url: providerConfig.authorizeUrl,
              token_url: providerConfig.tokenUrl,
              userinfo_url: providerConfig.userInfoUrl,
              issuer: providerConfig.issuerUrl,
              end_session_url: providerConfig.logoutUrl,
              jwks_url: providerConfig.jwksUrl,
              openid_configuration_url: pulumi.interpolate`${providerConfig.issuerUrl}.well-known/openid-configuration`,
            },
            // The OAuth client secret. This path is READ live through
            // BaoStore (`<cluster>-<app>-oidc-credentials` resolves here), and
            // it carried no concealment declaration at all until Phase 11 —
            // the value only stayed out of state in the clear because the
            // Vault provider happens to declare its own field sensitive.
            concealedFields: ["client_secret"],
            customMetadata: baoProvenance({
              source_title: `${this.args.clusterKey}-${definition.metadata.name}-oidc-credentials`,
            }),
          },
          { parent: provider, provider: this.args.globals.baoProvider },
        );
      } else {
        pulumi.log.warn(
          `No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the OpenBao dual-write for ${resourceName}. 1Password stays authoritative; the canonical OpenBao path will be empty until a credentialed run.`,
          provider,
        );
      }

      return {
        provider,
        config: providerConfig,
        oidcCredentials,
        isProxy: false as const,
        clientId: await awaitOutput(clientId),
        clientSecret: await awaitOutput(clientSecret),
      };
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
      .apply(maps => pulumi.all([this.authentik.scopeMappings, maps]))
      .apply(([mappings, scopeNames]) => scopeNames.map(scopeName => mappings[scopeName.replace(/\//g, "~1")]).filter((mapping): mapping is string => !!mapping));
  }

  /**
   * Authentik validates `meta_launch_url` with Django's URL validator, which accepts only
   * http/https (and ftp/ftps). A headless service — a Wyoming satellite, a database — has no
   * browser-facing surface, and omitting `spec.url` is the correct shape for it (see the
   * `database/postgres` and `network/crowdsec` definitions). Any other scheme is a definition
   * bug that would otherwise 400 and stall the whole stack, so drop it and warn instead of
   * taking the run down. Non-HTTP endpoints belong in `spec.gatus`, not in the launch URL.
   */
  private resolveLaunchUrl(definition: ApplicationDefinitionSchema) {
    const url = definition.spec.url;
    if (!url) return undefined;
    if (/^(?:https?|ftps?):\/\//i.test(url)) return url;

    pulumi.log.warn(`Application "${definition.metadata.name}" has a non-HTTP spec.url (${url}); omitting metaLaunchUrl. Use spec.gatus for non-HTTP health checks.`, this);
    return undefined;
  }

  /**
   * @param variant Set for the tailnet twin. It keys the Pulumi resource name and
   *   the authentik slug apart from the primary application -- both are unique per
   *   authentik instance, so reusing them would have the two fight over one object.
   *   It also renames the app in the portal and points its launch URL at the tailnet
   *   name, so the two entries are tellable apart by a human choosing between them.
   */
  private createAuthentikApplication(definition: ApplicationDefinitionSchema, provider?: pulumi.CustomResource, variant?: "tailnet") {
    const baseName = this.resolveResourceName(definition);
    const resourceName = variant ? `${baseName}-${variant}` : baseName;
    const args: authentik.ApplicationArgs = {
      name: variant === "tailnet" ? `${definition.spec.name} (Tailnet)` : definition.spec.name,
      slug: new random.RandomPet(resourceName, { prefix: resourceName, length: 1 }, { parent: this }).id,
      group: this.cluster.apply(cluster => (definition.spec.category === "System" || cluster.title === definition.spec.category ? `System: ${cluster.title}` : definition.spec.category)),
      metaIcon: definition.spec.icon,
      metaPublisher: this.cluster.title,
      metaDescription: definition.spec.description || "",
      metaLaunchUrl: variant === "tailnet" ? definition.spec.tailnetUrl : this.resolveLaunchUrl(definition),
      openInNewTab: true,
    };

    if (provider) {
      args.protocolProvider = provider.id.apply(id => parseFloat(id));
    }

    const app = new authentik.Application(resourceName, args, {
      parent: this.applicationsComponent,
      deleteBeforeReplace: true,
    });

    // Add group bindings for access control
    if (definition.spec.access_policy?.groups) {
      for (const groupName of definition.spec.access_policy.groups) {
        addPolicyBindingToApplication(app, {
          group: this.authentik.apply(z => z.groups[groupName]),
        });
      }
    }

    return app;
  }

  private addGatusInstances(definition: ApplicationDefinitionSchema, gatusDefinitions: GatusDefinition[]) {
    return this.cluster.apply(cluster => {
      return pulumi.all(
        gatusDefinitions.map((endpoint, i) => {
          endpoint.name = `${definition.spec.name} ${endpoint.name ?? (i === 0 ? "" : i + 1).toString()}`;
          endpoint.group ??= definition.spec.category;
          endpoint.group = endpoint.group === "System" || endpoint.group === cluster.title ? `Cluster: ${cluster.title}` : endpoint.group;
          endpoint.alerts ??= [];
          endpoint.alerts.push({
            enabled: true,
            type: "pushover",
          });

          if (cluster.location === "remote") {
            endpoint.interval = "2m";
            for (const alert of endpoint.alerts) {
              alert["failure-threshold"] = 60;
              alert["success-threshold"] = 3;
            }
          }

          endpoint.interval ??= "2m";
          endpoint.timeout ??= "60s";

          pulumi.log.info(`Adding Gatus endpoint ${endpoint.name} in cluster ${cluster.title} with group ${endpoint.group}`, this);

          const yamlString = yaml.stringify(endpoint, { lineWidth: 0 });
          // Both resolvers, op:// then ref+openbao:// — application
          // definitions live in the cluster repos and convert to the ref+
          // syntax on their own schedule, so both must resolve here until no
          // definition carries op://.
          return pulumi.output(this.store.resolveSecretReferences(yamlString, `gatus definition for ${definition.metadata.name}`)).apply(y => yaml.parse(y) as GatusDefinition);
        }),
      );
    });
  }
}

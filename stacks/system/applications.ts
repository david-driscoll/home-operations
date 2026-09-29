/**
 * Authentik applications, the proxy outpost, and backrest plans for equestria,
 * discovered from the cluster's own `ApplicationDefinition`s, VolSync secrets
 * and annotated GarageBuckets.
 *
 * This was `stacks/applications`, a project with one stack per cluster. Once
 * equestria was the only cluster left, the per-cluster machinery (a
 * `clusterCredential` config, a `switch` on the cluster type, a brand branch
 * for `sgc`) was overhead, so the code moved here and its state was moved
 * with `pulumi state move`. That is why every resource name below is spelled
 * the way the old stack spelled it: the names, types and parent chains ARE the
 * URNs the moved state is keyed on. Rename one and Pulumi sees a delete plus a
 * create -- for a RandomPassword that means a new OIDC client secret.
 *
 * ## The cluster comes from the YAML, not from OpenBao
 *
 * The old stack called `globals.store.getKubernetesCluster()`. That goes
 * through `getCluster()` and reads `clusters/<key>/details`, which THIS stack
 * publishes -- exactly the self-read index.ts's header forbids. The definition
 * is read from `/clusters/equestria.yaml` instead (the same source the publish
 * loop uses), and the kubeconfig is built by the same function the store used,
 * so the `equestria-provider` input is byte-identical to what state holds.
 */
import { AuthentikApplicationManager, type AuthentikOutputs } from "@components/authentik.ts";
import { BackupPlanOrchestrator } from "@components/BackupPlanOrchestrator.ts";
import type { GlobalResources } from "@components/globals.ts";
import { addUptimeGatus, awaitOutput } from "@components/helpers.ts";
import { CLUSTERS } from "@components/store/clusters.ts";
import { generateTailscaleKubeConfig, type KubernetesClusterDefinition } from "@components/store/index.ts";
import * as kubernetes from "@kubernetes/client-node";
import type { ApplicationDefinitionSchema, AuthentikDefinition, GatusDefinition } from "@openapi/application-definition.js";
import * as authentik from "@pulumi/authentik";
import * as pk8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { kebabCase } from "moderndash";
import { concatMap, from, lastValueFrom, map, toArray } from "rxjs";
import * as yaml from "yaml";
import { kubernetesBackups } from "./application-backups.ts";

/**
 * Where the cluster's authentik proxy outpost runs, and where the
 * authentik-remote-cluster release that manages it lives. Must be excluded from
 * go-kube-downscaler (kube-system/go-kube-downscaler/helmrelease.yaml).
 */
const OUTPOST_NAMESPACE = "stargate-command";

export type KubernetesCluster = KubernetesClusterDefinition & { kubeConfig: string };

function equestriaDefinition(): KubernetesClusterDefinition {
  const entry = CLUSTERS.find(c => c.key === "equestria");
  if (entry?.type !== "kubernetes") throw new Error("clusters/equestria.yaml is missing or is not `type: kubernetes`");
  // Loader bookkeeping, not part of the definition the store used to return.
  const { sourceTitle: _sourceTitle, secretField: _secretField, ...definition } = entry;
  return definition;
}

export async function configureApplications(globals: GlobalResources) {
  const definition = equestriaDefinition();
  const kubeConfig = await awaitOutput(generateTailscaleKubeConfig(definition.key, globals.tailscaleDomain));
  const clusterDefinition: KubernetesCluster = { ...definition, kubeConfig };

  const outputs = await awaitOutput(globals.store.getSecretByTitle<AuthentikOutputs>("Authentik Outputs"));

  const _brand = new authentik.Brand(
    clusterDefinition.key,
    {
      domain: clusterDefinition.authentikDomain,
      brandingLogo: clusterDefinition.icon,
      brandingTitle: clusterDefinition.title,
      brandingFavicon: clusterDefinition.favicon ?? "",
      brandingDefaultFlowBackground: clusterDefinition.background ?? "/static/dist/assets/images/flow_background.jpg",
      flowAuthentication: outputs.flows.authenticationFlow,
      flowInvalidation: outputs.flows.providerLogoutFlow,
      flowUserSettings: outputs.flows.userSettingsFlow,
    },
    { deleteBeforeReplace: true },
  );

  // `iris.<root domain>`, re-homed onto equestria's instance when SGC was
  // decommissioned (docs/cluster-consolidation/22-decommission-sgc.md). `iris`
  // is not an SGC app: it is one of the estate's three public SSO names and it
  // answers from alpha-site. The asset URLs are the exact values
  // `clusters/sgc.yaml` carried, as literals, so the rendered brand stayed
  // byte-identical through the re-home and carries no dependency on a cluster
  // definition that no longer exists. Alpha Site declares the same
  // `authentikDomain` with different imagery, and adopting it would be a
  // visible change nobody asked for.
  const _irisBrand = new authentik.Brand(
    "iris",
    {
      domain: "iris.driscoll.tech",
      brandingLogo: "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg",
      brandingTitle: "Stargate Command",
      brandingFavicon: "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg",
      brandingDefaultFlowBackground: "https://wallpapercave.com/wp/wp10853006.jpg",
      flowAuthentication: outputs.flows.authenticationFlow,
      flowInvalidation: outputs.flows.providerLogoutFlow,
      flowUserSettings: outputs.flows.userSettingsFlow,
    },
    { deleteBeforeReplace: true },
  );

  await kubernetesApplications(globals, outputs, clusterDefinition);
}

async function kubernetesApplications(globals: GlobalResources, outputs: AuthentikOutputs, clusterDefinition: KubernetesCluster) {
  const provider = new pk8s.Provider(`${clusterDefinition.key}-provider`, {
    kubeconfig: clusterDefinition.kubeConfig,
  });

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(clusterDefinition.kubeConfig);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);

  // TODO: clear out old keys that are no longer used
  const customObjectApi = kubeConfig.makeApiClient(kubernetes.CustomObjectsApi);
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map(ns => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`, globals);

  const applications = await lastValueFrom(
    from(namespaceNames).pipe(
      concatMap(ns =>
        from(
          customObjectApi.listNamespacedCustomObject({
            group: "driscoll.dev",
            version: "v1",
            namespace: ns,
            plural: "applicationdefinitions",
          }),
        ),
      ),
      map(res => res as { items: ApplicationDefinitionSchema[] }),
      concatMap(res => from(res.items)),
      toArray(),
    ),
  );

  const applicationManager = new AuthentikApplicationManager({
    globals,
    outputs,
    clusterKey: clusterDefinition.key,
    cluster: clusterDefinition,
    async loadFromResource(application, kind, from) {
      let data: { [key: string]: string };
      switch (from.type) {
        case "configMap": {
          const configMap = await coreApi.readNamespacedConfigMap({
            name: from.name,
            namespace: application.metadata.namespace!,
          });
          data = configMap.data!;
          break;
        }
        case "secret": {
          const secret = await coreApi.readNamespacedSecret({
            name: from.name,
            namespace: application.metadata.namespace!,
          });
          data = secret.data!;
          break;
        }
        default:
          throw new Error(`Unknown from type ${from.type}`);
      }

      if (kind === "authentik") {
        return mapAuthentikResource(data.type as any, data);
      } else if (kind === "gatus") {
        return Object.values(data).map(mapGatusResource);
      } else {
        throw new Error(`Unknown application kind ${kind}`);
      }
    },
  });

  const createdApplications = pulumi
    .output(
      applications.map(app =>
        applicationManager.createApplication(app).apply(res => {
          if (res.provider && res.isProxy === false) {
            new pk8s.core.v1.Secret(
              `${kebabCase(app.metadata!.name)}-oidc-credentials`,
              {
                metadata: {
                  name: `${kebabCase(app.metadata!.name)}-oidc-credentials`,
                  namespace: app.metadata.namespace ?? clusterDefinition.key,
                },
                stringData: res.oidcCredentials.fields.apply(z => Object.fromEntries(Object.entries(z).map(([key, value]) => [key, value.value ?? ""]))),
              },
              {
                parent: applicationManager,
                provider,
                dependsOn: [res.provider],
              },
            );
          }
          return res;
        }),
      ),
    )
    .apply(apps => {
      return addUptimeGatus(
        `cluster-apps-${clusterDefinition.key}`,
        globals,
        {
          endpoints: applicationManager.applications
            .apply(apps => apps.flatMap(z => z.gatus))
            .apply(instances => {
              return instances.map(e => yaml.parse(yaml.stringify(e, { lineWidth: 0 })) as GatusDefinition);
            }),
        },
        applicationManager,
      ).apply(() => apps);
    });

  const outpostCredential = await outpostKubeConfig(coreApi, clusterDefinition);

  const serviceConnection = new authentik.ServiceConnectionKubernetes(clusterDefinition.key, {
    name: clusterDefinition.key,
    kubeconfig: outpostCredential,
    verifySsl: true,
  });
  // Both hostnames' providers. A tailnet twin that is not attached to the
  // outpost is a provider the outpost will not answer for, which is exactly the
  // 400 "no app for hostname" this pair exists to fix -- so it has to be
  // collected here and not just created.
  const proxyProviders = createdApplications.apply(apps =>
    apps
      .filter(z => z.isProxy)
      .flatMap(z => [z.provider, z.tailnetProvider])
      .filter(p => p !== undefined),
  );

  const _outpost = new authentik.Outpost(
    clusterDefinition.key,
    {
      serviceConnection: serviceConnection.serviceConnectionKubernetesId,
      type: "proxy",
      config: pulumi.jsonStringify(
        {
          authentik_host: pulumi.interpolate`https://${clusterDefinition.authentikDomain}/`,
          authentik_host_insecure: false,
          authentik_host_browser: `https://${clusterDefinition.authentikDomain}/`,
          // container_image: "ghcr.io/goauthentik/proxy:2025.8.4",
          // log_level: "trace",
          object_naming_template: `authentik-outpost`,
          kubernetes_replicas: 1,
          // stargate-command, not the cluster's app namespace. The app namespace
          // (`equestria`) is go-kube-downscaler's nightly shed list, and this
          // Deployment is created by authentik -- not Flux -- so it carried no
          // `downscaler/exclude` and was scaled to 0 every night 06:00-13:00 UTC.
          // Every forwardAuth route in the cluster (keep-list apps and
          // observability included) then timed out for seven hours. It belongs
          // with authentik itself in the Tier-1 namespace the downscaler excludes.
          kubernetes_namespace: OUTPOST_NAMESPACE,
          kubernetes_ingress_class_name: "internal",
          kubernetes_ingress_annotations: {
            "traefik.ingress.kubernetes.io/router.middlewares": "network-default-cors@kubernetescrd",
          },
          kubernetes_httproute_parent_refs: [
            {
              name: "internal",
              namespace: "network",
              kind: "Gateway",
            },
          ],
          kubernetes_httproute_annotations: {
            "traefik.ingress.kubernetes.io/router.middlewares": "network-default-cors@kubernetescrd",
          },
          kubernetes_ingress_secret_name: "",
        },
        undefined,
        2,
      ),
      protocolProviders: proxyProviders.apply(apps => apps.map(z => z.id.apply(parseFloat))),
    },
    { parent: applicationManager.outpostsComponent, deleteBeforeReplace: true },
  );
  const backupPlanOrchestrator = new BackupPlanOrchestrator("backup-plan-orchestrator", globals);

  await awaitOutput(
    pulumi.all([kubernetesBackups(globals, backupPlanOrchestrator, clusterDefinition)]).apply(() => {
      pulumi.log.info("Finalizing backup plan manager with all backup jobs created", backupPlanOrchestrator);
      return backupPlanOrchestrator.savePlan(`${clusterDefinition.title} Backup Plan`);
    }),
  );

  return {};
}

/**
 * The kubeconfig Authentik's Kubernetes ServiceConnection authenticates with,
 * built from the credential in the target cluster itself.
 *
 * This used to be a 1Password item: two PushSecrets in each cluster pushed the
 * ServiceAccount token and CA there, and Pulumi read them back by title
 * (`<key>-authentik-outpost`) through `VaultStore.getKubeConfig`. Phase 10 of
 * the 1Password->OpenBao migration (docs/openbao-migration/PLAN.md
 * SS-G row 10) deletes that hop rather than moving it to OpenBao:
 *
 *   - Of the five fields the item carried, only `token` and `ca.crt` were ever
 *     secrets. `sa`, `cluster` and `cluster_api` are config this function
 *     already has -- they were being laundered through a secret store to get
 *     from the cluster to Pulumi.
 *   - This function is ALREADY talking to that cluster: `coreApi` above lists
 *     namespaces and ApplicationDefinitions over the tailnet kubeproxy, and the
 *     `tailnet-cluster-ops` ClusterRole it is impersonated as already grants
 *     `secrets: get`. So reading the Secret costs no new provider, no new
 *     network path and no new RBAC.
 *   - Pushing to OpenBao instead would have meant widening the read-only
 *     `eso-<cluster>` policy to allow writes, making every consuming cluster a
 *     writer of the shared store, and would have kept a second copy of the
 *     credential forever. This keeps zero copies in either store.
 */
async function outpostKubeConfig(coreApi: kubernetes.CoreV1Api, clusterDefinition: KubernetesCluster) {
  // Created by the authentik-remote-cluster HelmRelease in the target cluster,
  // in the outpost's namespace (kubernetes/apps/stargate-command/authentik-remote-cluster/).
  // The chart's Role is namespaced, so the ServiceAccount can only manage an
  // outpost in the namespace the release itself lives in -- the two move together.
  const secretName = "authentik-remote-cluster";
  const secret = await coreApi.readNamespacedSecret({ name: secretName, namespace: OUTPOST_NAMESPACE });

  const field = (key: string) => {
    const value = secret.data?.[key];
    if (!value) throw new Error(`${clusterDefinition.key}/${secretName} has no '${key}' -- the ServiceAccount token Secret is missing or not yet populated`);
    return Buffer.from(value, "base64").toString("utf8");
  };

  // `sa` is the ServiceAccount this token belongs to; it was a literal in the
  // pushed Secret too. `cluster_api` was `apiserver.${CLUSTER_DOMAIN}`, which is
  // this cluster's rootDomain -- verified against both live values before the
  // switch (apiserver.equestria.<root domain> / apiserver.sgc.<root domain>).
  const kubeConfig = pulumi.jsonStringify({
    kind: "Config",
    apiVersion: "v1",
    clusters: [
      {
        cluster: {
          // The pushed item stored the CA verbatim and re-encoded it here, so
          // the b64 of the raw PEM is the byte-identical result.
          "certificate-authority-data": Buffer.from(field("ca.crt"), "utf8").toString("base64"),
          server: `https://apiserver.${clusterDefinition.rootDomain}:6443`,
        },
        name: clusterDefinition.key,
      },
    ],
    contexts: [{ context: { cluster: clusterDefinition.key, user: secretName }, name: clusterDefinition.key }],
    "current-context": clusterDefinition.key,
    // The token came from a Concealed 1Password field, so `getSecretItem`
    // marked it secret() and the whole kubeconfig inherited that. Reading the
    // API directly loses the marker, and an unmarked kubeconfig writes a
    // cluster-scoped token into Pulumi state in the clear -- with no symptom
    // until someone runs `pulumi stack export`. Mark it here.
    users: [{ name: secretName, user: { token: pulumi.secret(field("token")) } }],
  });

  return kubeConfig;
}

function mapAuthentikResource<T extends keyof AuthentikDefinition, K extends keyof NonNullable<AuthentikDefinition[T]>>(type: T, resource: { [V in K]: string }): NonNullable<AuthentikDefinition[T]> {
  if (type === "proxy") {
    const proxyResource = resource as {
      [V in keyof NonNullable<AuthentikDefinition["proxy"]>]: string;
    };

    return (<NonNullable<AuthentikDefinition["proxy"]>>{
      externalHost: proxyResource.externalHost,
      internalHost: proxyResource.internalHost,
      internalHostSslValidation: proxyResource.internalHostSslValidation === "true",
      mode: proxyResource.mode,
      basicAuthEnabled: proxyResource.basicAuthEnabled === "true",
      basicAuthUsernameAttribute: proxyResource.basicAuthUsernameAttribute,
      basicAuthPasswordAttribute: proxyResource.basicAuthPasswordAttribute,
      cookieDomain: proxyResource.cookieDomain,
      interceptHeaderAuth: proxyResource.interceptHeaderAuth === "true",
      authorizationFlow: proxyResource.authorizationFlow,
      authenticationFlow: proxyResource.authenticationFlow,
      invalidationFlow: proxyResource.invalidationFlow,
      accessTokenValidity: proxyResource.accessTokenValidity,
      refreshTokenValidity: proxyResource.refreshTokenValidity,
      jwksSources: proxyResource.jwksSources ? proxyResource.jwksSources.split(",") : undefined,
      jwtFederationProviders: proxyResource.jwtFederationProviders ? proxyResource.jwtFederationProviders.split(",") : undefined,
      jwtFederationSources: proxyResource.jwtFederationSources ? proxyResource.jwtFederationSources.split(",") : undefined,
      name: proxyResource.name,
      propertyMappings: proxyResource.propertyMappings ? proxyResource.propertyMappings.split(",") : undefined,
      skipPathRegex: proxyResource.skipPathRegex,
    }) as any;
  }

  if (type === "oauth2") {
    const oauth2Resource = resource as {
      [V in keyof NonNullable<AuthentikDefinition["oauth2"]>]: string;
    };

    return (<NonNullable<AuthentikDefinition["oauth2"]>>{
      authorizationFlow: oauth2Resource.authorizationFlow,
      authenticationFlow: oauth2Resource.authenticationFlow,
      invalidationFlow: oauth2Resource.invalidationFlow,
      clientType: oauth2Resource.clientType,
      clientId: oauth2Resource.clientId,
      clientSecret: oauth2Resource.clientSecret,
      signingKey: oauth2Resource.signingKey,
      encryptionKey: oauth2Resource.encryptionKey,
      includeClaimsInIdToken: oauth2Resource.includeClaimsInIdToken === "true",
      issuerMode: oauth2Resource.issuerMode,
      accessCodeValidity: oauth2Resource.accessCodeValidity,
      accessTokenValidity: oauth2Resource.accessTokenValidity,
      refreshTokenValidity: oauth2Resource.refreshTokenValidity,
      logoutUri: oauth2Resource.logoutUri,
      jwksSources: oauth2Resource.jwksSources ? oauth2Resource.jwksSources.split(",") : undefined,
      jwtFederationProviders: oauth2Resource.jwtFederationProviders ? oauth2Resource.jwtFederationProviders.split(",") : undefined,
      jwtFederationSources: oauth2Resource.jwtFederationSources ? oauth2Resource.jwtFederationSources.split(",") : undefined,
      grantTypes: oauth2Resource.grantTypes ? oauth2Resource.grantTypes.split(",") : ["implicit", "authorization_code", "refresh_token", "client_credentials"],
      subMode: oauth2Resource.subMode,
      allowedRedirectUris: oauth2Resource.allowedRedirectUris
        ? oauth2Resource.allowedRedirectUris.split(",").map(uri => {
            const [matching_mode, url] = uri.split("|");
            return {
              matching_mode: matching_mode as "strict" | "wildcard" | "regex",
              url,
            };
          })
        : undefined,
      propertyMappings: oauth2Resource.propertyMappings ? oauth2Resource.propertyMappings.split(",") : undefined,
    }) as any;
  }

  throw new Error(`Unknown authentik resource type ${type}`);
}

function mapGatusResource(rawResource: string): GatusDefinition {
  const resource = yaml.parse(Buffer.from(rawResource, "base64").toString("utf-8"));
  return {
    name: resource.name,
    url: resource.url,
    "disable-monitoring-lock": resource["disable-monitoring-lock"] === "true",
    alerts: resource.alerts ? JSON.parse(resource.alerts) : [],
    body: resource.body,
    client: resource.client ? JSON.parse(resource.client) : {},
    conditions: resource.conditions ? JSON.parse(resource.conditions) : [],
    dns: resource.dns ? JSON.parse(resource.dns) : {},
    graphql: resource.graphql ? JSON.parse(resource.graphql) : {},
    group: resource.group,
    headers: resource.headers ? JSON.parse(resource.headers) : {},
    interval: resource.interval,
    method: resource.method as GatusDefinition["method"],
    ssh: resource.ssh ? JSON.parse(resource.ssh) : {},
    timeout: resource.timeout,
    ui: resource.ui ? JSON.parse(resource.ui) : {},
  };
}

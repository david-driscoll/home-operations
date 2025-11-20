import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { AuthentikApplicationManager, AuthentikOutputs } from "@components/authentik.ts";
import { GlobalResources, KubernetesClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { base64encodeOutput } from "@pulumi/std";
import * as kubernetes from "@kubernetes/client-node";
import { addUptimeGatus, awaitOutput, BackupTask, copyFileToRemote, toGatusKey } from "@components/helpers.ts";
import { from, map, mergeMap, lastValueFrom, toArray, concatMap } from "rxjs";
import { ApplicationDefinitionSchema, AuthentikDefinition, ExternalEndpoint, GatusDefinition } from "@openapi/application-definition.js";
import * as yaml from "yaml";
import * as jsondiffpatch from "jsondiffpatch";
import * as jsonpatch from "jsondiffpatch/formatters/jsonpatch";
import { group, kebabCase } from "moderndash";

const op = new OPClient();

export async function kubernetesApplications(globals: GlobalResources, outputs: AuthentikOutputs, clusterDefinition: KubernetesClusterDefinition) {
  const crdCredential = pulumi.output(op.getItemByTitle(`${clusterDefinition.key}-definition-crds`));
  const kubeConfigJson = await awaitOutput(generateKubeConfig(crdCredential));

  const kubeConfig = new kubernetes.KubeConfig();
  kubeConfig.loadFromString(kubeConfigJson);

  const coreApi = kubeConfig.makeApiClient(kubernetes.CoreV1Api);

  let currentGatusValues: Record<string, string> = {};

  // TODO: clear out old keys that are no longer used
  const customObjectApi = kubeConfig.makeApiClient(kubernetes.CustomObjectsApi);
  const namespaceList = await coreApi.listNamespace();
  const namespaceNames = namespaceList.items.map((ns) => ns.metadata!.name!);

  pulumi.log.info(`Found namespaces: ${namespaceNames.join(", ")}`);

  const applications = await lastValueFrom(
    from(namespaceNames).pipe(
      concatMap((ns) =>
        from(
          customObjectApi.listNamespacedCustomObject({
            group: "driscoll.dev",
            version: "v1",
            namespace: ns,
            plural: "applicationdefinitions",
          })
        )
      ),
      map((res) => res as { items: ApplicationDefinitionSchema[] }),
      concatMap((res) => from(res.items)),
      toArray()
    )
  );

  const applicationManager = new AuthentikApplicationManager({
    globals,
    outputs,
    authentikCredential: "Authentik Outputs",
    cluster: clusterDefinition,
    async loadFromResource(application, kind, from) {
      let data: { [key: string]: string };
      switch (from.type) {
        case "configMap":
          const configMap = await coreApi.readNamespacedConfigMap({ name: from.name, namespace: application.metadata.namespace! });
          data = configMap.data!;
          break;
        case "secret":
          const secret = await coreApi.readNamespacedSecret({ name: from.name, namespace: application.metadata.namespace! });
          data = secret.data!;
          break;
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
    async createGatus(name, definition, gatusDefinitions) {
      currentGatusValues[`${name}.yaml`] = yaml.stringify({ endpoints: gatusDefinitions });
    },
  });

  for (const app of applications) {
    await applicationManager.createApplication(app);
  }

  const volsyncBackupJobs = pulumi
    .output(
      lastValueFrom(
        from(namespaceNames).pipe(
          concatMap((ns) =>
            from(
              coreApi.listNamespacedSecret({
                namespace: ns,
                labelSelector: "volsync=true",
              })
            )
          ),
          map((result) => result.items.map((s) => s.data?.RESTIC_REPOSITORY).filter((z): z is string => !!z)),
          mergeMap((lists) => from(lists)),
          map((item) => Buffer.from(item, "base64").toString("utf-8").split("/").pop()!),
          toArray()
        )
      )
    )
    .apply((jobs) => Array.from(new Set(jobs)))
    .apply((jobs) => {
      pulumi.log.info(`Found VolSync backup jobs: ${jobs.join(", ")}`);
      return jobs;
    });

  const celestiaJobs = volsyncBackupJobs.apply((jobs) =>
    jobs.map((job) => {
      const title = `Backup ${clusterDefinition.title} Volsync ${job}`;
      const groupName = `Jobs: Celestia`;
      const token = toGatusKey(groupName, title);
      return copyFileToRemote(`${clusterDefinition.key}-celestia-backup-${job}`, {
        content: pulumi.jsonStringify({
          name: title,
          schedule: "0 10 * * *", // 10 am daily
          sourceType: "local",
          source: pulumi.interpolate`/spike/backup/${clusterDefinition.key}/volsync/${job}`,
          destinationType: "local",
          destination: pulumi.interpolate`/data/backup/${clusterDefinition.key}/volsync/${job}`,
          token: token,
        } as BackupTask),
        remotePath: pulumi.interpolate`/opt/stacks/backups/jobs/${clusterDefinition.key}-${job}-sync.json`,
        connection: globals.localBackupServerConnection,
        parent: applicationManager,
      }).apply(
        (r) =>
          ({
            enabled: true,
            token: token,
            name: title,
            group: groupName,
            heartbeat: {
              interval: "25h",
            },
          } as ExternalEndpoint)
      );
    })
  );

  const lunaJobs = volsyncBackupJobs.apply((jobs) =>
    jobs.map((job) => {
      const title = `Replicate ${clusterDefinition.title} Volsync ${job}`;
      const groupName = `Jobs: Luna`;
      const token = toGatusKey(groupName, title);
      return copyFileToRemote(`${clusterDefinition.key}-luna-replica-${job}`, {
        content: pulumi.jsonStringify({
          name: title,
          schedule: "0 3 * * *", // 3 am daily
          sourceType: "sftp",
          source: pulumi.interpolate`${globals.localBackupServerConnection.host}/${clusterDefinition.key}/volsync/${job}`,
          destinationType: "local",
          destination: pulumi.interpolate`/data/backup/${clusterDefinition.key}/volsync/${job}`,
          token: token,
        }),
        remotePath: pulumi.interpolate`/opt/stacks/backups/jobs/${clusterDefinition.key}-${job}-replica.json`,
        connection: globals.remoteBackupServerConnection,
        parent: applicationManager,
      }).apply(
        (r) =>
          ({
            enabled: true,
            token: token,
            name: title,
            group: groupName,
            heartbeat: {
              interval: "25h",
            },
          } as ExternalEndpoint)
      );
    })
  );

  addUptimeGatus(
    `${clusterDefinition.key}`,
    globals,
    {
      endpoints: pulumi.output(applicationManager.uptimeInstances).apply((instances) =>
        instances
          .map((e) => yaml.parse(yaml.stringify(e, { lineWidth: 0 })) as GatusDefinition)
          .map((e) => {
            e.group = e.group === "System" ? `Cluster: ${clusterDefinition.title}` : e.group;
            return e;
          })
      ),
      "external-endpoints": pulumi.all([celestiaJobs, lunaJobs]).apply((jobs) => jobs.flat()),
    },
    applicationManager
  );

  const outpostCredential = pulumi.output(op.getItemByTitle(`${clusterDefinition.key}-authentik-outpost`));

  const serviceConnection = new authentik.ServiceConnectionKubernetes(clusterDefinition.key, {
    name: clusterDefinition.key,
    kubeconfig: generateKubeConfig(outpostCredential),
    verifySsl: true,
  });

  const outpost = new authentik.Outpost(
    clusterDefinition.key,
    {
      serviceConnection: serviceConnection.serviceConnectionKubernetesId,
      type: "proxy",
      name: `Outpost for ${clusterDefinition.title}`,
      config: pulumi.jsonStringify({
        authentik_host: pulumi.interpolate`https://${clusterDefinition.authentikDomain}/`,
        authentik_host_insecure: false,
        // authentik_host_browser: `https://${clusterDefinition.authentikDomain}/`,
        log_level: "debug",
        object_naming_template: `authentik-outpost-%(name)s`,
        kubernetes_replicas: 2,
        kubernetes_namespace: clusterDefinition.key,
        kubernetes_ingress_class_name: "internal",
        kubernetes_httproute_parent_refs: "internal",
        kubernetes_ingress_secret_name: "",
      }),
      protocolProviders: applicationManager.proxyProviders,
    },
    { parent: applicationManager.outpostsComponent, deleteBeforeReplace: true }
  );

  return {};
}

function generateKubeConfig(credential: pulumi.Output<ReturnType<OPClient["mapItem"]>>) {
  return pulumi.interpolate`{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "certificate-authority-data": "${credential.fields.certificate.apply((z) => base64encodeOutput({ input: z.value! }).result)}",
        "server": "https://${credential.fields.cluster_api.value}:6443"
      },
      "name": "${credential.fields.cluster.value}"
    }
  ],
  "contexts": [
    {
      "context": {
        "cluster": "${credential.fields.cluster.value}",
        "user": "${credential.fields.sa.value}"
      },
      "name": "${credential.fields.cluster.value}"
    }
  ],
  "current-context": "${credential.fields.cluster.value}",
  "users": [
    {
      "name": "${credential.fields.sa.value}",
      "user": {
        "token": "${credential.fields.token.value}"
      }
    }
  ]
}`;
}

function mapAuthentikResource<T extends keyof AuthentikDefinition, K extends keyof NonNullable<AuthentikDefinition[T]>>(type: T, resource: { [V in K]: string }): NonNullable<AuthentikDefinition[T]> {
  if (type === "proxy") {
    const proxyResource = resource as { [V in keyof NonNullable<AuthentikDefinition["proxy"]>]: string };

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
    const oauth2Resource = resource as { [V in keyof NonNullable<AuthentikDefinition["oauth2"]>]: string };

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
      backchannelLogoutUri: oauth2Resource.backchannelLogoutUri,
      jwksSources: oauth2Resource.jwksSources ? oauth2Resource.jwksSources.split(",") : undefined,
      jwtFederationProviders: oauth2Resource.jwtFederationProviders ? oauth2Resource.jwtFederationProviders.split(",") : undefined,
      jwtFederationSources: oauth2Resource.jwtFederationSources ? oauth2Resource.jwtFederationSources.split(",") : undefined,
      subMode: oauth2Resource.subMode,
      allowedRedirectUris: oauth2Resource.allowedRedirectUris
        ? oauth2Resource.allowedRedirectUris.split(",").map((uri) => {
            const [matching_mode, url] = uri.split("|");
            return { matching_mode: matching_mode as "strict" | "wildcard" | "regex", url };
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

import { GlobalResources } from "@components/globals.ts";
import { ClusterDefinition, DockgeClusterDefinition, DockgeLxcDefinition, KubernetesClusterDefinition, Meta, ProxmoxBackupServerLxcDefinition } from "./interfaces.ts";
import { CategoryEnum, OPClient, TypeEnum } from "./op.ts";
import { all, Input, interpolate, jsonStringify, log, output, Output, secret, Unwrap } from "@pulumi/pulumi";
const op = new OPClient();

export * from "./interfaces.ts";

type OnePasswordItem = Unwrap<ReturnType<OPClient["mapItem"]>>;
export class VaultStore {
  constructor(private readonly globals: GlobalResources) {}
  public getDockgeInstances() {
    return output(op.findItemsByTag("dockge")).apply((items) => all(items.map(getSecretItem<DockgeLxcDefinition>)));
  }
  public getCluster(title: string) {
    return output(op.getItemByTitle(title)).apply(getSecretItem<ClusterDefinition>);
  }

  public getAllClusters() {
    return output(op.findItemsByTag("cluster-definition")).apply((items) => all(items.map(getSecretItem<ClusterDefinition>)));
  }

  public getDockerClusters() {
    return this.getAllClusters().apply((items) => items.filter((item) => item.type === "dockge"));
  }

  public getBackupPlans<T>() {
    return output(op.findItemsByTag("backup-plan"))
      .apply((items) => all(items.map(getSecretItem<{ plan: string }>)).apply((items) => items.map((item) => JSON.parse(item.plan) as { plans: T[] })))
      .apply((plans) => plans.flat());
  }

  public getTailscaleExports() {
    return output(op.findItemsByTag("tailscale-export"))
      .apply((items) => all(items.map(getSecretItem<{ [key: string]: { ip: string; internalIp?: string; nodeType: "dockge" | "proxmox" | "pbs" } }>)))
      .apply((items) => {
        return items.map((item) => {
          return {
            name: item.name as unknown as string,
            services: item.services ? (JSON.parse(item.services as unknown as string) as string[]) : [],
            hosts: Object.entries(item)
              .filter(([key, value]) => typeof value === "object" && !Array.isArray(value) && value !== null && "ip" in value)
              .map(([_, value]) => value as { ip: string; internalIp?: string; nodeType: "dockge" | "proxmox" | "pbs" }),
          };
        });
      });
  }

  public getKubeConfig(title: string) {
    return output(op.getItemByTitle(title)).apply(generateKubeConfig);
  }

  public getKubernetesClusters(): Output<(KubernetesClusterDefinition & { kubeConfig: string })[]> {
    return this.getAllClusters()
      .apply((items) => items.filter((item) => item.type === "kubernetes"))
      .apply((clusters) => {
        return all(
          clusters.map((clusterDefinition) => ({
            ...clusterDefinition,
            kubeConfig: output(generateTailscaleKubeConfig(clusterDefinition.key, this.globals.tailscaleDomain)),
          })),
        );
      });
  }

  public getKubernetesCluster(title: string): Output<KubernetesClusterDefinition & { kubeConfig: string }> {
    return this.getCluster(title).apply((cluster) =>
      output(generateTailscaleKubeConfig(cluster.key, this.globals.tailscaleDomain)).apply((kubeConfig) => ({
        ...(cluster as KubernetesClusterDefinition),
        kubeConfig,
      })),
    );
  }

  public proxmoxBackupServers(withTag: string = "pbs") {
    return output(op.findItemsByTag(withTag)).apply((items) => all(items.map((item) => createProxmoxBackupServerDefinition(op, item))));
  }

  public getSecretByTitle<T>(title: string) {
    return output(op.getItemByTitle(title)).apply(getSecretItem<T>);
  }

  private readonly vaultRegex = /op\:\/\/Eris\/([\w| -]+)\/([\w| -]+)/g;
  public replaceOnePasswordPlaceholders(value: Input<string>): Output<string> {
    return output(value)
      .apply((v) => Array.from(v.matchAll(this.vaultRegex)))
      .apply((matches) =>
        all(
          matches
            .map((match) => match.slice(1) as [string, string])
            .map(([itemTitle, fieldName]) => this.getSecretByTitle<{ [key: string]: string | undefined }>(itemTitle).apply((item) => ({ itemTitle, fieldName, fieldValue: item[fieldName] }) as const)),
        ),
      )
      .apply((matches) => {
        const items = new Map();
        for (const { fieldName, fieldValue, itemTitle } of matches) {
          if (items.has(`op://Eris/${itemTitle}/${fieldName}`)) {
            continue;
          }
          if (!fieldValue) {
            log.error(`Field ${fieldName} not found in 1Password item ${itemTitle}`);
          }
          items.set(`op://Eris/${itemTitle}/${fieldName}`, fieldValue);
        }
        return output(value).apply((v) => v.replace(this.vaultRegex, (fullMatch) => items.get(fullMatch) || fullMatch));
      });
  }
}

function getSecretItem<T = { urls: { href: string; label?: string }[] }>(item: OnePasswordItem): Output<Unwrap<T & Meta>> {
  const result: [string, any][] = [["meta", output({ title: item.title, category: item.category, tags: item.tags ?? [], urls: item.urls?.map((z) => ({ href: z.href, label: z.label })) ?? [] })]];
  for (const [key, { value, type }] of Object.entries(item.fields)) {
    result.push([key, type === TypeEnum.Concealed ? secret(value) : output(value)] as const);
  }
  for (const [sectionKey, section] of Object.entries(item.sections)) {
    const sectionResult = [];

    for (const [key, { value, type }] of Object.entries(section.fields)) {
      sectionResult.push([key, type === TypeEnum.Concealed ? secret(value) : output(value)] as const);
    }
    result.push([sectionKey, Object.fromEntries(sectionResult)] as const);
  }
  return output(Object.fromEntries(result) as T & Meta);
}

export interface VaultStoreItem {}

function generateTailscaleKubeConfig(clusterKey: string, tailscaleDomain: Output<string>) {
  return jsonStringify({
    kind: "Config",
    apiVersion: "v1",
    clusters: [
      {
        cluster: {
          server: interpolate`https://${clusterKey}-kubeproxy.${tailscaleDomain}`,
        },
        name: clusterKey,
      },
    ],
    contexts: [
      {
        context: {
          cluster: clusterKey,
          user: clusterKey,
        },
        name: clusterKey,
      },
    ],
    "current-context": clusterKey,
    users: [
      {
        name: clusterKey,
        user: {},
      },
    ],
  });
}

function generateKubeConfig(item: OnePasswordItem) {
  const credential = getSecretItem<{ sa: string; cluster: string; cluster_api: string; token: string; certificate: string }>(item);
  return interpolate`{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "certificate-authority-data": "${credential.certificate.apply((c) => Buffer.from(c, "utf8").toString("base64"))}",
        "server": "https://${credential.cluster_api}:6443"
      },
      "name": "${credential.cluster}"
    }
  ],
  "contexts": [
    {
      "context": {
        "cluster": "${credential.cluster}",
        "user": "${credential.sa}"
      },
      "name": "${credential.cluster}"
    }
  ],
  "current-context": "${credential.cluster}",
  "users": [
    {
      "name": "${credential.sa}",
      "user": {
        "token": "${credential.token}"
      }
    }
  ]
}`;
}

function createProxmoxBackupServerDefinition(client: OPClient, item: OnePasswordItem): Output<ProxmoxBackupServerLxcDefinition> {
  const backupServerDefinition = getSecretItem<Exclude<ProxmoxBackupServerLxcDefinition, "dockge" | "cluster">>(item);
  const dockge = output(client.getItemByTitle(item.fields.dockge.value!)).apply(getSecretItem<DockgeLxcDefinition>);
  const cluster = output(client.getItemByTitle(item.fields.cluster.value!)).apply(getSecretItem<ClusterDefinition>) as Output<DockgeClusterDefinition>;

  return all([backupServerDefinition, dockge, cluster]).apply(([backupServerDefinition, dockge, cluster]) =>
    output({
      ...backupServerDefinition,
      dockge: dockge,
      cluster: cluster,
    }),
  );
}

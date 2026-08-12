import { all, type Input, interpolate, jsonStringify, log, type Output, output, secret, type Unwrap } from "@pulumi/pulumi";
import { OPClient, TypeEnum } from "../op.ts";
import type { ClusterDefinition, DockgeClusterDefinition, DockgeLxcDefinition, KubernetesClusterDefinition, Meta, ProxmoxBackupServerLxcDefinition } from "./interfaces.ts";
import { SecretRefResolver } from "./refs.ts";

/**
 * Lazy, not module-scope. `new OPClient()` constructs a 1Password Connect
 * client eagerly and throws without CONNECT_HOST/CONNECT_TOKEN, so importing
 * this module at all used to demand 1Password credentials — including from
 * `BaoStore`, which subclasses `VaultStore` and may never touch 1Password, and
 * from unit tests, which never should.
 */
let _op: OPClient | undefined;
function op(): OPClient {
  return (_op ??= new OPClient());
}

export * from "./interfaces.ts";

type OnePasswordItem = Unwrap<ReturnType<OPClient["mapItem"]>>;
export class VaultStore {
  private _tailscaleDomain?: Output<string>;
  /**
   * Lazy, not constructor-assigned. `BaoStore extends VaultStore` and overrides
   * `getSecretByTitle`, so reading a secret from the base constructor would
   * dispatch into the subclass BEFORE its own fields (the client, the cache)
   * are initialised — class fields run after `super()` returns — and throw on
   * an undefined client. Nothing else here reads a secret at construction time;
   * keep it that way.
   */
  public get tailscaleDomain(): Output<string> {
    this._tailscaleDomain ??= this.getSecretByTitle<{ hostname: string }>("Tailscale Terraform OAuth Client").apply(z => z.hostname);
    return this._tailscaleDomain;
  }
  public getDockgeInstances() {
    return output(op().findItemsByTag("dockge")).apply(items => all(items.map(getSecretItem<DockgeLxcDefinition>)));
  }
  public getCluster(title: string) {
    return output(op().getItemByTitle(title)).apply(getSecretItem<ClusterDefinition>);
  }

  public getAllClusters() {
    return output(op().findItemsByTag("cluster-definition")).apply(items => all(items.map(getSecretItem<ClusterDefinition>)));
  }

  public getDockerClusters() {
    return this.getAllClusters().apply(items => items.filter(item => item.type === "dockge"));
  }

  public getBackupPlans<T>() {
    return output(op().findItemsByTag("backup-plan"))
      .apply(items => all(items.map(getSecretItem<{ plan: string }>)))
      .apply(items => shapeBackupPlans<T>(items));
  }

  public getTailscaleExports() {
    return output(op().findItemsByTag("tailscale-export"))
      .apply(items =>
        all(
          items.map(
            getSecretItem<{
              [key: string]: {
                externalIp: string;
                internalIp: string;
                mac: string;
                nodeType: "dockge" | "proxmox" | "pbs" | "truenas";
              };
            }>,
          ),
        ),
      )
      .apply(shapeTailscaleExports);
  }

  public getKubeConfig(title: string) {
    return output(op().getItemByTitle(title)).apply(generateKubeConfig);
  }

  public getKubernetesClusters(): Output<(KubernetesClusterDefinition & { kubeConfig: string })[]> {
    return this.getAllClusters()
      .apply(items => items.filter(item => item.type === "kubernetes"))
      .apply(clusters => {
        return all(
          clusters.map(clusterDefinition => ({
            ...clusterDefinition,
            kubeConfig: output(generateTailscaleKubeConfig(clusterDefinition.key, this.tailscaleDomain)),
          })),
        );
      });
  }

  public getKubernetesCluster(title: string): Output<KubernetesClusterDefinition & { kubeConfig: string }> {
    return this.getCluster(title).apply(cluster =>
      output(generateTailscaleKubeConfig(cluster.key, this.tailscaleDomain)).apply(kubeConfig => ({
        ...(cluster as KubernetesClusterDefinition),
        kubeConfig,
      })),
    );
  }

  public proxmoxBackupServers(withTag: string = "pbs") {
    return output(op().findItemsByTag(withTag)).apply(items => all(items.map(item => createProxmoxBackupServerDefinition(op(), item))));
  }

  public getSecretByTitle<T>(title: string) {
    return this.getOnePasswordItemByTitle<T>(title);
  }

  /**
   * Read from 1Password specifically, bypassing any subclass override.
   *
   * `BaoStore` overrides `getSecretByTitle`, so anything below that calls
   * `this.getSecretByTitle` dispatches to OpenBao — including the `op://Eris/…`
   * placeholder resolver, whose reference syntax names 1Password by
   * construction. That mattered immediately: `op://Eris/OpenBao Alpha Site
   * Static Unseal/…` is seal-chain material INVENTORY §2 forbids from ever
   * entering OpenBao, so resolving it there is not a lookup failure to paper
   * over, it is a category error.
   */
  protected getOnePasswordItemByTitle<T>(title: string) {
    return output(op().getItemByTitle(title)).apply(getSecretItem<T>);
  }

  /**
   * `ref+openbao://secrets/<path>#/<field>` resolution (PLAN §D.1), the
   * OpenBao counterpart of `replaceOnePasswordPlaceholders` below. Both run
   * during the transition: each syntax names its store by construction, so
   * chaining them cannot cross-resolve. `op://` disappears file by file; when
   * no file carries it, the 1Password resolver below goes with it (that is the
   * `dynamic/1password` retirement slice, deliberately last).
   *
   * On the base class rather than per-store because the reference itself picks
   * the backend — `BAO_STORE_READS` has no bearing here, exactly as it has
   * none on `op://`.
   */
  private readonly refResolver = new SecretRefResolver();
  public resolveSecretReferences(value: Input<string>): Output<string> {
    return this.refResolver.resolve(value);
  }

  private readonly vaultRegex = /op:\/\/Eris\/([\w| -]+)\/([\w| -]+)/g;
  public replaceOnePasswordPlaceholders(value: Input<string>): Output<string> {
    return output(value)
      .apply(v => Array.from(v.matchAll(this.vaultRegex)))
      .apply(matches =>
        all(
          matches
            .map(match => match.slice(1) as [string, string])
            .map(([itemTitle, fieldName]) =>
              this.getOnePasswordItemByTitle<{ [key: string]: string | undefined }>(itemTitle).apply(
                item =>
                  ({
                    itemTitle,
                    fieldName,
                    fieldValue: item[fieldName],
                  }) as const,
              ),
            ),
        ),
      )
      .apply(matches => {
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
        return output(value).apply(v => v.replace(this.vaultRegex, fullMatch => items.get(fullMatch) || fullMatch));
      });
  }
}

/**
 * Item-shaped backup plans → the flat plan list the directors consume.
 *
 * Shared between `VaultStore` (items found by `tag:backup-plan`) and
 * `BaoStore` (paths listed under `clusters/_inventory/*backup-plan`) for the
 * same reason as `shapeTailscaleExports` below: one transform, so the stores
 * can only differ in data.
 */
export function shapeBackupPlans<T>(items: { plan: string }[]): T[] {
  return items.map(item => JSON.parse(item.plan) as { plans: T[] }).flatMap(z => z.plans);
}

/**
 * Item-shaped tailscale exports → the object every consumer reads.
 *
 * Shared between `VaultStore` (items found by `tag:tailscale-export`) and
 * `BaoStore` (paths listed under `clusters/_inventory/tailscale-export-*`) so
 * the two stores cannot drift in the TRANSFORM — the parity script compares the
 * data, this function being singular is what makes the shaping identical.
 */
export function shapeTailscaleExports(
  items: {
    [key: string]: unknown;
  }[],
): {
  name: string;
  services: string[];
  hosts: { name: string; externalIp: string; internalIp: string; mac: string; nodeType: "dockge" | "proxmox" | "pbs" | "truenas" }[];
}[] {
  // Sorted at both levels — the exported node name drives ACL tests/grant dsts, and the
  // 1Password item title it is sorted by upstream can diverge from it.
  return items
    .map(item => {
      return {
        name: item.name as string,
        services: item.services ? (JSON.parse(item.services as string) as string[]) : [],
        hosts: Object.entries(item)
          .filter(([_key, value]) => typeof value === "object" && !Array.isArray(value) && value !== null && ("externalIp" in value || "ip" in value))
          .map(
            // `ip` fallback tolerates items written before the externalIp rename;
            // safe to drop once every exporting stack has redeployed.
            ([key, value]) =>
              ({ name: key, ...value, externalIp: (value as { externalIp?: string; ip?: string }).externalIp ?? (value as { ip?: string }).ip }) as {
                name: string;
                externalIp: string;
                internalIp: string;
                mac: string;
                nodeType: "dockge" | "proxmox" | "pbs" | "truenas";
              },
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSecretItem<T = { urls: { href: string; label?: string }[] }>(item: Pick<OnePasswordItem, "title" | "category" | "tags" | "urls" | "fields" | "files" | "sections">): Output<Unwrap<T & Meta>> {
  const result: [string, any][] = [
    [
      "meta",
      output({
        title: item.title,
        category: item.category,
        tags: item.tags ?? [],
        urls: item.urls?.map(z => ({ href: z.href, label: z.label })) ?? [],
      }),
    ],
  ];
  for (const [key, { value, type }] of Object.entries(item.fields)) {
    result.push([key, type === TypeEnum.Concealed ? secret(value) : output(value)] as const);
  }
  for (const [key, { content }] of Object.entries(item.files ?? {})) {
    result.push([key, secret(content)]);
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

export type VaultStoreItem = object;

function generateTailscaleKubeConfig(clusterKey: string, tailscaleDomain: Input<string>) {
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
  const credential = getSecretItem<{
    sa: string;
    cluster: string;
    cluster_api: string;
    token: string;
    certificate: string;
  }>(item);
  return interpolate`{
  "kind": "Config",
  "apiVersion": "v1",
  "clusters": [
    {
      "cluster": {
        "certificate-authority-data": "${credential.certificate.apply(c => Buffer.from(c, "utf8").toString("base64"))}",
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

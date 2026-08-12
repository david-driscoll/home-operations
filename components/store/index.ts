import { all, type Input, interpolate, jsonStringify, log, type Output, output, secret, type Unwrap } from "@pulumi/pulumi";
import { type OPClient, TypeEnum } from "../op.ts";
import type { ClusterDefinition, DockgeClusterDefinition, DockgeLxcDefinition, KubernetesClusterDefinition, Meta, ProxmoxBackupServerLxcDefinition } from "./interfaces.ts";
import { SecretRefResolver } from "./refs.ts";

export * from "./interfaces.ts";

type OnePasswordItem = Unwrap<ReturnType<OPClient["mapItem"]>>;
/**
 * The shape every stack reads secrets through.
 *
 * This used to carry 1Password implementations, with `BaoStore` overriding the
 * ones OpenBao could serve. Phase 11 removed them: once Pulumi stops WRITING
 * 1Password, its copies go stale by design, so a store that could silently
 * fall back to them is not a safety net — it is a way to read a frozen
 * credential with no symptom. That is the failure mode this migration has hit
 * more than once (Phase 8's dead write-back, `hosts/dockge` frozen at Phase 4,
 * `keeper`/`vikunja` dumped from frozen items for months).
 *
 * So the reads are abstract now and `BaoStore` is the only implementation.
 * Everything left here is either derived from those reads or independent of
 * any store.
 */
export abstract class VaultStore {
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
  public abstract getDockgeInstances(): Output<Unwrap<DockgeLxcDefinition & Meta>[]>;
  public abstract getCluster(title: string): Output<Unwrap<ClusterDefinition & Meta>>;

  public abstract getAllClusters(): Output<Unwrap<ClusterDefinition & Meta>[]>;

  public getDockerClusters() {
    return this.getAllClusters().apply(items => items.filter(item => item.type === "dockge"));
  }

  public abstract getBackupPlans<T>(): Output<T[]>;

  public abstract getTailscaleExports(): Output<{ name: string; services: string[]; hosts: { name: string; externalIp: string; internalIp: string; mac: string; nodeType: "dockge" | "proxmox" | "pbs" | "truenas" }[] }[]>;

  /**
   * `getKubeConfig` used to live here: it read a 1Password item by title and
   * assembled a kubeconfig from its sa/cluster/cluster_api/token/certificate
   * fields. Its only caller was the authentik outpost ServiceConnection, which
   * now reads that credential from the cluster that issued it (Phase 10 --
   * home-operations stacks/applications/kubernetes.ts).
   *
   * Deleted rather than kept: `BaoStore` never overrode it, so under
   * BAO_STORE_READS it read 1Password SILENTLY, with no warning -- the one
   * fallback class the flag exists to eliminate. Dead code that quietly reads
   * the wrong store is a trap for whoever adds the next caller.
   */

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

  public abstract proxmoxBackupServers(withTag?: string): Output<Unwrap<ProxmoxBackupServerLxcDefinition>[]>;

  public abstract getSecretByTitle<T>(title: string): Output<Unwrap<T & Meta>>;

  /**
   * `ref+openbao://secrets/<path>#/<field>` resolution (PLAN §D.1), the
   * `ref+openbao://secrets/<path>#/<field>` resolution — now the ONLY
   * reference syntax a rendered file can carry. It had a 1Password counterpart
   * during the transition (`replaceOnePasswordPlaceholders`, chained after
   * this one); Phase 11 converted the last reference and deleted it.
   *
   * On the base class rather than per-store because the reference itself picks
   * the backend — `BAO_STORE_READS` has no bearing here, exactly as it has
   * none on `op://`.
   */
  private readonly refResolver = new SecretRefResolver();
  public resolveSecretReferences(value: Input<string>): Output<string> {
    return this.refResolver.resolve(value);
  }

  /**
   * `replaceOnePasswordPlaceholders` used to live here: it rewrote
   * `op://Eris/<Item>/<field>` inside rendered stack files by looking each item
   * up in 1Password.
   *
   * Deleted in Phase 11 once the last 37 of those references became
   * `ref+openbao://` — the resolver had no input left to act on. Documents now
   * carry one reference syntax, and it names OpenBao.
   *
   * Note what this does NOT remove: `getOnePasswordItemByTitle` and the
   * 1Password implementations above stay, because BAO_STORE_READS is still a
   * switch and 1Password is being handed over rather than torn down (PLAN §G
   * row 11). What is gone is the ability for a rendered file to reach into
   * 1Password by reference.
   */
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

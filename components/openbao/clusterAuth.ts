/**
 * OpenBao `kubernetes` auth for ONE Kubernetes cluster.
 *
 * One OpenBao serves the whole estate (PLAN.md §B), but one `kubernetes` auth
 * mount cannot serve more than one cluster. The mount's config pins a single
 * `kubernetes_host`, and OpenBao validates a login by calling TokenReview
 * against exactly that API server — so a mount configured for one cluster
 * rejects every other cluster's ServiceAccount tokens. The failure lands at
 * LOGIN, and its message ("service account name not authorized") reads like a
 * role misconfiguration rather than a wrong cluster, which is the whole reason
 * this is a component instead of a copied block: one mount per cluster, and the
 * per-cluster values named in one place.
 *
 * This component deliberately knows nothing about which clusters exist. It
 * takes a cluster key and an API server address; the stack supplies them.
 *
 * WHY THERE IS NO REVIEWER JWT. The usual cross-cluster recipe stores a
 * long-lived `system:auth-delegator` ServiceAccount token in the auth config —
 * a permanent credential in exactly the place this migration is trying to stop
 * keeping them. Omitting `token_reviewer_jwt` makes OpenBao call TokenReview
 * with the CLIENT's own token instead, so the only grant needed is
 * `system:auth-delegator` on the consuming ServiceAccount, declared in that
 * cluster's own repo next to the ServiceAccount it applies to. Nothing to
 * store, nothing to rotate.
 *
 * TWO THINGS EVERY NEW CLUSTER ALSO NEEDS, and neither lives here:
 *
 *   1. A `pulumi` policy grant for the new mount — `sys/auth/<mount>`,
 *      `sys/mounts/auth/<mount>`, `sys/mounts/auth/<mount>/tune`,
 *      `auth/<mount>/config` and `auth/<mount>/role/*`. Those are named paths
 *      on purpose (never `sys/auth/*`), so Pulumi can manage the mounts the
 *      estate has chosen and cannot enable arbitrary new ones. Adding them is
 *      an admin write, so it costs one root ceremony. See the vault repo's
 *      `bootstrap/openbao/equestria-init.sh` write_policies().
 *   2. An `eso-<clusterKey>` policy. Those are already written for every
 *      cluster by the same script, granting read on `secrets/shared/*` plus
 *      `secrets/clusters/<key>/*`.
 *
 * REACHABILITY IS A PRECONDITION, not an assumption. OpenBao dials the API
 * server on every login, so the cluster running OpenBao must be able to reach
 * it. Check before wiring a new cluster up:
 *
 *   kubectl -n kube-system exec openbao-0 -c openbao -- \
 *     sh -c 'nc -z -w5 <api-ip> 6443 && echo OPEN'
 *
 * If that path breaks later, the affected cluster's ExternalSecrets stop
 * refreshing while every other cluster carries on — a failure that is silent
 * from OpenBao's side. That is the standing cost of one OpenBao serving the
 * estate, accepted in PLAN.md §H.4.
 *
 * ADOPTING AN EXISTING MOUNT. equestria's `kubernetes` mount and its
 * `eso-equestria` role were created by the bootstrap script and are not
 * managed here yet. This component can express them — pass
 * `mountPath: "kubernetes"` to override the derived default — but switching
 * them over needs `pulumi import` rather than a plain create, or the apply
 * fails on a path that already exists. See `docs/openbao-pulumi-adoption.md`.
 */

import * as pk8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import type { GlobalResources } from "../globals.ts";

export interface OpenBaoClusterAuthArgs {
  globals: GlobalResources;
  /**
   * The cluster's `CLUSTER_KEY` (`equestria`, `sgc`, …). Drives the derived
   * mount path and policy name, and must match the `secrets/clusters/<key>/`
   * subtree the `eso-<key>` policy grants.
   */
  clusterKey: string;
  /**
   * Title of the stored cluster definition, used only to obtain a kubeconfig
   * for the live CA read (`Cluster: Stargate Command`, …).
   */
  clusterTitle: string;
  /**
   * API server address OpenBao dials for TokenReview.
   *
   * Prefer the IP over a `*.driscoll.tech` name: a hostname resolves through
   * the estate's split-horizon DNS, which would put Technitium in the login
   * path for every secret read this cluster makes. Whatever is passed must
   * appear in the API server certificate's SANs.
   */
  kubernetesHost: pulumi.Input<string>;
  /** Auth mount path. Defaults to `kubernetes-<clusterKey>`. */
  mountPath?: string;
  /** Policy the role grants. Defaults to `eso-<clusterKey>`. */
  policy?: string;
  /** ServiceAccount allowed to log in. Defaults to external-secrets. */
  serviceAccountName?: string;
  /** Its namespace. Defaults to kube-system. */
  serviceAccountNamespace?: string;
  /** Issued token lifetime, seconds. Defaults to one hour. */
  tokenTtl?: number;
}

export class OpenBaoClusterAuth extends pulumi.ComponentResource {
  public readonly backendPath: pulumi.Output<string>;

  constructor(name: string, args: OpenBaoClusterAuthArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:openbao:clusterAuth", name, args, opts);

    const { globals, clusterKey, clusterTitle, kubernetesHost } = args;
    const mountPath = args.mountPath ?? `kubernetes-${clusterKey}`;
    const policy = args.policy ?? `eso-${clusterKey}`;
    const serviceAccountName = args.serviceAccountName ?? "external-secrets";
    const serviceAccountNamespace = args.serviceAccountNamespace ?? "kube-system";
    // ESO re-authenticates per refresh, so a short TTL costs nothing and
    // bounds how long a leaked token stays useful.
    const tokenTtl = args.tokenTtl ?? 3600;

    // Provider-bound, like every other resource under components/openbao —
    // without this they would target whatever ambient Vault config is in the
    // environment rather than the estate's OpenBao.
    const cro = { parent: this, provider: globals.baoProvider };

    // The cluster's API-server CA, read live from the cluster itself.
    //
    // NOT from the stored cluster definition: `getKubernetesCluster` returns a
    // kubeconfig synthesised by `generateTailscaleKubeConfig`, which points at
    // the tailnet kubeproxy and carries NO `certificate-authority-data` at all,
    // so scraping it would silently yield nothing.
    //
    // `kube-system/kube-root-ca.crt` is the right source — verified
    // byte-identical to the CA in the cluster's own kubeconfig, with the API
    // server's serving cert chaining to it. Reading it live means a cluster PKI
    // rotation is picked up by the next `pulumi up` instead of becoming a
    // silent expiry.
    const cluster = globals.store.getKubernetesCluster(clusterTitle);
    const reader = new pk8s.Provider(`${name}-reader`, { kubeconfig: cluster.kubeConfig }, { parent: this });
    const rootCa = pk8s.core.v1.ConfigMap.get(`${name}-root-ca`, "kube-system/kube-root-ca.crt", {
      parent: this,
      provider: reader,
    });
    const caCert = rootCa.data.apply(d => {
      const pem = d?.["ca.crt"];
      if (!pem) {
        throw new Error(
          `kube-system/kube-root-ca.crt in ${clusterKey} has no \`ca.crt\` key. OpenBao cannot verify that ` +
            "cluster's API server without it, and every ExternalSecret there would fail at login rather than at read.",
        );
      }
      return pem;
    });

    const backend = new vault.AuthBackend(
      `${name}-backend`,
      {
        type: "kubernetes",
        path: mountPath,
        description: `${clusterKey} cluster ServiceAccount auth. Managed by Pulumi.`,
      },
      cro,
    );

    new vault.kubernetes.AuthBackendConfig(
      `${name}-config`,
      {
        backend: backend.path,
        kubernetesHost,
        kubernetesCaCert: caCert,
        // No `tokenReviewerJwt` — see the header. OpenBao reviews the client's
        // own token, which is why the consuming ServiceAccount needs
        // system:auth-delegator in its own cluster.
        //
        // `disableLocalCaJwt` is REQUIRED and easy to miss: left false, OpenBao
        // prefers the CA and token mounted in its OWN pod, which belong to the
        // cluster OpenBao runs in, and every login from any other cluster fails
        // TLS verification against that cluster's API server.
        disableLocalCaJwt: true,
      },
      cro,
    );

    new vault.kubernetes.AuthBackendRole(
      `${name}-role`,
      {
        backend: backend.path,
        roleName: policy,
        boundServiceAccountNames: [serviceAccountName],
        boundServiceAccountNamespaces: [serviceAccountNamespace],
        tokenPolicies: [policy],
        tokenTtl,
      },
      cro,
    );

    // The provider types `path` as optional because it defaults server-side;
    // it is set explicitly above, so the fallback is unreachable in practice.
    this.backendPath = backend.path.apply(p => p ?? mountPath);
    this.registerOutputs({ backendPath: this.backendPath });
  }
}

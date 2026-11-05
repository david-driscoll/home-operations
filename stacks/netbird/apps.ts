/**
 * Every tailnet app's NetBird twin (docs/plans/netbird-mirror.md §N): the pure
 * half, tested in apps.test.ts. app-services.ts does the API calls.
 *
 *   NetBird peer ──WireGuard──▶ private proxy (netbird-system/nbidp)
 *     <host>.app.<root domain>   │ TLS: nbidp-tls covers *.app
 *                                │ peer in the service's access groups, or 403
 *                                │ X-NetBird-User / -Groups re-stamped
 *                                ▼ Host kept (pass_host_header)
 *                              Traefik `netbird` door (traefik-netbird:8446)
 *                                │ IngressRoute <app>-netbird, Host(<host>.app.<root domain>)
 *                                ▼ netbird-as-<TAILSCALE_MIDDLEWARE>
 *                              the app's Service
 *
 * The same <host> the tailnet uses (`TAILSCALE_HOST`, default the app name),
 * under a custom domain registered on the proxy's cluster (`ek.<root domain>`).
 * Which apps: every
 * one whose ks renders kubernetes/components/tailscale, found by its tailnet
 * Ingress, whose ApplicationDefinition grants a NetBird user group. Who:
 * exactly those groups (appAccessGroups).
 */
import type { PrivateServiceRequest } from "./nbidp.ts";
import { USER_GROUPS } from "./policy.ts";

/** The label under the root domain that holds every app: `<host>.app.<root domain>`. */
export const APP_SUBDOMAIN = "app";

/** The custom domain registered on the proxy's cluster: `app.<root domain>`. */
export function appDomain(root: string): string {
  return `${APP_SUBDOMAIN}.${root}`;
}

/** One app's NetBird name. */
export function appHost(host: string, root: string): string {
  return `${host}.${appDomain(root)}`;
}

/**
 * Traefik's `netbird` door (kubernetes/apps/network/traefik/values.yaml
 * ports.netbird), on its own ClusterIP Service. The proxy dials it from its
 * pod, and the door's CiliumNetworkPolicy admits nothing else.
 */
export const TRAEFIK_NETBIRD_DOOR = { host: "traefik-netbird.network.svc.cluster.local", port: 8446 } as const;

/** What kubernetes/components/tailscale/ks.yaml names the child ks that renders an app's tailnet Ingress. */
export const TAILNET_INGRESS_KS_SUFFIX = "-tailnet-ingress";

/** The fields of a networking.k8s.io/v1 Ingress used here. */
export interface LiveIngress {
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  spec?: { ingressClassName?: string; tls?: { hosts?: string[] }[] };
}

/** A tailnet app: its name, the namespace its ks applies to, and its tailnet host label. */
export interface TailnetApp {
  app: string;
  namespace: string;
  host: string;
}

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The tailnet apps, from the Ingresses in `network`.
 *
 * components/tailscale renders each app's Ingress through a child ks named
 * `<APP>-tailnet-ingress`, and Flux labels everything it applies with that ks's
 * name and namespace, so the Ingress carries the app (app.kubernetes.io/name),
 * the namespace its definition lives in (kustomize.toolkit.fluxcd.io/namespace,
 * the child ks's own namespace, which is the app's), and its host (tls.hosts,
 * TAILSCALE_HOST already resolved). Funnel Ingresses in `network` come from
 * other ks and are left out by the label.
 *
 * Throws on anything ambiguous rather than skipping it: two apps on one host
 * would have to share a NetBird service.
 */
export function tailnetApps(ingresses: LiveIngress[]): TailnetApp[] {
  const byHost = new Map<string, TailnetApp>();
  for (const ingress of ingresses) {
    const labels = ingress.metadata?.labels ?? {};
    const app = labels["app.kubernetes.io/name"];
    if (ingress.spec?.ingressClassName !== "tailscale" || !app || labels["kustomize.toolkit.fluxcd.io/name"] !== `${app}${TAILNET_INGRESS_KS_SUFFIX}`) continue;
    const namespace = labels["kustomize.toolkit.fluxcd.io/namespace"];
    const host = ingress.spec.tls?.[0]?.hosts?.[0];
    if (!namespace || !host) throw new Error(`tailnet Ingress ${ingress.metadata?.name} has no ks namespace label or no tls host`);
    if (!DNS_LABEL.test(host)) throw new Error(`tailnet Ingress ${ingress.metadata?.name}: host "${host}" is not a single DNS label`);
    const clash = byHost.get(host);
    if (clash) throw new Error(`tailnet host "${host}" is claimed by both ${clash.namespace}/${clash.app} and ${namespace}/${app}`);
    byHost.set(host, { app, namespace, host });
  }
  return [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host));
}

/** The fields of a driscoll.dev/v1 ApplicationDefinition used here. */
export interface LiveDefinition {
  metadata: { name: string; namespace?: string };
  spec?: { access_policy?: { groups?: string[] } };
}

/** The definition the tailscale component's app carries: `<namespace>/<APP>`, as every definition.yaml names itself `${APP}`. */
export function definitionFor(app: TailnetApp, definitions: LiveDefinition[]): LiveDefinition | undefined {
  return definitions.find(definition => definition.metadata.name === app.app && definition.metadata.namespace === app.namespace);
}

/**
 * Authentik's `users`: the parent of every other group
 * (components/authentik/groups.ts), so naming it means everyone.
 */
const EVERYONE = "users";

export interface AppAccess {
  /**
   * NetBird user group names, in USER_GROUPS order. EMPTY means the app gets
   * no NetBird service at all (and `warnings` says why).
   */
  groups: string[];
  /** Why the result differs from the definition, one line each. */
  warnings: string[];
}

/**
 * Who may reach an app's NetBird twin: exactly the groups its definition's
 * access_policy names that are NetBird user groups (stacks/netbird/policy.ts
 * creates them under the same names). David's decision, 2026-11-04 (D44):
 *
 *   - the named groups that NetBird has, and nothing added: `admins` is in
 *     only if the definition lists it;
 *   - `users` (Authentik's parent of every group): all four. No app lists it
 *     today;
 *   - a group NetBird does not have (`editors`): skipped, with a warning;
 *   - NO SERVICE, with a warning, for an app with no ApplicationDefinition
 *     (thanos, meilisearch), a definition with no `access_policy`, or one
 *     whose groups map to no NetBird group. The tailnet name still works.
 *
 * Never a device group: a peer without a user would have its peer name stamped
 * as X-NetBird-User (as nbidp.ts says).
 */
export function appAccessGroups(definition: LiveDefinition | undefined, app: TailnetApp, userGroups: readonly string[] = USER_GROUPS): AppAccess {
  const label = `${app.namespace}/${app.app}`;
  if (!definition) return { groups: [], warnings: [`${label} has no ApplicationDefinition; no NetBird service`] };
  const policy = definition.spec?.access_policy;
  if (!policy) return { groups: [], warnings: [`${label}: its definition has no access_policy; no NetBird service`] };

  const warnings: string[] = [];
  const admitted = new Set<string>();
  for (const name of policy.groups ?? []) {
    if (name === EVERYONE) userGroups.forEach(group => admitted.add(group));
    else if (userGroups.includes(name)) admitted.add(name);
    else warnings.push(`${label}: access_policy group "${name}" is not a NetBird user group; skipped`);
  }
  if (admitted.size === 0) warnings.push(`${label}: no access_policy group is a NetBird user group; no NetBird service`);
  return { groups: userGroups.filter(group => admitted.has(group)), warnings };
}

/**
 * The private service for one app. Same shape as nbidp's
 * (nbidp.ts privateServiceRequest), with two differences:
 *
 *   - `pass_host_header`: Traefik picks the app's router by Host, as the
 *     tailnet path does (the Tailscale operator keeps Host too). The proxy
 *     otherwise rewrites Host to the target's (rewriteFunc in
 *     proxy/internal/proxy/reverseproxy.go, v0.82.0);
 *   - the target is Traefik's netbird door, not the app's Service, so the app
 *     gets the same middlewares as on the tailnet, and its Service name and
 *     port stay in its own ks (TAILSCALE_SERVICE / TAILSCALE_PORT).
 *
 * No `rewrite_redirects`: with Host kept, apps already build the public URL.
 */
export function appServiceRequest(args: { host: string; clusterAddress: string; accessGroupIds: string[] }): PrivateServiceRequest {
  if (args.accessGroupIds.length === 0) throw new Error(`the private service for ${args.host} needs at least one access group`);
  return {
    name: `app-${args.host.split(".")[0]}`,
    domain: args.host,
    enabled: true,
    mode: "http",
    private: true,
    access_groups: args.accessGroupIds,
    pass_host_header: true,
    rewrite_redirects: false,
    targets: [
      {
        target_type: "cluster",
        target_id: args.clusterAddress,
        host: TRAEFIK_NETBIRD_DOOR.host,
        port: TRAEFIK_NETBIRD_DOOR.port,
        protocol: "http",
        path: "/",
        enabled: true,
        options: { direct_upstream: true, request_timeout: "30s" },
      },
    ],
  };
}

/**
 * Where `app.<root domain>` stands on this run: validated; being created by
 * this run (its create checks the CNAME, which the run creates first); or
 * registered but still unvalidated after this run asked again.
 */
export type AppDomainState = "validated" | "creating" | "unvalidated";

/**
 * Whether an app's service can be declared on this run. Management derives a
 * service's cluster from its domain, which needs the custom domain validated,
 * and a connected proxy. A service that already exists stays declared, so a
 * run during a proxy restart deletes nothing.
 *
 * A domain this run creates counts as ready: the services depend on it, so if
 * its create did not validate they fail with 412 and the Stack retries (and
 * re-validates) within a minute, instead of waiting for the daily resync. A
 * domain that exists and still did not validate holds new services back, so
 * a wrong CNAME warns rather than failing every run.
 */
export function appServiceReady(args: { serviceExists: boolean; clusterOnline: boolean; domain: AppDomainState }): boolean {
  return args.serviceExists || (args.clusterOnline && args.domain !== "unvalidated");
}

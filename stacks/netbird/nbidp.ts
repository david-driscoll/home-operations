/**
 * The NetBird side of nbidp (#2891, docs/plans/netbird-mirror.md §K): the
 * private reverse-proxy service in front of Dex. Pure, so `node --test`
 * evaluates it (nbidp.test.ts); index.ts §10 does the API calls.
 *
 * A PRIVATE service (management v0.82.0, `Service.Private`) is NetBird-only:
 * the proxy accepts a request only on its WireGuard listener, asks management
 * whether the source tunnel IP's peer is in `access_groups`
 * (ValidateTunnelPeer), and 403s otherwise. Management also does the rest of
 * the wiring on its own: an ACL policy from the access groups to the proxy
 * peers on 80/443, and a DNS record for the domain pointing at the connected
 * proxy peers, pushed only to peers in those groups.
 *
 * The Terraform provider (0.0.11) has no `private` or `access_groups` on
 * netbird_reverse_proxy_service, hence dynamic/netbird/NetbirdPrivateService.
 *
 * NetBird's own login is its built-in one (embedded Dex, local users), not
 * Authentik, and nbidp still works: everyone is invited under their Authentik
 * account's email (`mise run netbird:invite`), so the X-NetBird-User the proxy
 * stamps is that email and the Authentik source's email_link matches it to
 * the right Authentik user. Someone invited under any other email reaches
 * Authentik as a stranger and goes through enrollment instead.
 */
import { DEX_NAMESPACE, DEX_PORT, DEX_SERVICE } from "components/netbird/nbidp.ts";
import { USER_GROUPS } from "./policy.ts";

/** GET /api/reverse-proxies/clusters, the fields used here. */
export interface LiveCluster {
  address: string;
  online: boolean;
  /** At least one connected proxy runs with NB_PROXY_PRIVATE=true. */
  private?: boolean;
  /** `account` for a bring-your-own proxy. */
  type?: string;
}

/** GET /api/reverse-proxies/services, the fields used here. */
export interface LiveService {
  id: string;
  domain: string;
}

/**
 * The groups whose peers the proxy lets through to Dex: the four user groups
 * stacks/netbird creates, and only those (`ids` maps every group it made,
 * name to id). Never `All`, never a device group: a peer with no owner gets
 * its peer name stamped as X-NetBird-User, which Dex would pass to Authentik
 * as a verified email.
 */
export function privateServiceAccessGroups(ids: Record<string, string>): string[] {
  const missing = USER_GROUPS.filter(name => !ids[name]);
  if (missing.length > 0) throw new Error(`nbidp: no id for user groups ${missing.join(", ")}; stacks/netbird creates all four`);
  return USER_GROUPS.map(name => ids[name]);
}

/**
 * Whether the service can be declared on this run.
 *
 * Creating one needs a live private proxy for its domain: management derives
 * the service's cluster from the domain, matched against the clusters whose
 * proxies are connected. But once it exists it stays declared even while the
 * proxy is down, or a run during a proxy restart would delete it.
 */
export function privateServiceReady(clusters: LiveCluster[], services: LiveService[], host: string): boolean {
  if (services.some(service => service.domain === host)) return true;
  return clusters.some(cluster => cluster.address === host && cluster.online && cluster.private === true);
}

/** POST/PUT /api/reverse-proxies/services body (api.ServiceRequest). */
export interface PrivateServiceRequest {
  name: string;
  domain: string;
  enabled: boolean;
  mode: "http";
  private: true;
  access_groups: string[];
  pass_host_header: boolean;
  rewrite_redirects: boolean;
  auth?: undefined;
  targets: {
    target_type: "cluster";
    target_id: string;
    host: string;
    port: number;
    protocol: "http";
    path: string;
    enabled: boolean;
    options: { direct_upstream: true; request_timeout: string };
  }[];
}

/**
 * The service. The domain is the proxy's own cluster address
 * (NB_PROXY_DOMAIN), so no custom domain has to be registered or validated,
 * and management's synthesized DNS zone is exactly that one name.
 *
 * The target is a `cluster` target with `direct_upstream`: the proxy dials
 * Dex's Service from its pod, not through the mesh. Both need a private
 * cluster, which management checks.
 */
export function privateServiceRequest(args: { host: string; accessGroupIds: string[] }): PrivateServiceRequest {
  if (args.accessGroupIds.length === 0) throw new Error("the nbidp private service needs at least one access group");
  return {
    name: "nbidp",
    domain: args.host,
    enabled: true,
    mode: "http",
    private: true,
    access_groups: args.accessGroupIds,
    // Dex builds every URL from its issuer, never from Host or the backend
    // address, so neither needs rewriting.
    pass_host_header: false,
    rewrite_redirects: false,
    targets: [
      {
        target_type: "cluster",
        target_id: args.host,
        host: `${DEX_SERVICE}.${DEX_NAMESPACE}.svc.cluster.local`,
        port: DEX_PORT,
        protocol: "http",
        path: "/",
        enabled: true,
        options: { direct_upstream: true, request_timeout: "30s" },
      },
    ],
  };
}

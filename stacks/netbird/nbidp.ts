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
  /** The cluster management pinned the service to when it was created. */
  proxy_cluster?: string;
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
 * Whether a live service is on the cluster it must be on. Management fixes a
 * service's proxy cluster when the service is created (an update with the
 * same domain keeps it: resolveEffectiveCluster, v0.82.0), so a service left
 * on another cluster after the proxy's address changes is stranded: no proxy
 * serves it, and no PUT can move it. NetbirdPrivateService deletes and
 * re-creates it instead.
 */
export function serviceOnCluster(services: LiveService[], domain: string, clusterAddress: string): boolean {
  return services.some(service => service.domain === domain && service.proxy_cluster === clusterAddress);
}

/** GET /api/reverse-proxies/domains, the fields used here. */
export interface LiveDomain {
  id: string;
  domain: string;
  validated: boolean;
  /** `free` (a cluster address) or `custom`. */
  type?: string;
  target_cluster?: string;
}

/** The custom domain, if management has it (not the free cluster address of the same name). */
export function liveCustomDomain(domains: LiveDomain[], domain: string): LiveDomain | undefined {
  return domains.find(entry => entry.domain === domain && entry.type === "custom");
}

/**
 * The name management looks up to validate a custom domain: a CNAME at
 * `validation.<domain>` naming the target cluster's address (Validator.Validate,
 * management/internals/modules/reverseproxy/domain/validator.go, v0.82.0).
 */
export function validationRecordName(domain: string): string {
  return `validation.${domain}`;
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
 * The service. Its domain, `nbidp.<root domain>`, is a custom domain
 * registered on the proxy's cluster, whose address is `ek.<root domain>`
 * (NB_PROXY_DOMAIN; components/netbird/nbidp.ts nbidpClusterAddress). The
 * domain used to BE the cluster address, which made this a one-service proxy;
 * D38 split the two, so other services can share the cluster under their own
 * custom domains. Management's synthesized DNS zone is still exactly the
 * service's name.
 *
 * The target is a `cluster` target with `direct_upstream`: the proxy dials
 * Dex's Service from its pod, not through the mesh. Both need a private
 * cluster, which management checks.
 */
export function privateServiceRequest(args: { host: string; clusterAddress: string; accessGroupIds: string[] }): PrivateServiceRequest {
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
        target_id: args.clusterAddress,
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

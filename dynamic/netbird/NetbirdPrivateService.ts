/**
 * A NetBird reverse-proxy service with `private` and `access_groups` (#2891),
 * which the Terraform provider's netbird_reverse_proxy_service (0.0.11) cannot
 * set. Plain CRUD over `/api/reverse-proxies/services` (management v0.82.0).
 *
 * `request` is the whole api.ServiceRequest body, built by
 * stacks/netbird/nbidp.ts; any change to it is a PUT, EXCEPT a change of the
 * proxy cluster its cluster target names.
 *
 * THE CLUSTER IS FIXED AT CREATE. Management derives a service's proxy cluster
 * from its domain when the service is created and keeps it on every update
 * with the same domain (resolveEffectiveCluster). A PUT naming a new cluster
 * would leave the service where it was, on a cluster no proxy serves any more.
 * So a cluster change is a REPLACE, and always delete-before-create, because
 * the domain is unique per server and the new service needs it.
 *
 * Create adopts a service that already holds the domain (so losing this
 * resource's state does not wedge the stack on a conflict), but only one on
 * the right cluster: one stranded on another is deleted and created afresh.
 * And create checks where management put the new service: while two proxy
 * clusters are both connected (a rolling restart that changes NB_PROXY_DOMAIN),
 * a domain that is also the old cluster's address derives to the OLD cluster.
 * That service is deleted again and the create fails, so the next run, once
 * the old proxy has gone, creates it in the right place.
 */
import * as pulumi from "@pulumi/pulumi";

export interface NetbirdPrivateServiceArgs {
  /** `https://netbird.<root domain>`. */
  managementUrl: pulumi.Input<string>;
  /** An admin PAT. */
  token: pulumi.Input<string>;
  /** api.ServiceRequest. */
  request: pulumi.Input<ServiceRequestShape>;
}

/** The parts of api.ServiceRequest this provider reads. */
interface ServiceRequestShape {
  domain: string;
  targets?: { target_type?: string; target_id?: string }[];
}

interface ProviderInputs {
  managementUrl: string;
  token: string;
  request: ServiceRequestShape;
}

interface ServiceSummary {
  id: string;
  domain: string;
  proxy_cluster?: string;
}

/** The id of the service already serving `domain`, if any. */
export function serviceIdForDomain(services: ServiceSummary[], domain: string): string | undefined {
  return services.find(service => service.domain === domain)?.id;
}

/** The proxy cluster a request's cluster target names, if it has one. */
export function requestCluster(request: ServiceRequestShape): string | undefined {
  return request.targets?.find(target => target.target_type === "cluster")?.target_id;
}

/**
 * What create does with a service already on the domain: adopt it (PUT), or
 * delete it first because it is pinned to another cluster. A service whose
 * cluster management did not report is adopted, as before.
 */
export function adoption(existing: ServiceSummary | undefined, cluster: string | undefined): "post" | "put" | "delete-then-post" {
  if (!existing) return "post";
  if (cluster && existing.proxy_cluster && existing.proxy_cluster !== cluster) return "delete-then-post";
  return "put";
}

/** The diff: a PUT for anything but the cluster, which replaces (delete first). */
export function serviceDiff(olds: ProviderInputs, news: ProviderInputs): pulumi.dynamic.DiffResult {
  const replaces: string[] = [];
  if (olds.managementUrl !== news.managementUrl) replaces.push("managementUrl");
  if (requestCluster(olds.request) !== requestCluster(news.request)) replaces.push("request");
  const changes = replaces.length > 0 || olds.token !== news.token || JSON.stringify(olds.request) !== JSON.stringify(news.request);
  return { changes, replaces, deleteBeforeReplace: replaces.length > 0 };
}

async function netbirdRequest(inputs: Pick<ProviderInputs, "managementUrl" | "token">, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${inputs.managementUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Token ${inputs.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (method === "DELETE" && response.status === 404) return undefined;
  if (!response.ok) {
    // Management's validation errors (no private cluster, unknown group,
    // unvalidated domain) are the useful part; surface them.
    const detail = await response.text().catch(() => "");
    throw new Error(`NetBird ${method} ${path}: HTTP ${response.status} ${response.statusText} ${detail}`.trim());
  }
  return method === "DELETE" ? undefined : response.json();
}

const SERVICES = "/api/reverse-proxies/services";

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    const cluster = requestCluster(inputs.request);
    const existing = ((await netbirdRequest(inputs, "GET", SERVICES)) as ServiceSummary[]).find(service => service.domain === inputs.request.domain);
    const action = adoption(existing, cluster);
    if (existing && action === "delete-then-post") await netbirdRequest(inputs, "DELETE", `${SERVICES}/${encodeURIComponent(existing.id)}`);
    const saved = (
      existing && action === "put" ? await netbirdRequest(inputs, "PUT", `${SERVICES}/${encodeURIComponent(existing.id)}`, inputs.request) : await netbirdRequest(inputs, "POST", SERVICES, inputs.request)
    ) as ServiceSummary;
    if (cluster && saved.proxy_cluster && saved.proxy_cluster !== cluster) {
      await netbirdRequest(inputs, "DELETE", `${SERVICES}/${encodeURIComponent(saved.id)}`);
      throw new Error(`NetBird put ${inputs.request.domain} on proxy cluster ${saved.proxy_cluster}, not ${cluster} (is a proxy with the old address still connected?); deleted it again, the next run retries`);
    }
    return { id: saved.id, outs: inputs };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    return serviceDiff(olds, news);
  },
  async update(id: string, _olds: ProviderInputs, news: ProviderInputs) {
    await netbirdRequest(news, "PUT", `${SERVICES}/${encodeURIComponent(id)}`, news.request);
    return { outs: news };
  },
  async delete(id: string, olds: ProviderInputs) {
    await netbirdRequest(olds, "DELETE", `${SERVICES}/${encodeURIComponent(id)}`);
  },
};

export class NetbirdPrivateService extends pulumi.dynamic.Resource {
  constructor(name: string, args: NetbirdPrivateServiceArgs, opts?: pulumi.CustomResourceOptions) {
    // deleteBeforeReplace: the domain is unique per server, so a replacement
    // can only be created once the old service is gone.
    // The token is wrapped as a secret INPUT too: callers pass it unwrapped
    // from inside an apply, and additionalSecretOutputs alone leaves it in
    // plain text in a preview's diff.
    super(provider, name, { ...args, token: pulumi.secret(args.token) }, { additionalSecretOutputs: ["token"], deleteBeforeReplace: true, ...opts });
  }
}

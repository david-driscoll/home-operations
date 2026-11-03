/**
 * A NetBird reverse-proxy service with `private` and `access_groups` (#2891),
 * which the Terraform provider's netbird_reverse_proxy_service (0.0.11) cannot
 * set. Plain CRUD over `/api/reverse-proxies/services` (management v0.82.0).
 *
 * `request` is the whole api.ServiceRequest body, built by
 * stacks/netbird/nbidp.ts; any change to it is a PUT.
 *
 * Create adopts a service that already holds the domain (domains are unique
 * per server), so losing this resource's state does not wedge the stack on a
 * conflict.
 */
import * as pulumi from "@pulumi/pulumi";

export interface NetbirdPrivateServiceArgs {
  /** `https://netbird.<root domain>`. */
  managementUrl: pulumi.Input<string>;
  /** An admin PAT. */
  token: pulumi.Input<string>;
  /** api.ServiceRequest. */
  request: pulumi.Input<{ domain: string }>;
}

interface ProviderInputs {
  managementUrl: string;
  token: string;
  request: { domain: string };
}

interface ServiceSummary {
  id: string;
  domain: string;
}

/** The id of the service already serving `domain`, if any. */
export function serviceIdForDomain(services: ServiceSummary[], domain: string): string | undefined {
  return services.find(service => service.domain === domain)?.id;
}

async function netbirdRequest(inputs: Pick<ProviderInputs, "managementUrl" | "token">, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${inputs.managementUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Token ${inputs.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (method === "DELETE" && response.status === 404) return undefined;
  if (!response.ok) {
    // Management's validation errors (no private cluster, unknown group) are
    // the useful part; surface them.
    const detail = await response.text().catch(() => "");
    throw new Error(`NetBird ${method} ${path}: HTTP ${response.status} ${response.statusText} ${detail}`.trim());
  }
  return method === "DELETE" ? undefined : response.json();
}

const SERVICES = "/api/reverse-proxies/services";

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    const existing = serviceIdForDomain((await netbirdRequest(inputs, "GET", SERVICES)) as ServiceSummary[], inputs.request.domain);
    const saved = (existing ? await netbirdRequest(inputs, "PUT", `${SERVICES}/${encodeURIComponent(existing)}`, inputs.request) : await netbirdRequest(inputs, "POST", SERVICES, inputs.request)) as ServiceSummary;
    return { id: saved.id, outs: inputs };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    const changes = olds.managementUrl !== news.managementUrl || olds.token !== news.token || JSON.stringify(olds.request) !== JSON.stringify(news.request);
    return { changes, replaces: olds.managementUrl !== news.managementUrl ? ["managementUrl"] : [] };
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
    super(provider, name, args, { additionalSecretOutputs: ["token"], ...opts });
  }
}

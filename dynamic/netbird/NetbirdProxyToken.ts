/**
 * An account-scoped NetBird reverse-proxy token (#2891): what a
 * bring-your-own proxy presents to management as NB_PROXY_TOKEN.
 *
 * The Terraform provider (0.0.11) cannot mint one, so this calls the API
 * directly: `POST /api/reverse-proxies/proxy-tokens` (management v0.82.0,
 * internals/modules/reverseproxy/proxytoken). The plain token is returned once,
 * at creation, and is kept as a secret output; stacks/netbird writes it to
 * OpenBao for the proxy's ExternalSecret.
 *
 * It never expires. Rotate by renaming (a rename replaces the resource, and
 * the replaced token is revoked on delete).
 */
import * as pulumi from "@pulumi/pulumi";

export interface NetbirdProxyTokenArgs {
  /** `https://netbird.<root domain>`. */
  managementUrl: pulumi.Input<string>;
  /** An admin PAT. */
  token: pulumi.Input<string>;
  /** Shown in the dashboard's proxy-token list. */
  name: pulumi.Input<string>;
}

interface ProviderInputs {
  managementUrl: string;
  token: string;
  name: string;
}

interface ProviderOutputs extends ProviderInputs {
  tokenId: string;
  plainToken: string;
}

/** api.ProxyTokenCreated, the fields used here. */
export interface ProxyTokenCreated {
  id: string;
  plain_token: string;
}

export function parseProxyTokenCreated(body: unknown): ProxyTokenCreated {
  const created = body as Partial<ProxyTokenCreated> | null;
  if (!created?.id || !created.plain_token) throw new Error("NetBird POST /api/reverse-proxies/proxy-tokens: response has no id or plain_token");
  return { id: created.id, plain_token: created.plain_token };
}

async function netbirdRequest(inputs: Pick<ProviderInputs, "managementUrl" | "token">, method: "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${inputs.managementUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Token ${inputs.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Already revoked or deleted by hand: nothing left to do.
  if (method === "DELETE" && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`NetBird ${method} ${path}: HTTP ${response.status} ${response.statusText}`);
  return method === "POST" ? response.json() : undefined;
}

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    // expires_in 0: never.
    const created = parseProxyTokenCreated(await netbirdRequest(inputs, "POST", "/api/reverse-proxies/proxy-tokens", { name: inputs.name, expires_in: 0 }));
    return { id: created.id, outs: { ...inputs, tokenId: created.id, plainToken: created.plain_token } };
  },
  async diff(_id: string, olds: ProviderOutputs, news: ProviderInputs) {
    // A new admin PAT does not touch the proxy token: only the token's
    // identity (its name, its server) replaces it.
    const replaces = [...(olds.name !== news.name ? ["name"] : []), ...(olds.managementUrl !== news.managementUrl ? ["managementUrl"] : [])];
    return { changes: replaces.length > 0 || olds.token !== news.token, replaces, deleteBeforeReplace: false };
  },
  async update(_id: string, olds: ProviderOutputs, news: ProviderInputs) {
    return { outs: { ...news, tokenId: olds.tokenId, plainToken: olds.plainToken } };
  },
  async delete(id: string, olds: ProviderOutputs) {
    await netbirdRequest(olds, "DELETE", `/api/reverse-proxies/proxy-tokens/${encodeURIComponent(id)}`);
  },
};

export class NetbirdProxyToken extends pulumi.dynamic.Resource {
  public declare readonly tokenId: pulumi.Output<string>;
  /** NB_PROXY_TOKEN. Secret. */
  public declare readonly plainToken: pulumi.Output<string>;

  constructor(name: string, args: NetbirdProxyTokenArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, { ...args, tokenId: undefined, plainToken: undefined }, { additionalSecretOutputs: ["token", "plainToken"], ...opts });
  }
}

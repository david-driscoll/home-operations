/**
 * Deletes the allow-all `Default` policy NetBird creates with every new
 * account (#2885, docs/plans/netbird-mirror.md §J).
 *
 * The Terraform provider can only delete what it manages, and importing the
 * built-in policy to delete it takes two runs. This resource does it in one:
 * on every create/update it lists the account's policies and deletes any that
 * still open `All` to `All` under the name `Default`. Until it has run, every
 * peer can reach every other one, so stacks/netbird creates it before any
 * setup key.
 *
 * Deleting this resource does nothing: the policy is not put back.
 */
import * as pulumi from "@pulumi/pulumi";

export interface NetbirdDefaultPolicyRemovalArgs {
  /** `https://netbird.<root domain>`. */
  managementUrl: pulumi.Input<string>;
  /** An admin PAT. Pass `globals.netbirdApi` whole for both fields. */
  token: pulumi.Input<string>;
}

interface ProviderInputs {
  managementUrl: string;
  token: string;
}

interface PolicyGroupRef {
  name?: string;
}
interface PolicyRule {
  sources?: PolicyGroupRef[] | null;
  destinations?: PolicyGroupRef[] | null;
}
export interface PolicySummary {
  id: string;
  name: string;
  rules?: PolicyRule[] | null;
}

const onlyAll = (refs: PolicyGroupRef[] | null | undefined) => !!refs && refs.length > 0 && refs.every(ref => ref.name === "All");

/** The ids of every policy that is NetBird's built-in allow-all: named `Default`, with a rule from `All` to `All`. */
export function builtInDefaultPolicyIds(policies: PolicySummary[]): string[] {
  return policies.filter(policy => policy.name === "Default" && (policy.rules ?? []).some(rule => onlyAll(rule.sources) && onlyAll(rule.destinations))).map(policy => policy.id);
}

async function netbirdRequest(inputs: ProviderInputs, method: "GET" | "DELETE", path: string): Promise<unknown> {
  const response = await fetch(`${inputs.managementUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Token ${inputs.token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`NetBird ${method} ${path}: HTTP ${response.status} ${response.statusText}`);
  }
  return method === "GET" ? response.json() : undefined;
}

async function removeDefaultPolicy(inputs: ProviderInputs): Promise<string[]> {
  const policies = (await netbirdRequest(inputs, "GET", "/api/policies")) as PolicySummary[];
  const ids = builtInDefaultPolicyIds(policies);
  for (const id of ids) await netbirdRequest(inputs, "DELETE", `/api/policies/${id}`);
  return ids;
}

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    const removed = await removeDefaultPolicy(inputs);
    return { id: "netbird-default-policy-removal", outs: { ...inputs, removed } };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    // Re-checks on every run when the URL or token changes; a server restored
    // from an old backup would otherwise keep the policy it came back with.
    return { changes: olds.managementUrl !== news.managementUrl || olds.token !== news.token };
  },
  async update(_id: string, _olds: ProviderInputs, news: ProviderInputs) {
    const removed = await removeDefaultPolicy(news);
    return { outs: { ...news, removed } };
  },
  async delete() {
    // Intentionally nothing; see the header.
  },
};

export class NetbirdDefaultPolicyRemoval extends pulumi.dynamic.Resource {
  public declare readonly removed: pulumi.Output<string[]>;

  constructor(name: string, args: NetbirdDefaultPolicyRemovalArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, { ...args, removed: undefined }, { additionalSecretOutputs: ["token"], ...opts });
  }
}

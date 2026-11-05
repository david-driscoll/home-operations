/**
 * Adds one group to one NetBird user's auto groups, and only that one
 * (stacks/netbird/selfAccess.ts).
 *
 * The Terraform provider's `netbird_user` would own the whole user: its role,
 * every auto group, and deleting it would delete the person. Users here are
 * made by invite and moved between groups in the dashboard, so this touches
 * nothing but its own group: create adds it, delete takes it back out, and
 * everything else on the user is sent back as it was read.
 *
 * Its diff reads the live user, so a group removed in the dashboard comes
 * back on the next run. A user who no longer exists is left alone; the stack
 * stops declaring them and this resource goes with them.
 *
 * With the account's group propagation on, adding the group also adds every
 * peer the user already has.
 */
import * as pulumi from "@pulumi/pulumi";

export interface NetbirdUserAutoGroupArgs {
  /** `https://netbird.<root domain>`. */
  managementUrl: pulumi.Input<string>;
  /** An admin PAT. */
  token: pulumi.Input<string>;
  userId: pulumi.Input<string>;
  groupId: pulumi.Input<string>;
}

interface ProviderInputs {
  managementUrl: string;
  token: string;
  userId: string;
  groupId: string;
}

/** GET /api/users, the fields PUT /api/users/{id} needs back. */
export interface LiveUserRecord {
  id: string;
  role: string;
  auto_groups?: string[] | null;
  is_blocked?: boolean | null;
}

/** PUT /api/users/{id} body. */
export interface UserUpdateRequest {
  role: string;
  auto_groups: string[];
  is_blocked: boolean;
}

/** The update that adds (`present`) or removes `groupId`, or undefined when the user already matches. */
export function autoGroupUpdate(user: LiveUserRecord, groupId: string, present: boolean): UserUpdateRequest | undefined {
  const current = user.auto_groups ?? [];
  const has = current.includes(groupId);
  if (has === present) return undefined;
  const auto_groups = present ? [...current, groupId] : current.filter(id => id !== groupId);
  return { role: user.role, auto_groups, is_blocked: user.is_blocked ?? false };
}

async function netbirdRequest(inputs: ProviderInputs, method: "GET" | "PUT", path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${inputs.managementUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Token ${inputs.token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`NetBird ${method} ${path}: HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function liveUser(inputs: ProviderInputs): Promise<LiveUserRecord | undefined> {
  const users = (await netbirdRequest(inputs, "GET", "/api/users")) as LiveUserRecord[];
  return users.find(user => user.id === inputs.userId);
}

/** Brings the user to `present`. Returns false when the user does not exist. */
async function reconcile(inputs: ProviderInputs, present: boolean): Promise<boolean> {
  const user = await liveUser(inputs);
  if (!user) return false;
  const update = autoGroupUpdate(user, inputs.groupId, present);
  if (update) await netbirdRequest(inputs, "PUT", `/api/users/${encodeURIComponent(user.id)}`, update);
  return true;
}

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    if (!(await reconcile(inputs, true))) throw new Error(`NetBird has no user ${inputs.userId}`);
    return { id: `${inputs.userId}/${inputs.groupId}`, outs: inputs };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    if (olds.userId !== news.userId || olds.groupId !== news.groupId) return { changes: true, replaces: olds.userId !== news.userId ? ["userId"] : ["groupId"], deleteBeforeReplace: true };
    if (olds.managementUrl !== news.managementUrl || olds.token !== news.token) return { changes: true };
    // Unchanged inputs: still re-add the group if the dashboard took it off.
    const user = await liveUser(news);
    return { changes: !!user && autoGroupUpdate(user, news.groupId, true) !== undefined };
  },
  async update(_id: string, _olds: ProviderInputs, news: ProviderInputs) {
    await reconcile(news, true);
    return { outs: news };
  },
  async delete(_id: string, olds: ProviderInputs) {
    // A user already gone took their auto groups with them.
    await reconcile(olds, false);
  },
};

export class NetbirdUserAutoGroup extends pulumi.dynamic.Resource {
  constructor(name: string, args: NetbirdUserAutoGroupArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, args, { additionalSecretOutputs: ["token"], ...opts });
  }
}

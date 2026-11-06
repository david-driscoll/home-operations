/**
 * The NetBird account settings the Terraform provider cannot carry, put back
 * after every write it makes (stacks/netbird, section 1).
 *
 * WHY IT EXISTS. `PUT /api/accounts/{id}` rebuilds the account's settings from
 * the request alone (management updateAccountRequestSettings, v0.82.0): a field
 * the body leaves out is reset to zero, not kept. The provider's
 * `netbird_account_settings` (v0.0.11, the newest) has no IPv6, local-MFA or
 * hostname-collision fields, so each of its updates turned the IPv6 overlay
 * off, cleared its range, and undid the dashboard's MFA and collision settings.
 * The audit log shows it: "Account IPv6 overlay disabled" on the first run
 * (2026-11-03), the range cleared and MFA off again on 2026-11-05.
 *
 * WHAT IT DOES. Reads the account, overlays the fields below on the settings
 * exactly as read, and PUTs the whole object back, so every field it does not
 * own (the provider's included) goes back unchanged. It is created after the
 * provider's resource and its diff reads the live account, so whenever the
 * provider has wiped something, the same run puts it back.
 *
 * Deleting this resource does nothing: the settings stay as they are.
 */
import * as pulumi from "@pulumi/pulumi";

export interface NetbirdAccountSettingsOverridesArgs {
  /** `https://netbird.<root domain>`. */
  managementUrl: pulumi.Input<string>;
  /** An admin PAT. Pass `globals.netbirdApi` whole for both fields. */
  token: pulumi.Input<string>;
  /** Peers in these groups get IPv6 overlay addresses. Empty turns the overlay off. */
  ipv6EnabledGroups: pulumi.Input<pulumi.Input<string>[]>;
  /**
   * The overlay's IPv6 range. Pinned: with none set, NetBird allocates a random
   * /64 whenever the overlay comes on (types.AllocateIPv6Subnet), so every reset
   * would renumber every peer.
   */
  networkRangeV6: pulumi.Input<string>;
  /** MFA for the embedded IdP's local users. */
  localMfaEnabled: pulumi.Input<boolean>;
  /** Refuse a peer that would take a hostname another peer already has. */
  peerHostnameCollisionRejected: pulumi.Input<boolean>;
}

interface ProviderInputs {
  managementUrl: string;
  token: string;
  ipv6EnabledGroups: string[];
  networkRangeV6: string;
  localMfaEnabled: boolean;
  peerHostnameCollisionRejected: boolean;
}

/** The settings object as GET /api/accounts returns it, and as PUT takes it back. */
export type LiveSettings = Record<string, unknown> & {
  ipv6_enabled_groups?: string[] | null;
  network_range_v6?: string | null;
  local_mfa_enabled?: boolean | null;
  peer_hostname_collision_rejected?: boolean | null;
};

export interface LiveAccount {
  id: string;
  settings: LiveSettings;
}

export type Overrides = Omit<ProviderInputs, "managementUrl" | "token">;

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i]);

/** The names of the owned fields whose live value differs from `wanted`. Empty: nothing to write. */
export function settingsDrift(live: LiveSettings, wanted: Overrides): string[] {
  const drift: string[] = [];
  if (!sameSet(live.ipv6_enabled_groups ?? [], wanted.ipv6EnabledGroups)) drift.push("ipv6_enabled_groups");
  if ((live.network_range_v6 ?? "") !== wanted.networkRangeV6) drift.push("network_range_v6");
  if ((live.local_mfa_enabled ?? false) !== wanted.localMfaEnabled) drift.push("local_mfa_enabled");
  if ((live.peer_hostname_collision_rejected ?? false) !== wanted.peerHostnameCollisionRejected) drift.push("peer_hostname_collision_rejected");
  return drift;
}

/** The PUT body: the settings exactly as read, with the owned fields overlaid. */
export function overlaidSettings(live: LiveSettings, wanted: Overrides): LiveSettings {
  return {
    ...live,
    ipv6_enabled_groups: [...wanted.ipv6EnabledGroups],
    network_range_v6: wanted.networkRangeV6,
    local_mfa_enabled: wanted.localMfaEnabled,
    peer_hostname_collision_rejected: wanted.peerHostnameCollisionRejected,
  };
}

async function netbirdRequest(inputs: ProviderInputs, method: "GET" | "PUT", path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${inputs.managementUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Token ${inputs.token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // Never the body: a settings echo is harmless, but an error page is not ours to log.
    throw new Error(`NetBird ${method} ${path}: HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function liveAccount(inputs: ProviderInputs): Promise<LiveAccount> {
  const accounts = (await netbirdRequest(inputs, "GET", "/api/accounts")) as LiveAccount[];
  if (accounts.length !== 1) throw new Error(`NetBird GET /api/accounts returned ${accounts.length} accounts; expected exactly one`);
  return accounts[0];
}

async function apply(inputs: ProviderInputs): Promise<string[]> {
  const account = await liveAccount(inputs);
  const drift = settingsDrift(account.settings, inputs);
  if (drift.length === 0) return [];
  await netbirdRequest(inputs, "PUT", `/api/accounts/${account.id}`, { settings: overlaidSettings(account.settings, inputs) });
  return drift;
}

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    const corrected = await apply(inputs);
    return { id: "netbird-account-settings-overrides", outs: { ...inputs, corrected } };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    // Field by field: `olds` are the previous outputs, which carry more than
    // the inputs (`corrected`, and the dynamic provider's own `__provider`).
    if (olds.managementUrl !== news.managementUrl || olds.token !== news.token) return { changes: true };
    if (settingsDrift(overlaidSettings({}, olds), news).length > 0) return { changes: true };
    // Unchanged inputs: still put back whatever the provider (or the
    // dashboard) has reset since the last run.
    return { changes: settingsDrift((await liveAccount(news)).settings, news).length > 0 };
  },
  async update(_id: string, _olds: ProviderInputs, news: ProviderInputs) {
    const corrected = await apply(news);
    return { outs: { ...news, corrected } };
  },
  async delete() {
    // Intentionally nothing; see the header.
  },
};

export class NetbirdAccountSettingsOverrides extends pulumi.dynamic.Resource {
  /** The fields the last create or update found reset and wrote back. */
  public declare readonly corrected: pulumi.Output<string[]>;

  constructor(name: string, args: NetbirdAccountSettingsOverridesArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, { ...args, corrected: undefined }, { additionalSecretOutputs: ["token"], ...opts });
  }
}

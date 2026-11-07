/**
 * Grants one Technitium user View on EVERY zone the cluster primary hosts,
 * and touches nothing else on those zones' permissions
 * (stacks/unifi-network/technitium-mcp-token.ts).
 *
 * The provider has no zone-permission resource, so this calls the admin API
 * directly (APIDOCS.md, "List Zones", "Get Zone Permissions", "Set Zone
 * Permissions"):
 *
 * 1. `GET /api/zones/list`, with no `pageNumber`, which returns every zone in
 *    one response: primary, secondary, stub, forwarder, secondary forwarder,
 *    catalog and secondary catalog alike. The list is filtered to zones the
 *    caller can View; the admin key can View all of them, because the server
 *    re-adds Administrators to every zone's permissions at startup
 *    (DnsServerCore/DnsWebService.cs `InspectAndFixZonePermissions`).
 * 2. `GET /api/zones/permissions/get?zone=` for each zone.
 * 3. `GET /api/zones/permissions/set` only for a zone whose row for this user
 *    is missing or is not exactly View.
 *
 * `set` REPLACES a list wholesale. Each of `userPermissions` and
 * `groupPermissions` is a pipe-separated table of
 * `name|canView|canModify|canDelete` rows, and the server syncs the zone to
 * exactly what it was sent (`Permission.SyncPermissions`,
 * DnsServerCore/WebServiceAuthApi.cs `SetPermissionsDetails`). So every user
 * and group row read back is sent back unchanged and only this user's row is
 * added or rewritten. The group table is re-sent even though the current
 * source would leave it alone if it were omitted: re-sending is a no-op on
 * any version (the server pins Administrators and DNS Administrators to full
 * on every write anyway).
 *
 * The row is set to View only. A hand grant of Modify or Delete to this user
 * is drift and is taken back; this user exists to read.
 *
 * ZONES THAT ARE SKIPPED, deterministically, by eligibleZoneNames():
 * - the root zone (name `""`): the permission calls read the zone from a
 *   required `zone` parameter that rejects an empty value, so the root zone
 *   cannot be addressed by them at all;
 * - built-in zones flagged `internal: true` (`localhost`, `0.in-addr.arpa`,
 *   `127.in-addr.arpa`, `255.in-addr.arpa`, the `::1` ip6.arpa zone). Older
 *   servers list them with that flag; nothing in them is worth reading, and
 *   leaving them alone means a permission write never lands on a zone the
 *   server manages itself. The current server source neither emits the flag
 *   nor refuses a permission edit on any zone, so on a current server they
 *   are either absent or treated like any other zone.
 *
 * A ZONE THAT DISAPPEARS between the list and a get/set is skipped. Deleting
 * a zone deletes its permissions, after which the permission calls answer
 * "Access was denied." even to an admin (no sub-item permission is left to
 * permit it). That message alone is ambiguous, so the zone is treated as gone
 * only when a fresh list no longer has it; otherwise the error stands.
 *
 * Its diff reads every zone live, so a new zone, or a row removed or widened
 * by hand, is fixed on the next run. State holds only the sorted names of the
 * zones covered and their count, never the permission tables. `set` silently
 * skips a username it does not know, so a write checks the row landed.
 * Delete removes only this user's row, from every zone that has one.
 *
 * Writes go to the cluster primary; the server notifies the secondaries
 * itself after a permission change. A zone that exists only on a secondary
 * node is not in the primary's list and is not covered.
 */
import * as pulumi from "@pulumi/pulumi";

export interface TechnitiumUserZoneViewArgs {
  /** The primary's admin API, `https://host:port` (globals.technitiumServerUrl). */
  serverUrl: pulumi.Input<string>;
  /** Name to validate the TLS certificate against, when it differs from the URL's host (globals.technitiumTlsServerName). */
  tlsServerName?: pulumi.Input<string>;
  /** An admin API token (globals.technitiumCredential.credential). */
  apiToken: pulumi.Input<string>;
  username: pulumi.Input<string>;
}

interface ProviderInputs {
  serverUrl: string;
  tlsServerName?: string;
  apiToken: string;
  username: string;
}

interface ProviderOutputs extends ProviderInputs {
  /** Sorted names of the zones the user has View on. */
  zones: string[];
  zoneCount: number;
}

/** One row of a permission table: a user or group and its three flags. */
export interface PermissionRow {
  name: string;
  canView: boolean;
  canModify: boolean;
  canDelete: boolean;
}

/** `/api/zones/permissions/get` response body, the parts read here. */
export interface ZonePermissionsResponse {
  userPermissions?: { username: string; canView: boolean; canModify: boolean; canDelete: boolean }[] | null;
  groupPermissions?: { name: string; canView: boolean; canModify: boolean; canDelete: boolean }[] | null;
}

/** `/api/zones/list` response body, the parts read here. */
export interface ZoneListResponse {
  zones?: { name: string; type?: string; internal?: boolean | null }[] | null;
}

export interface ZonePermissionTables {
  users: PermissionRow[];
  groups: PermissionRow[];
}

export function permissionTables(response: ZonePermissionsResponse): ZonePermissionTables {
  return {
    users: (response.userPermissions ?? []).map(row => ({ name: row.username, canView: row.canView, canModify: row.canModify, canDelete: row.canDelete })),
    groups: (response.groupPermissions ?? []).map(row => ({ name: row.name, canView: row.canView, canModify: row.canModify, canDelete: row.canDelete })),
  };
}

/**
 * The zones to act on, lowercased, de-duplicated and sorted: every listed
 * zone except the root zone and the built-in `internal` ones (see the header).
 */
export function eligibleZoneNames(response: ZoneListResponse): string[] {
  const names = new Set<string>();
  for (const zone of response.zones ?? []) {
    if (zone.internal === true) continue;
    const name = zone.name.replace(/\.+$/, "").toLowerCase();
    if (name.length === 0) continue;
    names.add(name);
  }
  return [...names].sort();
}

/** The wire format `set` takes: `name|canView|canModify|canDelete`, rows joined by `|`. */
export function formatPermissionTable(rows: PermissionRow[]): string {
  return rows
    .map(row => {
      if (row.name.includes("|")) throw new Error(`Technitium permission row name contains '|': ${row.name}`);
      return [row.name, row.canView, row.canModify, row.canDelete].join("|");
    })
    .join("|");
}

/** The inverse of formatPermissionTable, the way the server reads it (4 fields per row, empty names skipped). */
export function parsePermissionTable(table: string): PermissionRow[] {
  const parts = table.split("|");
  const rows: PermissionRow[] = [];
  for (let i = 0; i + 3 < parts.length; i += 4) {
    if (parts[i].length === 0) continue;
    rows.push({ name: parts[i], canView: parts[i + 1].toLowerCase() === "true", canModify: parts[i + 2].toLowerCase() === "true", canDelete: parts[i + 3].toLowerCase() === "true" });
  }
  return rows;
}

// Technitium lowercases usernames on create and matches them case-insensitively.
const sameUser = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isViewOnly = (row: PermissionRow) => row.canView && !row.canModify && !row.canDelete;

/**
 * The user table with `username` on View only, or undefined when it already
 * is. Every other row is kept as it was, in its place.
 */
export function withViewOnly(users: PermissionRow[], username: string): PermissionRow[] | undefined {
  const index = users.findIndex(row => sameUser(row.name, username));
  if (index >= 0 && isViewOnly(users[index])) return undefined;
  const ours: PermissionRow = { name: index >= 0 ? users[index].name : username, canView: true, canModify: false, canDelete: false };
  return index >= 0 ? users.map((row, i) => (i === index ? ours : row)) : [...users, ours];
}

/** The user table without `username`, or undefined when it has no row. */
export function withoutUser(users: PermissionRow[], username: string): PermissionRow[] | undefined {
  if (!users.some(row => sameUser(row.name, username))) return undefined;
  return users.filter(row => !sameUser(row.name, username));
}

/** The zones in a live survey whose row for `username` is missing or not exactly View. */
export function zonesNeedingView(survey: { zone: string; tables: ZonePermissionTables }[], username: string): string[] {
  return survey.filter(entry => withViewOnly(entry.tables.users, username) !== undefined).map(entry => entry.zone);
}

/** The `set` query: the zone, the new user table, and the group table exactly as read. */
export function setPermissionsQuery(zone: string, tables: ZonePermissionTables): Record<string, string> {
  return { zone, userPermissions: formatPermissionTable(tables.users), groupPermissions: formatPermissionTable(tables.groups) };
}

/**
 * Whether a permission call's error is what a zone that no longer exists
 * produces: "Access was denied." once its permissions went with it, or "No
 * permissions exists for section" should the zone's entry be gone but the
 * caller still permitted. Only a hint: the caller confirms with a fresh list.
 */
export function looksLikeZoneGone(message: string): boolean {
  return /Access was denied|No permissions exists for section/i.test(message);
}

async function technitiumRequest<T>(inputs: ProviderInputs, path: string, query: Record<string, string>): Promise<T> {
  // Imported here, not at the top: Pulumi serializes the provider with its
  // closure, and a function that captures nothing but its own code is the
  // shape every other dynamic provider here has (they use the global fetch,
  // which cannot override the TLS server name).
  const https = await import("node:https");
  const url = new URL(`${inputs.serverUrl.replace(/\/+$/, "")}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const body = await new Promise<string>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${inputs.apiToken}`, Accept: "application/json" },
        // Same override as the provider's `tlsServerName`: the URL is the
        // tailnet name, the certificate is for the real hostname.
        ...(inputs.tlsServerName ? { servername: inputs.tlsServerName } : {}),
        timeout: 30_000,
      },
      response => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 0) >= 400) reject(new Error(`Technitium ${path}: HTTP ${response.statusCode}`));
          else resolve(text);
        });
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error(`Technitium ${path}: timed out`)));
    request.on("error", reject);
    request.end();
  });

  // Technitium answers 200 with `status` carrying the outcome: "ok", "error"
  // (with errorMessage) or "invalid-token".
  const json = JSON.parse(body) as { status: string; errorMessage?: string; response?: T };
  const target = query.zone === undefined ? "" : ` (${query.zone})`;
  if (json.status !== "ok") throw new Error(`Technitium ${path}${target}: ${json.status}${json.errorMessage ? `: ${json.errorMessage}` : ""}`);
  return (json.response ?? {}) as T;
}

async function listZones(inputs: ProviderInputs): Promise<string[]> {
  return eligibleZoneNames(await technitiumRequest<ZoneListResponse>(inputs, "/api/zones/list", {}));
}

/** A permission call on `zone`, or undefined when the zone has gone since it was listed. */
async function onZone(inputs: ProviderInputs, zone: string, path: string, query: Record<string, string>): Promise<ZonePermissionTables | undefined> {
  try {
    return permissionTables(await technitiumRequest<ZonePermissionsResponse>(inputs, path, query));
  } catch (error) {
    if (error instanceof Error && looksLikeZoneGone(error.message) && !(await listZones(inputs)).includes(zone)) return undefined;
    throw error;
  }
}

const readZone = (inputs: ProviderInputs, zone: string) => onZone(inputs, zone, "/api/zones/permissions/get", { zone });

const writeUsers = (inputs: ProviderInputs, zone: string, tables: ZonePermissionTables, users: PermissionRow[]) =>
  onZone(inputs, zone, "/api/zones/permissions/set", setPermissionsQuery(zone, { users, groups: tables.groups }));

/** Every listed zone that still exists, with its permission tables. Sequential: a handful of zones, and no reason to hammer the primary. */
async function survey(inputs: ProviderInputs): Promise<{ zone: string; tables: ZonePermissionTables }[]> {
  const entries: { zone: string; tables: ZonePermissionTables }[] = [];
  for (const zone of await listZones(inputs)) {
    const tables = await readZone(inputs, zone);
    if (tables) entries.push({ zone, tables });
  }
  return entries;
}

/** Gives the user View on every zone; returns the sorted zones covered. */
async function grantAll(inputs: ProviderInputs): Promise<ProviderOutputs> {
  const zones: string[] = [];
  for (const { zone, tables } of await survey(inputs)) {
    const users = withViewOnly(tables.users, inputs.username);
    if (users) {
      const written = await writeUsers(inputs, zone, tables, users);
      if (!written) continue;
      if (withViewOnly(written.users, inputs.username)) {
        throw new Error(`Technitium did not keep View for ${inputs.username} on ${zone}; it drops rows for users it does not have`);
      }
    }
    zones.push(zone);
  }
  return { ...inputs, zones, zoneCount: zones.length };
}

const sameList = (a: string[] | undefined, b: string[]) => (a ?? []).length === b.length && b.every((name, i) => a?.[i] === name);

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    return { id: `zone-view/${inputs.username}`, outs: await grantAll(inputs) };
  },
  async diff(_id: string, olds: ProviderOutputs, news: ProviderInputs) {
    if (olds.username !== news.username) return { changes: true, replaces: ["username"], deleteBeforeReplace: true };
    if (olds.serverUrl !== news.serverUrl || olds.tlsServerName !== news.tlsServerName || olds.apiToken !== news.apiToken) return { changes: true };
    // Unchanged inputs: a zone added since, or a row edited or removed by
    // hand, needs fixing; a zone deleted since only needs the state updated.
    const live = await survey(news);
    const covered = live.map(entry => entry.zone);
    return { changes: zonesNeedingView(live, news.username).length > 0 || !sameList(olds.zones, covered) };
  },
  async update(_id: string, _olds: ProviderOutputs, news: ProviderInputs) {
    return { outs: await grantAll(news) };
  },
  async delete(_id: string, olds: ProviderOutputs) {
    for (const { zone, tables } of await survey(olds)) {
      const users = withoutUser(tables.users, olds.username);
      if (users) await writeUsers(olds, zone, tables, users);
    }
  },
};

export class TechnitiumUserZoneView extends pulumi.dynamic.Resource {
  public declare readonly zones: pulumi.Output<string[]>;
  public declare readonly zoneCount: pulumi.Output<number>;

  constructor(name: string, args: TechnitiumUserZoneViewArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, { ...args, zones: undefined, zoneCount: undefined }, { additionalSecretOutputs: ["apiToken"], ...opts });
  }
}

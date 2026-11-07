/**
 * Grants one Technitium user View on one zone, and touches nothing else on
 * that zone's permissions (stacks/unifi-network/technitium-mcp-token.ts).
 *
 * The provider has no zone-permission resource, so this calls the admin API
 * directly: `GET /api/zones/permissions/get` to read the zone's rows, then
 * `GET /api/zones/permissions/set` with the merged tables (APIDOCS.md, "Get
 * Zone Permissions" / "Set Zone Permissions").
 *
 * `set` REPLACES a list wholesale. Each of `userPermissions` and
 * `groupPermissions` is a pipe-separated table of `name|canView|canModify|canDelete`
 * rows, and the server syncs the zone to exactly what it was sent
 * (`Permission.SyncPermissions`, DnsServerCore/WebServiceAuthApi.cs
 * `SetPermissionsDetails`). So every user and group row read back is sent
 * back unchanged and only this user's row is added or rewritten. The group
 * table is re-sent even though the server would leave it alone if it were
 * omitted: that holds only for the current source, and re-sending is a no-op
 * on any version (the server pins Administrators and DNS Administrators to
 * full on every write anyway).
 *
 * The row is set to View only. A hand grant of Modify or Delete to this user
 * is drift and is taken back; this user exists to read.
 *
 * Its diff reads the live zone, so a row removed in the UI comes back on the
 * next run. Delete removes only this user's row, and treats a zone that is
 * already gone as done. `set` silently skips a username it does not know,
 * so create checks the row actually landed.
 *
 * Writes go to the cluster primary; the server notifies the secondaries
 * itself after a permission change.
 */
import * as pulumi from "@pulumi/pulumi";

export interface TechnitiumZoneViewPermissionArgs {
  /** The primary's admin API, `https://host:port` (globals.technitiumServerUrl). */
  serverUrl: pulumi.Input<string>;
  /** Name to validate the TLS certificate against, when it differs from the URL's host (globals.technitiumTlsServerName). */
  tlsServerName?: pulumi.Input<string>;
  /** An admin API token (globals.technitiumCredential.credential). */
  apiToken: pulumi.Input<string>;
  zone: pulumi.Input<string>;
  username: pulumi.Input<string>;
}

interface ProviderInputs {
  serverUrl: string;
  tlsServerName?: string;
  apiToken: string;
  zone: string;
  username: string;
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

/** The `set` query: the zone, the new user table, and the group table exactly as read. */
export function setPermissionsQuery(zone: string, tables: ZonePermissionTables): Record<string, string> {
  return { zone, userPermissions: formatPermissionTable(tables.users), groupPermissions: formatPermissionTable(tables.groups) };
}

async function technitiumRequest(inputs: ProviderInputs, path: string, query: Record<string, string>): Promise<ZonePermissionsResponse> {
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
  const json = JSON.parse(body) as { status: string; errorMessage?: string; response?: ZonePermissionsResponse };
  if (json.status !== "ok") throw new Error(`Technitium ${path} (${query.zone}): ${json.status}${json.errorMessage ? `: ${json.errorMessage}` : ""}`);
  return json.response ?? {};
}

async function liveTables(inputs: ProviderInputs): Promise<ZonePermissionTables> {
  return permissionTables(await technitiumRequest(inputs, "/api/zones/permissions/get", { zone: inputs.zone }));
}

async function writeUsers(inputs: ProviderInputs, tables: ZonePermissionTables, users: PermissionRow[]): Promise<ZonePermissionTables> {
  return permissionTables(await technitiumRequest(inputs, "/api/zones/permissions/set", setPermissionsQuery(inputs.zone, { users, groups: tables.groups })));
}

async function grant(inputs: ProviderInputs): Promise<void> {
  const tables = await liveTables(inputs);
  const users = withViewOnly(tables.users, inputs.username);
  if (!users) return;
  const written = await writeUsers(inputs, tables, users);
  if (withViewOnly(written.users, inputs.username)) {
    throw new Error(`Technitium did not keep View for ${inputs.username} on ${inputs.zone}; it drops rows for users it does not have`);
  }
}

const provider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: ProviderInputs) {
    await grant(inputs);
    return { id: `${inputs.zone}/${inputs.username}`, outs: inputs };
  },
  async diff(_id: string, olds: ProviderInputs, news: ProviderInputs) {
    if (olds.zone !== news.zone || olds.username !== news.username) return { changes: true, replaces: olds.zone !== news.zone ? ["zone"] : ["username"], deleteBeforeReplace: true };
    if (olds.serverUrl !== news.serverUrl || olds.tlsServerName !== news.tlsServerName || olds.apiToken !== news.apiToken) return { changes: true };
    // Unchanged inputs: still put the row back if it was edited or removed by hand.
    const tables = await liveTables(news);
    return { changes: withViewOnly(tables.users, news.username) !== undefined };
  },
  async update(_id: string, _olds: ProviderInputs, news: ProviderInputs) {
    await grant(news);
    return { outs: news };
  },
  async delete(_id: string, olds: ProviderInputs) {
    let tables: ZonePermissionTables;
    try {
      tables = await liveTables(olds);
    } catch (error) {
      // A deleted zone took its permissions with it.
      // The server answers `No permissions exists for section: Zones/<zone>`.
      if (error instanceof Error && /No permissions exists/i.test(error.message)) return;
      throw error;
    }
    const users = withoutUser(tables.users, olds.username);
    if (users) await writeUsers(olds, tables, users);
  },
};

export class TechnitiumZoneViewPermission extends pulumi.dynamic.Resource {
  constructor(name: string, args: TechnitiumZoneViewPermissionArgs, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, args, { additionalSecretOutputs: ["apiToken"], ...opts });
  }
}

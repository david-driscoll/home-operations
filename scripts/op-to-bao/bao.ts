/**
 * Minimal OpenBao KV v2 client.
 *
 * Hand-rolled against the REST API rather than pulling in node-vault: the
 * surface we need is four calls, and this avoids adding a dependency to the
 * root workspace for a script that runs a handful of times during migration.
 *
 * Auth comes from the standard OpenBao CLI variables so `bao login` and this
 * script share one credential:
 *   BAO_ADDR   server URL
 *   BAO_TOKEN  token
 */

export interface KvReadResult {
  data: Record<string, unknown>;
  metadata: {
    version: number;
    created_time: string;
    custom_metadata: Record<string, string> | null;
    [key: string]: unknown;
  };
}

export class BaoClient {
  private readonly addr: string;
  private readonly token: string;

  constructor(addr = process.env.BAO_ADDR, token = process.env.BAO_TOKEN) {
    if (!addr) throw new Error("BAO_ADDR is not set");
    if (!token) throw new Error("BAO_TOKEN is not set");
    this.addr = addr.replace(/\/+$/, "");
    this.token = token;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.addr}/v1/${path}`, {
      method,
      headers: {
        "X-Vault-Token": this.token,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 404) return undefined;
    if (!res.ok) {
      // The body carries OpenBao's `errors` array, which is far more useful
      // than the status alone — surface it rather than swallowing it.
      const detail = await res.text().catch(() => "");
      throw new Error(`${method} ${path} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
    }
    if (res.status === 204) return undefined;
    return res.json();
  }

  /** Read the latest version of a secret. Returns undefined if absent. */
  public async read(mount: string, path: string): Promise<KvReadResult | undefined> {
    const res = (await this.request("GET", `${mount}/data/${path}`)) as { data?: KvReadResult } | undefined;
    return res?.data;
  }

  /**
   * Write a secret version.
   *
   * `cas` makes this safe to re-run: pass 0 to create only if absent, or the
   * version you read to update only if nothing changed underneath. Without it
   * a concurrent writer is silently clobbered.
   */
  public async write(mount: string, path: string, data: Record<string, unknown>, cas?: number): Promise<void> {
    await this.request("POST", `${mount}/data/${path}`, {
      data,
      ...(cas === undefined ? {} : { options: { cas } }),
    });
  }

  /**
   * Replace a secret's custom_metadata.
   *
   * Note this is key-scoped, not version-scoped — it applies to every version
   * and does not roll back with one. Provenance labels only; never values.
   * OpenBao caps this at 64 keys, 128-char keys, 512-char values.
   */
  public async writeCustomMetadata(mount: string, path: string, customMetadata: Record<string, string>): Promise<void> {
    await this.request("POST", `${mount}/metadata/${path}`, { custom_metadata: customMetadata });
  }

  /**
   * List child keys under a path prefix. Returns [] if the prefix is absent.
   *
   * Uses `GET ?list=true` rather than the `LIST` verb. Both work against
   * OpenBao (http/logical_test.go covers the query form explicitly), but LIST
   * is not a registered HTTP method — Node's own parser rejects it outright
   * (`http.METHODS` has no "LIST"), and intermediate proxies often do too.
   */
  public async list(mount: string, prefix: string): Promise<string[]> {
    const clean = prefix.replace(/\/+$/, "");
    const res = (await this.request("GET", `${mount}/metadata/${clean}?list=true`)) as
      | { data?: { keys?: string[] } }
      | undefined;
    // Sort explicitly: LIST ordering is not guaranteed, and callers derive
    // Pulumi inputs from it — unsorted output means spurious diffs.
    return (res?.data?.keys ?? []).sort((a, b) => a.localeCompare(b));
  }
}

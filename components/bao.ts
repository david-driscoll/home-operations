/**
 * OpenBao KV v2 for Pulumi — the Phase 8a write path of the 1Password→OpenBao
 * migration (vault repo: docs/openbao-migration/PLAN.md §G).
 *
 * Two things live here:
 *
 * 1. `BaoClient` — the minimal KV v2 REST client. This is the long-lived home
 *    of the client that started life in `scripts/op-to-bao/bao.ts` (that file
 *    now re-exports from here); the migration script gets deleted after
 *    Phase 11, this component does not.
 *
 * 2. `BaoKvSecret` — a Pulumi dynamic resource that writes a secret to a KV v2
 *    path, following the same dynamic-provider pattern as
 *    `dynamic/1password/OnePasswordItem.ts`.
 *
 * ## Authentication: BAO_ADDR + BAO_TOKEN environment variables
 *
 * Deliberately env-based rather than Pulumi config, for the same reason
 * `OPClient` reads CONNECT_HOST/CONNECT_TOKEN from the environment:
 *
 * - Dynamic-provider callbacks are serialized closures executed at operation
 *   time; `process.env` is the only channel that is dependable both during
 *   `pulumi up` and during a later `pulumi destroy` run from different code.
 * - BAO_ADDR/BAO_TOKEN are the standard OpenBao CLI variables, so `bao login`,
 *   the op-to-bao migration script, and these resources all share one
 *   credential. Mint the token from the `pulumi` AppRole
 *   (vault repo: bootstrap/openbao/pulumi-approle.sops.yaml).
 * - `.mise.toml` already provides secret-backed env vars; adding BAO_* there
 *   follows the existing pattern without teaching every stack a new config key.
 *
 * The env vars are only required when an operation actually touches OpenBao —
 * `pulumi preview` does not invoke create/update/delete and works without them.
 *
 * ## Dual-run rule (until Phase 11)
 *
 * 1Password stays authoritative. `BaoKvSecret` is written ALONGSIDE the
 * existing `OnePasswordItem` at every generation site, never instead of it.
 * Rolling back Phase 8a must be a plain `git revert` of the wiring commit.
 */

import * as pulumi from "@pulumi/pulumi";

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
   * Permanently remove a secret: every version plus its metadata.
   * (KV v2 `DELETE <mount>/metadata/<path>` — this is the real delete, not the
   * soft-delete of the latest version.)
   */
  public async destroy(mount: string, path: string): Promise<void> {
    await this.request("DELETE", `${mount}/metadata/${path}`);
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
    const res = (await this.request("GET", `${mount}/metadata/${clean}?list=true`)) as { data?: { keys?: string[] } } | undefined;
    // Sort explicitly: LIST ordering is not guaranteed, and callers derive
    // Pulumi inputs from it — unsorted output means spurious diffs.
    return (res?.data?.keys ?? []).sort((a, b) => a.localeCompare(b));
  }
}

// ---------------------------------------------------------------------------
// Canonical path derivation (PLAN.md §A path scheme)
// ---------------------------------------------------------------------------

/**
 * lowercase, non-alphanumerics collapsed to a single dash, trimmed.
 *
 * MUST stay byte-identical to `slug()` in `scripts/op-to-bao/mapping.ts` —
 * both derive the same OpenBao paths from 1Password titles, and a divergence
 * would silently split one credential across two paths. A test in
 * `scripts/op-to-bao/bao-paths.test.ts` asserts the two agree.
 */
export function baoSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonical OpenBao path (within the `secrets` mount) for a generated OIDC
 * credential — the dual-write twin of the 1Password item titled
 * `<clusterKey>-<appName>-oidc-credentials`.
 *
 * Taking clusterKey and appName as separate arguments (rather than re-parsing
 * the title) sidesteps the title-regex ambiguity for dashed cluster keys like
 * `alpha-site`, where `/^(.+?)-(.+)-oidc-credentials$/` splits at the wrong
 * dash.
 */
export function oidcBaoPath(clusterKey: string, appName: string): string {
  return `clusters/${clusterKey}/apps/${baoSlug(appName)}/oidc`;
}

/**
 * Canonical OpenBao path (within the `secrets` mount) for a PBS credential
 * item, from its 1Password title — matches the `tag:pbs` rule in
 * `scripts/op-to-bao/mapping.ts` (`hosts/pbs/<slug(title)>`).
 */
export function pbsBaoPath(title: string): string {
  return `hosts/pbs/${baoSlug(title)}`;
}

/**
 * Standard custom_metadata provenance for Pulumi-generated secrets, mirroring
 * the op-to-bao convention: labels about the secret live in custom_metadata,
 * values consumers need live in data (vals cannot read metadata).
 */
export function baoProvenance(extra: Record<string, pulumi.Input<string>> = {}): Record<string, pulumi.Input<string>> {
  return {
    source: "pulumi",
    managed_by: "pulumi",
    pulumi_project: pulumi.runtime.getProject(),
    pulumi_stack: pulumi.runtime.getStack(),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// BaoKvSecret dynamic resource
// ---------------------------------------------------------------------------

export interface BaoKvSecretInputs {
  /** KV v2 mount name, e.g. `secrets`. */
  mount: pulumi.Input<string>;
  /** Path within the mount, no leading slash, e.g. `clusters/equestria/apps/headlamp/oidc`. */
  path: pulumi.Input<string>;
  /**
   * Secret payload. Nested objects become nested KV data (the section shape
   * op-to-bao uses). Always stored encrypted in Pulumi state — the resource
   * wraps this in `pulumi.secret()`.
   */
  data: pulumi.Input<Record<string, unknown>>;
  /** Provenance labels only, never values. See `baoProvenance()`. */
  customMetadata?: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

interface BaoKvSecretProviderInputs {
  mount: string;
  path: string;
  data: Record<string, unknown>;
  customMetadata?: Record<string, string>;
}

class BaoKvSecretProvider implements pulumi.dynamic.ResourceProvider {
  private client() {
    try {
      return new BaoClient();
    } catch (error) {
      throw new Error(`${(error as Error).message} — BaoKvSecret needs BAO_ADDR and BAO_TOKEN in the environment. Mint a token from the pulumi AppRole (vault repo: bootstrap/openbao/pulumi-approle.sops.yaml).`);
    }
  }

  private async apply(inputs: BaoKvSecretProviderInputs) {
    const client = this.client();
    await client.write(inputs.mount, inputs.path, inputs.data);
    if (inputs.customMetadata && Object.keys(inputs.customMetadata).length > 0) {
      await client.writeCustomMetadata(inputs.mount, inputs.path, inputs.customMetadata);
    }
  }

  async create(inputs: BaoKvSecretProviderInputs): Promise<pulumi.dynamic.CreateResult> {
    await this.apply(inputs);
    return { id: `${inputs.mount}/${inputs.path}`, outs: inputs };
  }

  async update(_id: string, _olds: BaoKvSecretProviderInputs, news: BaoKvSecretProviderInputs): Promise<pulumi.dynamic.UpdateResult> {
    await this.apply(news);
    return { outs: news };
  }

  async delete(_id: string, props: BaoKvSecretProviderInputs): Promise<void> {
    await this.client().destroy(props.mount, props.path);
  }
}

/**
 * A secret written to OpenBao KV v2 at `<mount>/<path>`.
 *
 * A mount+path change is a replace (the old path is destroyed); a data or
 * metadata change is an in-place new secret version.
 */
export class BaoKvSecret extends pulumi.dynamic.Resource {
  constructor(name: string, props: BaoKvSecretInputs, opts?: pulumi.CustomResourceOptions) {
    super(
      new BaoKvSecretProvider(),
      name,
      { ...props, data: pulumi.secret(props.data) },
      {
        replaceOnChanges: ["mount", "path"],
        deleteBeforeReplace: false,
        additionalSecretOutputs: ["data"],
        ...opts,
      },
    );
  }
}

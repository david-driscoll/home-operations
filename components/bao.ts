/**
 * OpenBao KV v2 for Pulumi — the Phase 8a write path of the 1Password→OpenBao
 * migration (vault repo: docs/openbao-migration/PLAN.md §G).
 *
 * Two things live here:
 *
 * 1. `BaoClient` — the minimal KV v2 REST client. This is the long-lived home
 *    of the client that started life in `scripts/op-to-bao/bao.ts` (that file
 *    now re-exports from here); the migration script gets deleted after
 *    Phase 11, this component does not. It is for imperative callers (the
 *    migration tool); Pulumi resources go through the provider below.
 *
 * 2. `baoKvSecret()` — a thin factory over `vault.kv.SecretV2` from the
 *    official Pulumi Vault provider. OpenBao is an API-compatible Vault fork,
 *    so the upstream provider drives it directly: real diffing against the
 *    live secret, import support, and provider-managed state, none of which a
 *    hand-rolled dynamic resource gets for free.
 *
 * ## Authentication
 *
 * The provider itself is constructed once in `components/globals.ts`
 * (`GlobalResources.baoProvider`) like every other provider in this repo, and
 * reads BAO_ADDR / BAO_TOKEN from the environment — the standard OpenBao CLI
 * variables, so `bao`, the op-to-bao migration script and Pulumi all share one
 * credential. Mint the token from the `pulumi` AppRole (vault repo:
 * bootstrap/openbao/pulumi-approle.sops.yaml).
 *
 * ## Dual-run rule (until Phase 11)
 *
 * 1Password stays authoritative. These secrets are written ALONGSIDE the
 * existing `OnePasswordItem` at every generation site, never instead of it.
 * Rolling back Phase 8a must be a plain `git revert` of the wiring commit.
 */

import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

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
  /**
   * Resolved lazily so an AppRole login happens on first use rather than at
   * construction — `BaoStore` is built for every stack, including the ones
   * that never read a secret, and a login there would be a network call in
   * `pulumi preview` on stacks that do not touch OpenBao.
   */
  private tokenPromise?: Promise<string>;
  private readonly staticToken?: string;
  private readonly roleId?: string;
  private readonly secretId?: string;

  constructor(addr = process.env.BAO_ADDR, token = process.env.BAO_TOKEN, roleId = process.env.BAO_ROLE_ID, secretId = process.env.BAO_SECRET_ID) {
    if (!addr) throw new Error("BAO_ADDR is not set");
    // Two ways in, matching `GlobalResources.baoProvider` exactly. They must
    // stay matched: a client that accepts only BAO_TOKEN while the provider
    // accepts the AppRole is how Phase 8a's dual-write gate silently skipped
    // every write on an AppRole run.
    if (!token && !(roleId && secretId)) {
      throw new Error('No OpenBao credentials — set BAO_TOKEN, or BAO_ROLE_ID/BAO_SECRET_ID. Run `eval "$(bootstrap/openbao/pulumi-env.sh)"` from the vault repo.');
    }
    this.addr = addr.replace(/\/+$/, "");
    this.staticToken = token || undefined;
    this.roleId = roleId || undefined;
    this.secretId = secretId || undefined;
  }

  /**
   * Exchange the AppRole for a token, once per process.
   *
   * `skipChildToken` has no analogue here because this client never mints a
   * child: the `pulumi` policy has no capability on `auth/token/create`, which
   * is the same 403 the provider works around.
   */
  private token(): Promise<string> {
    if (this.staticToken) return Promise.resolve(this.staticToken);
    this.tokenPromise ??= (async () => {
      const res = await fetch(`${this.addr}/v1/auth/approle/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_id: this.roleId, secret_id: this.secretId }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`AppRole login failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
      }
      const body = (await res.json()) as { auth?: { client_token?: string } };
      const clientToken = body.auth?.client_token;
      if (!clientToken) throw new Error("AppRole login returned no client_token");
      return clientToken;
    })();
    return this.tokenPromise;
  }

  /** The normalized server address, for handing to a child process. */
  public get address(): string {
    return this.addr;
  }

  /**
   * The session token, for handing to a child process (the `vals` resolver
   * spawns with VAULT_TOKEN set to this). Same trust domain — the child runs
   * with this process's credentials either way — and minting here keeps every
   * consumer on the one proven auth path instead of teaching each tool the
   * AppRole dance separately.
   */
  public authToken(): Promise<string> {
    return this.token();
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.addr}/v1/${path}`, {
      method,
      headers: {
        "X-Vault-Token": await this.token(),
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
 * Canonical OpenBao path (within the `secrets` mount) for a Dockge LXC item,
 * from its 1Password title — matches the `tag:dockge` rule in
 * `scripts/op-to-bao/mapping.ts` (`hosts/dockge/<slug(title)>`), which is the
 * prefix `BaoStore.getDockgeInstances` lists.
 */
export function dockgeBaoPath(title: string): string {
  return `hosts/dockge/${baoSlug(title)}`;
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
// KV v2 secret resource
// ---------------------------------------------------------------------------

export interface BaoKvSecretArgs {
  /** KV v2 mount name, e.g. `secrets`. */
  mount: pulumi.Input<string>;
  /** Path within the mount, no leading slash, e.g. `clusters/equestria/apps/headlamp/oidc`. */
  path: pulumi.Input<string>;
  /**
   * Secret payload. Nested objects become nested KV data (the section shape
   * op-to-bao uses). Serialized to `dataJson` and marked secret, so it is
   * encrypted in Pulumi state.
   */
  data: pulumi.Input<Record<string, unknown>>;
  /** Provenance labels only, never values. See `baoProvenance()`. */
  customMetadata?: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

/**
 * Write a secret to OpenBao KV v2 at `<mount>/<path>`.
 *
 * `opts.provider` must be `GlobalResources.baoProvider` — this is a
 * provider-backed resource, so without it Pulumi falls back to the ambient
 * Vault provider config and the write silently targets the wrong server (or
 * nothing at all).
 *
 * `deleteAllVersions` is on: destroying this resource must remove the secret
 * outright rather than soft-deleting the latest version and leaving the
 * ciphertext of every prior one behind.
 */
export function baoKvSecret(name: string, args: BaoKvSecretArgs, opts: pulumi.CustomResourceOptions): vault.kv.SecretV2 {
  return new vault.kv.SecretV2(
    name,
    {
      mount: args.mount,
      // SecretV2.name IS the path within the mount, not a display name.
      name: args.path,
      dataJson: pulumi.secret(pulumi.jsonStringify(args.data)),
      customMetadata: { data: args.customMetadata },
      deleteAllVersions: true,
    },
    {
      // The provider reads the secret back to detect drift, so the read-back
      // copy has to be marked secret too — otherwise values reach state (and
      // `pulumi stack export`) in the clear.
      additionalSecretOutputs: ["data", "dataJson"],
      // Dual-write is conditional while the operator has no BAO_TOKEN (see
      // GlobalResources.baoDualWriteEnabled). A run without a token drops these
      // from the program, and without this a drop would DELETE the live secret
      // — the one outcome Phase 6/7 cannot survive. Retaining orphans the
      // secret instead, which the next tokened run overwrites in place.
      retainOnDelete: true,
      ...opts,
    },
  );
}

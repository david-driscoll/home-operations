/**
 * `ref+openbao://` resolution for file content — Phase 8's PLAN §D.1 slice of
 * the 1Password→OpenBao migration (vault repo: docs/openbao-migration/PLAN.md).
 *
 * Reference syntax, exactly as PLAN §D specifies:
 *
 *     ref+openbao://secrets/<path>#/<field>
 *
 * replacing `op://Eris/<Item>/<field>`. One reference names one store by
 * construction — `op://` can only mean 1Password, `ref+openbao://` can only
 * mean OpenBao — which is what makes the two resolvers safe to run side by
 * side during the transition and is the property that kept the seal-chain key
 * out of OpenBao when virtual dispatch once sent `op://` lookups there
 * (STATUS.md, "the read seam").
 *
 * ## Resolution is `vals eval`, batched
 *
 * The unresolved references of a document are collected into one YAML doc and
 * resolved by a single `vals eval` subprocess (helmfile/vals ≥0.45 speaks
 * `ref+openbao://` natively — verified against the live server); results are
 * memoized per reference for the life of the process, so however many files
 * share a credential, vals runs once for it. `vals` comes from mise locally
 * (`.config/mise.toml [tools]`) and from the `vals` initContainer on the
 * operator's workspace pods, which exports its path as `VALS_BIN` — see
 * `kubernetes/apps/pulumi/<stack>/stack.yaml`.
 *
 * Authentication is NOT delegated to vals: `BaoClient` mints the token
 * (BAO_TOKEN, or the AppRole pair — the same two ways in as everything else)
 * and the child gets VAULT_ADDR/VAULT_TOKEN. One auth path, everywhere.
 *
 * ## Failure is an error, not a passthrough
 *
 * The `op://` resolver logs and passes the literal through, relying on the
 * `provision.sh` guard to catch it at container runtime. Here a missing path
 * or field fails the `vals eval` and therefore the Pulumi run — the guard
 * stays as defense-in-depth, but the failure belongs to the run that caused
 * it, not to the container that later boots with a literal `ref+…` as its
 * password.
 */

import { execFile } from "node:child_process";
import { type Input, type Output, output, secret } from "@pulumi/pulumi";
import * as yaml from "yaml";
import { BaoClient } from "../bao.ts";

/**
 * One reference: mount, path within the mount, field name.
 *
 * The field charset has no space on purpose: OpenBao stores 1Password field
 * names verbatim (`known hosts`), but a space savagely complicates parsing
 * inside URLs and env files, and no file-resolved reference needs one today.
 * Reference a spaced field by renaming the field, not by widening this.
 */
const REF_PATTERN = /ref\+openbao:\/\/([\w-]+)\/([\w./-]+)#\/([\w.-]+)/g;

/** How a batch of references reaches vals. Injectable for the tests. */
export type ValsExec = (doc: string, env: Record<string, string>) => Promise<string>;

export class SecretRefResolver {
  /**
   * Constructed lazily on the first reference actually seen, so building a
   * store never demands BAO_ADDR on a stack that resolves no references.
   */
  private client?: BaoClient;
  /** One vals resolution per reference per process, however many files use it. */
  private readonly resolved = new Map<string, Promise<string>>();

  constructor(
    private readonly exec: ValsExec = execVals,
    private readonly makeClient: () => BaoClient = () => new BaoClient(),
  ) {}

  /**
   * Replace every `ref+openbao://` reference in `value` with its secret value.
   *
   * The result is marked `secret()` whenever at least one reference resolved —
   * every resolved value is a credential by construction, and the containing
   * file content must not reach Pulumi state in the clear.
   */
  public resolve(value: Input<string>): Output<string> {
    return output(value).apply(v => {
      if (!hasRefs(v)) return output(v);
      return secret(output(this.resolveText(v)));
    });
  }

  /**
   * The async core `resolve` wraps: every reference in `v` replaced, or a
   * thrown error for the first batch that cannot be. Public so the failure
   * contract is testable as a plain promise — a rejected Output fans out
   * through the SDK's internal sibling promises, which only the engine
   * observes.
   */
  public async resolveText(v: string): Promise<string> {
    const refs = unique(Array.from(v.matchAll(REF_PATTERN))).map(m => m[0]);
    const pending = refs.filter(ref => !this.resolved.has(ref));
    if (pending.length > 0) this.register(pending);
    const entries = await Promise.all(refs.map(async ref => [ref, await this.resolved.get(ref)!] as const));
    const byRef = new Map(entries);
    // matchAll found every occurrence, so the replace cannot miss: every full
    // match is a key in the map.
    return v.replace(REF_PATTERN, match => byRef.get(match) as string);
  }

  /**
   * One `vals eval` for a batch of references: `{r0: ref, r1: ref, …}` in,
   * the same keys with values out. Every reference in the batch settles from
   * the one subprocess; if vals fails, they all reject with its stderr, which
   * names the path it could not read.
   */
  private register(refs: string[]): void {
    const batch = (async () => {
      this.client ??= this.makeClient();
      const doc = yaml.stringify(Object.fromEntries(refs.map((ref, i) => [`r${i}`, ref])));
      const resolvedDoc = await this.exec(doc, {
        VAULT_ADDR: this.client.address,
        VAULT_TOKEN: await this.client.authToken(),
      });
      const parsed = yaml.parse(resolvedDoc) as Record<string, unknown>;
      return refs.map((ref, i) => {
        const value = parsed[`r${i}`];
        // vals resolved it or errored the whole eval, so a non-string here is
        // a shape surprise (a nested object from a directory-style path).
        if (typeof value !== "string") throw new Error(`${ref}: vals returned ${value === undefined ? "nothing" : typeof value} rather than a string`);
        return value;
      });
    })();
    refs.forEach((ref, i) => this.resolved.set(ref, batch.then(values => values[i])));
    // A failed batch must not poison the memo forever — a retry (the operator
    // reconciles on backoff) should re-run vals, not replay the rejection.
    batch.catch(() => refs.forEach(ref => this.resolved.delete(ref)));
  }
}

/**
 * Spawn the real vals binary: `VALS_BIN` when set (the operator workspace
 * pods point it at the initContainer-installed copy), otherwise `vals` from
 * PATH (mise, locally). The batch goes in on stdin and comes back on stdout,
 * so no secret value ever touches argv or a file.
 */
function execVals(doc: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.env.VALS_BIN || "vals",
      ["eval", "-f", "-"],
      // PATH is deliberately inherited: locally that is what carries mise's
      // shims; in the workspace pod VALS_BIN is absolute and PATH is inert.
      { env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // stderr carries vals' own diagnosis (which path failed); stdout may
          // carry resolved secrets and must never reach an error message.
          reject(new Error(`vals eval failed (${error.message.split("\n")[0]}): ${stderr.trim() || "no stderr"}`));
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.end(doc);
  });
}

function hasRefs(v: string): boolean {
  // `search`, not `test`: the pattern is /g and `test` advances its
  // lastIndex, which `matchAll` in resolveText would then inherit and skip
  // the first reference. `search` neither reads nor writes lastIndex.
  return v.search(REF_PATTERN) !== -1;
}

function unique(matches: RegExpMatchArray[]): RegExpMatchArray[] {
  const seen = new Set<string>();
  return matches.filter(m => (seen.has(m[0]) ? false : (seen.add(m[0]), true)));
}

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
 * ## vals is the only parser of the reference syntax
 *
 * There is deliberately NO reference regex here. The whole document is handed
 * to `vals eval` as one YAML value (`content: <file>`), and vals expands every
 * embedded reference inside the string — helmfile/vals ≥0.45 resolves
 * `ref+openbao://` natively and expands refs mid-string, delimiting correctly
 * at quotes and line ends (verified live: a plex-style URL query, a dotenv
 * `KEY="ref+…"` line inside a block scalar, and surrounding text all survive
 * byte-for-byte). Matching the syntax ourselves would make this file a second
 * implementation of vals' grammar that silently skips whatever it gets wrong
 * — a `?version=` query, an exotic field name — and a skipped reference
 * becomes a literal credential-shaped string in a running container.
 *
 * Do NOT hand vals a raw non-YAML file instead of wrapping it: `vals eval` of
 * a bare dotenv line exits 0 with EMPTY output, which a pipeline would write
 * out as an empty file.
 *
 * A consequence to respect when WRITING files this pipeline renders:
 * references are live wherever they appear — vals does not know what a
 * comment is. A well-formed `ref+…://` URL in a comment resolves (baking a
 * secret into the rendered file) or fails the run (an unreadable one killed
 * every home-operations run the day this landed, from a Phase 2 MIGRATION
 * NOTE in bao-transit's .env). This is the envsubst-expands-in-comments
 * lesson from Phase 6, one layer up. Break the scheme apart in prose:
 * `<ref+sops scheme>://…`, never the real thing.
 *
 * One `vals eval` per document that contains references, memoized by content
 * for the life of the process. `vals` comes from mise locally
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
 * or field fails the `vals eval` — and any `ref+` string that SURVIVES
 * resolution (an unsupported provider like `ref+sops://`, or a reference vals
 * did not recognize) fails the run too, naming the scheme but never echoing
 * content. The guard stays as defense-in-depth, but the failure belongs to
 * the run that caused it, not to the container that later boots with a
 * literal `ref+…` as its password.
 */

import { execFile } from "node:child_process";
import { type Input, type Output, output, secret } from "@pulumi/pulumi";
import * as yaml from "yaml";
import { BaoClient } from "../bao.ts";

/** How a wrapped document reaches vals. Injectable for the tests. */
export type ValsExec = (doc: string, env: Record<string, string>) => Promise<string>;

/**
 * Any scheme-shaped reference (`ref+x://`), NOT just openbao. The gate and
 * the residue guard share this on purpose: a document whose only references
 * use a not-yet-wired provider (`ref+sops://` is next, PLAN §D.2) must enter
 * resolution and FAIL there — a gate that only knew openbao would skip vals
 * for that document and ship the literal into a container, silently, with
 * the residue guard never running. Deliberately loose on the provider name
 * and strict on the shape, so the provision.sh guard's `ref+*)` glob and
 * prose saying "ref+..." never match.
 */
const REF_SCHEME = /ref\+[a-z0-9]+:\/\//g;

export class SecretRefResolver {
  /**
   * Constructed lazily on the first reference actually seen, so building a
   * store never demands BAO_ADDR on a stack that resolves no references.
   */
  private client?: BaoClient;
  /** One vals run per distinct document per process, however often it recurs. */
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
  public resolve(value: Input<string>, label?: string): Output<string> {
    return output(value).apply(v => {
      // `search`, not `test`: the shared pattern is /g and `test` advances
      // its lastIndex; `search` neither reads nor writes it.
      if (v.search(REF_SCHEME) === -1) return output(v);
      return secret(output(this.resolveText(v, label)));
    });
  }

  /**
   * The async core `resolve` wraps: the document with every reference
   * expanded, or a thrown error. Public so the failure contract is testable
   * as a plain promise — a rejected Output fans out through the SDK's
   * internal sibling promises, which only the engine observes.
   */
  public resolveText(v: string, label?: string): Promise<string> {
    let pending = this.resolved.get(v);
    if (!pending) {
      pending = this.evaluate(v, label);
      this.resolved.set(v, pending);
      // A failed eval must not poison the memo forever — a retry (the
      // operator reconciles on backoff) should re-run vals, not replay the
      // rejection.
      pending.catch(() => this.resolved.delete(v));
    }
    return pending;
  }

  private async evaluate(v: string, label?: string): Promise<string> {
    this.client ??= this.makeClient();
    const doc = yaml.stringify({ content: v });
    let resolvedDoc: string;
    try {
      resolvedDoc = await this.exec(doc, {
        VAULT_ADDR: this.client.address,
        VAULT_TOKEN: await this.client.authToken(),
      });
    } catch (error) {
      // vals' own failures — a path that does not exist, a backend that will
      // not authenticate — are the COMMON case, and they arrived with no
      // indication of which document held the reference. vals names the ref;
      // this names the file it came from. The original message is preserved
      // verbatim: it carries the reference and the provider's reason, never a
      // resolved value.
      throw new Error(`${where(label)}${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const parsed = yaml.parse(resolvedDoc) as { content?: unknown } | null;
    const content = parsed?.content;
    if (typeof content !== "string") {
      throw new Error(`${where(label)}vals eval returned ${content === undefined ? "no content" : typeof content} for a ${v.length}-byte document — expected the wrapped string back`);
    }
    const residue = Array.from(new Set(Array.from(content.matchAll(REF_SCHEME), m => m[0])));
    if (residue.length > 0) {
      // Schemes only, never spans: the surrounding content is resolved
      // secrets by now, and an error message must not carry any of it. Line
      // numbers come from the ORIGINAL document, which holds references and
      // no resolved values — and the original is the file a human edits.
      throw new Error(
        `${where(label)}document still contains ${residue.length} unresolved secret-reference scheme(s) after vals eval: ${residue.map(scheme => `${scheme}${lineOf(v, scheme)}`).join(", ")} — an unsupported provider, a reference vals did not recognize, or a scheme written in prose (see the estate rule: never write a resolvable scheme, even in a comment)`,
      );
    }
    return content;
  }
}

/**
 * `path: ` when the caller named the document, empty when it did not.
 *
 * Every one of these errors used to be anonymous, which is why a single
 * well-formed scheme in a comment cost a hunt across eleven files to find
 * rather than a glance.
 */
function where(label?: string): string {
  return label ? `${label}: ` : "";
}

/** ` (line N)` for the first occurrence in the ORIGINAL document, or "". */
function lineOf(original: string, scheme: string): string {
  const index = original.indexOf(scheme);
  if (index === -1) return "";
  return ` (line ${original.slice(0, index).split("\n").length})`;
}

/**
 * Spawn the real vals binary: `VALS_BIN` when set (the operator workspace
 * pods point it at the initContainer-installed copy), otherwise `vals` from
 * PATH (mise, locally). The document goes in on stdin and comes back on
 * stdout, so no secret value ever touches argv or a file.
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

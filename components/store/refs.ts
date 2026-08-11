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
 * ## Why in-process, not the `vals` binary
 *
 * PLAN §D.1 sketched shelling out to `vals eval`. The stacks that resolve
 * these references run under the Pulumi Kubernetes Operator in stock
 * `ghcr.io/pulumi/pulumi-nodejs` workspace pods, where no `vals` binary exists
 * and no mise is available to install one — a subprocess pass would fail on
 * every operator run, and shipping the binary means initContainer surgery on
 * every Stack CR plus an image to keep patched. `BaoClient` is already here,
 * already tested, and authenticates exactly like the provider and the
 * migration tooling (BAO_TOKEN, or the AppRole pair). What is kept from the
 * plan is everything observable: the reference syntax, batched reads, values
 * wrapped in `secret()`, and unresolved references failing the run loudly.
 *
 * ## Failure is an error, not a passthrough
 *
 * The `op://` resolver logs and passes the literal through, relying on the
 * `provision.sh` guard to catch it at container runtime. Here a missing path
 * or field throws during the Pulumi run instead — the guard stays as
 * defense-in-depth, but the failure belongs to the run that caused it, not to
 * the container that later boots with a literal `ref+…` as its password.
 */

import { type Input, type Output, output, secret } from "@pulumi/pulumi";
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

export class SecretRefResolver {
  /**
   * Constructed lazily on the first reference actually seen, so building a
   * store never demands BAO_ADDR on a stack that resolves no references.
   */
  private client?: BaoClient;
  /** One read per KV path per process, however many fields or files use it. */
  private readonly reads = new Map<string, Promise<Record<string, unknown>>>();

  constructor(private readonly makeClient: () => BaoClient = () => new BaoClient()) {}

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
   * thrown error for the first one that cannot be. Public so the failure
   * contract is testable as a plain promise — a rejected Output fans out
   * through the SDK's internal sibling promises, which only the engine
   * observes.
   */
  public async resolveText(v: string): Promise<string> {
    const refs = unique(Array.from(v.matchAll(REF_PATTERN)));
    const entries = await Promise.all(refs.map(async ([full, mount, path, field]) => [full, await this.field(full, mount, path, field)] as const));
    const byRef = new Map(entries);
    // matchAll found every occurrence, so the replace cannot miss: every full
    // match is a key in the map.
    return v.replace(REF_PATTERN, match => byRef.get(match) as string);
  }

  private async field(full: string, mount: string, path: string, field: string): Promise<string> {
    const key = `${mount}/${path}`;
    let read = this.reads.get(key);
    if (!read) {
      read = (async () => {
        this.client ??= this.makeClient();
        const result = await this.client.read(mount, path);
        if (!result) throw new Error(`${full}: ${key} does not exist in OpenBao`);
        return result.data;
      })();
      this.reads.set(key, read);
    }
    const data = await read;
    const value = data[field];
    if (typeof value !== "string") {
      throw new Error(`${full}: ${key} has no string field '${field}' (fields: ${Object.keys(data).sort().join(", ")})`);
    }
    return value;
  }
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

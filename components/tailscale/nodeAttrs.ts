/**
 * Pure edits to a tailnet policy's `nodeAttrs` -- no Pulumi, no network.
 * Tested by `components/tailscale/nodeAttrs.test.ts`.
 *
 * ## Why nodeAttrs is edited surgically rather than rebuilt
 *
 * `stacks/unifi-network/acl-manager.ts` blanks tagOwners, grants, tests, ssh,
 * sshTests and hosts before regenerating them, but it cannot do that to
 * nodeAttrs: the live policy carries entries this repo does not own (per-IP
 * `mullvad` attrs, the member/group `drive:*` attrs), and blanking the section
 * would delete them on the next run. `setNodeAttr` in ./manager.ts only adds or
 * merges, keyed by target -- so an entry removed from code stays live for ever.
 *
 * For most attributes that is harmless. For `funnel` it is not: that attribute
 * is what lets a device publish to the public internet, so the set of devices
 * holding it should be what code says. `withoutNodeAttr` is the other half of
 * that -- strip every live grant of one attribute, then let code re-add the
 * ones it means.
 *
 * ⚠️ That only takes effect on a run that WRITES the policy. The unifi-network
 * Stack does not refresh, so when the stripped output equals what is already in
 * state there is no diff and no PUT: a stray grant added by hand between writes
 * survives until some other input changes. `nodeAttrHolders` is what lets the
 * caller at least say so on every run.
 */

import type { TailscaleNodeAttr, TailscalePolicyFile } from "@openapi/tailscale-grants.js";
import * as parser from "jsonc-parser";

/** Every `nodeAttrs` entry of a HuJSON policy that grants `attr`. */
export function nodeAttrHolders(hujson: string, attr: string): TailscaleNodeAttr[] {
  const policy = parser.parse(hujson) as TailscalePolicyFile;
  return (policy.nodeAttrs ?? []).filter(entry => entry.attr?.includes(attr));
}

/**
 * Removes `attr` from every `nodeAttrs` entry of a HuJSON policy.
 *
 * - An entry left with no attrs and no app capabilities is deleted, with its
 *   comma -- and its whole line, when it sits on one of its own.
 * - An entry that still grants something keeps it, minus `attr`.
 * - Every other entry keeps its exact text, and so does a comment on the line
 *   after a removed entry. Edits are made per entry, highest index first, never
 *   by rewriting the array. The one thing that can go: a comment between a
 *   removed entry and its own comma, or -- for a comma-less last entry --
 *   between it and the entry before.
 * - A policy with no entry holding `attr` is returned unchanged (same string).
 */
export function withoutNodeAttr(hujson: string, attr: string): string {
  const policy = parser.parse(hujson) as TailscalePolicyFile;
  const entries = policy.nodeAttrs ?? [];

  let result = hujson;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!entry.attr?.includes(attr)) continue;

    const remaining = entry.attr.filter(value => value !== attr);
    const grantsApp = entry.app !== undefined && Object.keys(entry.app).length > 0;
    if (remaining.length === 0 && !grantsApp) {
      result = removeArrayElement(result, ["nodeAttrs"], index);
    } else {
      result = parser.applyEdits(result, parser.modify(result, ["nodeAttrs", index, "attr"], remaining.length > 0 ? remaining : undefined, { formattingOptions: { insertSpaces: true } }));
    }
  }
  return result;
}

/**
 * Cuts one element out of an array by its text range. NOT `parser.modify(…, undefined)`:
 * jsonc-parser re-serialises the element after the one it removes, which would
 * reformat a hand-set neighbour on every run.
 */
function removeArrayElement(json: string, path: (string | number)[], index: number): string {
  const elements = parser.findNodeAtLocation(parser.parseTree(json)!, path)!.children!;
  const node = elements[index];
  const nodeEnd = node.offset + node.length;
  const afterComma = offsetAfterComma(json, nodeEnd);

  if (afterComma === -1) {
    // A strict-JSON last element has no comma of its own: take the one before it.
    const start = index > 0 ? elements[index - 1].offset + elements[index - 1].length : node.offset;
    return json.slice(0, start) + json.slice(nodeEnd);
  }

  // The element and its comma. When the two sit on a line of their own, the
  // whole line -- no stray indent or blank line, and a comment on the next line
  // is left where it was.
  let start = node.offset;
  let end = afterComma;
  const lineStart = json.lastIndexOf("\n", start - 1) + 1;
  const restOfLine = json.slice(end).match(/^[ \t]*\r?\n/);
  if (restOfLine && /^[ \t]*$/.test(json.slice(lineStart, start))) {
    start = lineStart;
    end += restOfLine[0].length;
  } else {
    end += json.slice(end).match(/^[ \t]*/)![0].length;
  }
  return json.slice(0, start) + json.slice(end);
}

/** Offset just past the comma that follows `from` (skipping whitespace and comments), or -1 if the next token is not a comma. */
function offsetAfterComma(json: string, from: number): number {
  const scanner = parser.createScanner(json, /* ignoreTrivia */ true);
  scanner.setPosition(from);
  return scanner.scan() === parser.SyntaxKind.CommaToken ? scanner.getTokenOffset() + scanner.getTokenLength() : -1;
}

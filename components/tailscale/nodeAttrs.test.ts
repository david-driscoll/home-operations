/**
 * npx tsx --test components/tailscale/nodeAttrs.test.ts
 *
 * `withoutNodeAttr` decides which devices may publish to the public internet
 * (the `funnel` attribute), and it runs against the LIVE policy, which carries
 * hand-set entries nothing in this repo owns. So the two properties tested here
 * are the two ways it could go wrong: leaving a funnel grant behind, and
 * touching anything else.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as parser from "jsonc-parser";
import { nodeAttrHolders, withoutNodeAttr } from "./nodeAttrs.ts";

// Shaped like the live policy on 2026-09-27: per-IP mullvad entries and drive
// attrs set by hand, the stale tag:operator funnel grant, a comment.
const LIVE = `{
  // hand-maintained; see acl-manager.ts
  "nodeAttrs": [
    {"target": ["100.81.63.95"], "attr": ["mullvad"]},
    {"target": ["*"], "app": {}, "attr": ["drive:access"]},
    {"target": ["tag:operator"], "app": {}, "attr": ["funnel"]},
    {"target": ["autogroup:admin"], "app": {}, "attr": ["drive:share", "drive:access"]},
  ],
  "groups": {"group:fnf": []},
}`;

const nodeAttrs = (json: string) => (parser.parse(json) as { nodeAttrs?: unknown[] }).nodeAttrs;

describe("withoutNodeAttr", () => {
  it("deletes an entry whose only grant was the attribute", () => {
    const result = nodeAttrs(withoutNodeAttr(LIVE, "funnel"));
    assert.deepEqual(result, [
      { target: ["100.81.63.95"], attr: ["mullvad"] },
      { target: ["*"], app: {}, attr: ["drive:access"] },
      { target: ["autogroup:admin"], app: {}, attr: ["drive:share", "drive:access"] },
    ]);
  });

  it("removes exactly the entry's line and leaves the rest of the file byte-for-byte", () => {
    const expected = LIVE.split("\n")
      .filter(l => !l.includes("tag:operator"))
      .join("\n");
    assert.equal(withoutNodeAttr(LIVE, "funnel"), expected);
  });

  it("does the same for the live formatting: tabs, CRLF", () => {
    const tabs = `{\r\n\t"nodeAttrs": [\r\n\t\t{\r\n\t\t\t"target": ["tag:operator"],\r\n\t\t\t"attr": ["funnel"],\r\n\t\t},\r\n\t\t{\r\n\t\t\t"target": ["100.92.215.15"],\r\n\t\t\t"attr": ["mullvad"],\r\n\t\t},\r\n\t],\r\n}`;
    assert.equal(withoutNodeAttr(tabs, "funnel"), `{\r\n\t"nodeAttrs": [\r\n\t\t{\r\n\t\t\t"target": ["100.92.215.15"],\r\n\t\t\t"attr": ["mullvad"],\r\n\t\t},\r\n\t],\r\n}`);
  });

  it("keeps a comment that sits on the line after a removed entry", () => {
    const policy = `{"nodeAttrs": [\n  {"target": ["tag:funnel"], "attr": ["funnel"]},\n  // the living-room TV\n  {"target": ["100.66.207.43"], "attr": ["mullvad"]},\n]}`;
    assert.equal(withoutNodeAttr(policy, "funnel"), `{"nodeAttrs": [\n  // the living-room TV\n  {"target": ["100.66.207.43"], "attr": ["mullvad"]},\n]}`);
  });

  it("removes every holder, not just the first -- including a member-wide default", () => {
    const policy = `{"nodeAttrs": [
      {"target": ["autogroup:member"], "attr": ["funnel"]},
      {"target": ["tag:apps"], "attr": ["funnel"]},
      {"target": ["tag:dns"], "attr": ["drive:access"]}
    ]}`;
    assert.deepEqual(nodeAttrs(withoutNodeAttr(policy, "funnel")), [{ target: ["tag:dns"], attr: ["drive:access"] }]);
  });

  it("keeps an entry's other attrs when it held the attribute alongside them", () => {
    const policy = `{"nodeAttrs": [{"target": ["tag:x"], "attr": ["funnel", "drive:access"]}]}`;
    assert.deepEqual(nodeAttrs(withoutNodeAttr(policy, "funnel")), [{ target: ["tag:x"], attr: ["drive:access"] }]);
  });

  it("keeps an entry that still grants app capabilities, dropping only its attr list", () => {
    const policy = `{"nodeAttrs": [{"target": ["tag:x"], "attr": ["funnel"], "app": {"example.com/cap/x": [{}]}}]}`;
    assert.deepEqual(nodeAttrs(withoutNodeAttr(policy, "funnel")), [{ target: ["tag:x"], app: { "example.com/cap/x": [{}] } }]);
  });

  it("returns the policy unchanged when nothing holds the attribute", () => {
    const policy = LIVE.replace(`{"target": ["tag:operator"], "app": {}, "attr": ["funnel"]},\n`, "");
    assert.equal(withoutNodeAttr(policy, "funnel"), policy);
    assert.equal(withoutNodeAttr(`{"groups": {}}`, "funnel"), `{"groups": {}}`);
  });

  it("keeps the policy valid when the removed entry is the last, or the only, one", () => {
    const last = `{"nodeAttrs": [\n  {"target": ["tag:dns"], "attr": ["drive:access"]},\n  {"target": ["tag:x"], "attr": ["funnel"]},\n]}`;
    assert.equal(withoutNodeAttr(last, "funnel"), `{"nodeAttrs": [\n  {"target": ["tag:dns"], "attr": ["drive:access"]},\n]}`);
    const strictLast = `{"nodeAttrs": [\n  {"target": ["tag:dns"], "attr": ["drive:access"]},\n  {"target": ["tag:x"], "attr": ["funnel"]}\n]}`;
    assert.equal(withoutNodeAttr(strictLast, "funnel"), `{"nodeAttrs": [\n  {"target": ["tag:dns"], "attr": ["drive:access"]}\n]}`);
    for (const only of [
      `{"nodeAttrs": [{"target": ["tag:x"], "attr": ["funnel"]}]}`,
      `{"nodeAttrs": [{"target": ["tag:x"], "attr": ["funnel"]},]}`,
      `{"nodeAttrs": [{"target": ["tag:x"], "attr": ["funnel"]} /* c */ ,]}`,
    ]) {
      const result = withoutNodeAttr(only, "funnel");
      const errors: parser.ParseError[] = [];
      assert.deepEqual(parser.parse(result, errors, { allowTrailingComma: false }), { nodeAttrs: [] }, result);
      assert.deepEqual(errors, [], result);
    }
  });

  it("matches the attribute exactly, not by prefix", () => {
    const policy = `{"nodeAttrs": [{"target": ["tag:x"], "attr": ["funnel:extra"]}]}`;
    assert.equal(withoutNodeAttr(policy, "funnel"), policy);
  });
});

describe("nodeAttrHolders", () => {
  it("lists every entry granting the attribute, and nothing else", () => {
    assert.deepEqual(nodeAttrHolders(LIVE, "funnel"), [{ target: ["tag:operator"], app: {}, attr: ["funnel"] }]);
    assert.deepEqual(nodeAttrHolders(withoutNodeAttr(LIVE, "funnel"), "funnel"), []);
    assert.deepEqual(nodeAttrHolders(`{"groups": {}}`, "funnel"), []);
  });
});

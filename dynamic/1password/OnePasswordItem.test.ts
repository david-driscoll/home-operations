/**
 * npx tsx --test dynamic/1password/OnePasswordItem.test.ts
 *
 * The unknown-value guard. `pulumi.runtime.unknownValue` is an ordinary
 * 36-character string, so a diff that does not look for it will happily treat
 * it as data — and this provider turns any diff into `replaces` with
 * `deleteBeforeReplace: true`, i.e. destroying and recreating the 1Password
 * item.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as pulumi from "@pulumi/pulumi";
import { containsUnknown } from "./OnePasswordItem.ts";

const UNKNOWN = pulumi.runtime.unknownValue;

describe("containsUnknown", () => {
  it("finds the sentinel as a bare value", () => {
    assert.equal(containsUnknown(UNKNOWN), true);
  });

  it("finds it nested in the shape these inputs actually take", () => {
    // This is the real case: `sections` unresolved during preview.
    assert.equal(containsUnknown({ title: "Tailscale Export - home-operations", sections: UNKNOWN }), true);
    assert.equal(containsUnknown({ fields: { name: { value: "home-operations" }, services: { value: UNKNOWN } } }), true);
    assert.equal(containsUnknown({ a: [{ b: [{ c: UNKNOWN }] }] }), true);
  });

  it("does not fire on ordinary values, including 36-character strings", () => {
    assert.equal(containsUnknown({ title: "x", sections: { celestia: { fields: { mac: { value: "aa:bb" } } } } }), false);
    // A real UUID is also 36 characters — length must not be the test.
    assert.equal(containsUnknown({ id: "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e" }), false);
    assert.equal(containsUnknown(null), false);
    assert.equal(containsUnknown(undefined), false);
    assert.equal(containsUnknown(42), false);
  });

  it("is what stands between an unknown input and a destroyed item", () => {
    // Object.entries() over the sentinel yields one numeric key per character:
    // that is where "add /0 {}" … "add /35 {}" came from, and every one of
    // those paths became an entry in `replaces`.
    assert.equal(Object.keys(Object.fromEntries(Object.entries(UNKNOWN))).length, 36);
  });
});

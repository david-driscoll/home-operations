/**
 * npx tsx --test components/domains.test.ts
 *
 * The one door the root domain comes through into the Pulumi code. What
 * matters is that it fails closed: an unset value must stop the run, not
 * render an empty string into a zone name or a URL.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { rootDomain, rootDomainSlug } from "./domains.ts";

const saved = process.env.ROOT_DOMAIN;

function setRootDomain(value: string | undefined) {
  // Assigning undefined to process.env stores the string "undefined".
  if (value === undefined) delete process.env.ROOT_DOMAIN;
  else process.env.ROOT_DOMAIN = value;
}

afterEach(() => setRootDomain(saved));

describe("rootDomain", () => {
  it("returns the environment's value, trimmed", () => {
    setRootDomain(" example.com\n");
    assert.equal(rootDomain(), "example.com");
  });

  it("throws when the value is missing or blank", () => {
    for (const value of [undefined, "", "  "]) {
      setRootDomain(value);
      assert.throws(() => rootDomain(), /ROOT_DOMAIN is not set/, JSON.stringify(value));
    }
  });
});

describe("rootDomainSlug", () => {
  it("hyphenates every dot", () => {
    setRootDomain("a.example.com");
    assert.equal(rootDomainSlug(), "a-example-com");
  });
});

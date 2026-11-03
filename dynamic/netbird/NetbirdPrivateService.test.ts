/**
 * node --test dynamic/netbird/NetbirdPrivateService.test.ts
 *
 * Create adopts the service already holding the domain instead of failing on
 * the server's unique-domain constraint.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serviceIdForDomain } from "./NetbirdPrivateService.ts";

describe("serviceIdForDomain", () => {
  const services = [
    { id: "s1", domain: "nbidp.example.test" },
    { id: "s2", domain: "other.example.test" },
  ];

  it("finds the service serving the domain", () => {
    assert.equal(serviceIdForDomain(services, "nbidp.example.test"), "s1");
  });

  it("matches the whole name only", () => {
    assert.equal(serviceIdForDomain(services, "example.test"), undefined);
    assert.equal(serviceIdForDomain([], "nbidp.example.test"), undefined);
  });
});

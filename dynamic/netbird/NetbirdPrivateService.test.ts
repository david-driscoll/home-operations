/**
 * node --test dynamic/netbird/NetbirdPrivateService.test.ts
 *
 * Create adopts the service already holding the domain instead of failing on
 * the server's unique-domain constraint.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adoption, requestCluster, serviceDiff, serviceIdForDomain } from "./NetbirdPrivateService.ts";

const OLD = "nbidp.example.test";
const NEW = "ek.example.test";
const inputs = (cluster: string, extra: Record<string, unknown> = {}) => ({
  managementUrl: "https://netbird.example.test",
  token: "t",
  request: { domain: OLD, targets: [{ target_type: "cluster", target_id: cluster }], ...extra },
});

describe("cluster changes", () => {
  it("reads the cluster off the request's cluster target", () => {
    assert.equal(requestCluster(inputs(NEW).request), NEW);
    assert.equal(requestCluster({ domain: OLD, targets: [{ target_type: "peer", target_id: "p1" }] }), undefined);
  });

  it("replaces, deleting first, when the cluster changes: management never moves a service", () => {
    assert.deepEqual(serviceDiff(inputs(OLD), inputs(NEW)), { changes: true, replaces: ["request"], deleteBeforeReplace: true });
  });

  it("updates in place for any other change", () => {
    assert.deepEqual(serviceDiff(inputs(NEW), inputs(NEW, { access_groups: ["g"] })), { changes: true, replaces: [], deleteBeforeReplace: false });
    assert.deepEqual(serviceDiff(inputs(NEW), inputs(NEW)), { changes: false, replaces: [], deleteBeforeReplace: false });
  });

  it("adopts a service on the right cluster and deletes one stranded on another", () => {
    assert.equal(adoption(undefined, NEW), "post");
    assert.equal(adoption({ id: "s1", domain: OLD, proxy_cluster: NEW }, NEW), "put");
    assert.equal(adoption({ id: "s1", domain: OLD, proxy_cluster: OLD }, NEW), "delete-then-post");
    assert.equal(adoption({ id: "s1", domain: OLD }, NEW), "put");
  });
});

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

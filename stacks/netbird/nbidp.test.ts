/**
 * node --test stacks/netbird/nbidp.test.ts
 *
 * The NetBird side of nbidp (#2891): which peers the private proxy admits to
 * Dex, on which cluster, and how the custom domain is found and validated.
 *
 * Only user peers may reach it. A tagged or setup-key peer (gateways, k8s
 * routers, Apple TVs) has no owner, so the proxy would stamp its PEER NAME as
 * X-NetBird-User, and Dex would hand Authentik that as a verified email.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveCustomDomain, privateServiceAccessGroups, privateServiceRequest, serviceOnCluster, validationRecordName } from "./nbidp.ts";

const HOST = "nbidp.example.test";
const CLUSTER = "ek.example.test";

/** Every group stacks/netbird creates, by name, plus NetBird's built-in `All`. */
const ids: Record<string, string> = {
  All: "g-all",
  admins: "g-admins",
  family: "g-family",
  friends: "g-friends",
  "media-managers": "g-media",
  "apple-tv": "g-tv",
  gateways: "g-gw",
  "k8s-routers": "g-k8s",
};

describe("privateServiceAccessGroups", () => {
  it("admits the four user groups the stack creates", () => {
    assert.deepEqual(privateServiceAccessGroups(ids), ["g-admins", "g-family", "g-friends", "g-media"]);
  });

  it("never admits All or a device group", () => {
    const admitted = privateServiceAccessGroups(ids);
    for (const id of ["g-all", "g-tv", "g-gw", "g-k8s"]) assert.ok(!admitted.includes(id), `${id} must not reach Dex`);
  });

  it("refuses to run short of a user group, rather than quietly lock its people out", () => {
    const { friends: _friends, ...short } = ids;
    assert.throws(() => privateServiceAccessGroups(short), /friends/);
  });
});

describe("serviceOnCluster", () => {
  it("is true only for the domain's service on the expected cluster", () => {
    assert.equal(serviceOnCluster([{ id: "s1", domain: HOST, proxy_cluster: CLUSTER }], HOST, CLUSTER), true);
  });

  it("calls a service left on the old cluster address stranded, so it is re-created", () => {
    assert.equal(serviceOnCluster([{ id: "s1", domain: HOST, proxy_cluster: HOST }], HOST, CLUSTER), false);
    assert.equal(serviceOnCluster([{ id: "s1", domain: HOST }], HOST, CLUSTER), false);
    assert.equal(serviceOnCluster([], HOST, CLUSTER), false);
  });
});

describe("custom domains", () => {
  it("finds the custom domain, not a free cluster address of the same name", () => {
    const domains = [
      { id: "free", domain: HOST, validated: true, type: "free" },
      { id: "d1", domain: HOST, validated: false, type: "custom", target_cluster: CLUSTER },
    ];
    assert.equal(liveCustomDomain(domains, HOST)?.id, "d1");
    assert.equal(liveCustomDomain(domains, "other.example.test"), undefined);
  });

  it("is validated by a CNAME at validation.<domain>", () => {
    assert.equal(validationRecordName(HOST), "validation.nbidp.example.test");
  });
});

describe("privateServiceRequest", () => {
  const request = privateServiceRequest({ host: HOST, clusterAddress: CLUSTER, accessGroupIds: ["g-admins"] });

  it("is a NetBird-only HTTP service gated on the access groups", () => {
    assert.equal(request.private, true);
    assert.equal(request.mode, "http");
    assert.equal(request.enabled, true);
    assert.equal(request.domain, HOST);
    assert.deepEqual(request.access_groups, ["g-admins"]);
  });

  it("has no SSO or other auth scheme, which private services refuse", () => {
    assert.equal(request.auth, undefined);
  });

  it("forwards to Dex's Service directly from the proxy pod, on the proxy's cluster, not over the tunnel", () => {
    assert.deepEqual(request.targets, [
      {
        target_type: "cluster",
        target_id: CLUSTER,
        host: "nbidp-dex.netbird-system.svc.cluster.local",
        port: 5556,
        protocol: "http",
        path: "/",
        enabled: true,
        options: { direct_upstream: true, request_timeout: "30s" },
      },
    ]);
  });

  it("refuses to open the service to nobody", () => {
    assert.throws(() => privateServiceRequest({ host: HOST, clusterAddress: CLUSTER, accessGroupIds: [] }), /access group/);
  });
});

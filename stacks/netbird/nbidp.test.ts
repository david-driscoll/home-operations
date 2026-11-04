/**
 * node --test stacks/netbird/nbidp.test.ts
 *
 * The NetBird side of nbidp (#2891): which peers the private proxy admits to
 * Dex, and when stacks/netbird may declare the service at all.
 *
 * Only user peers may reach it. A tagged or setup-key peer (gateways, k8s
 * routers, Apple TVs) has no owner, so the proxy would stamp its PEER NAME as
 * X-NetBird-User, and Dex would hand Authentik that as a verified email.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateServiceAccessGroups, privateServiceReady, privateServiceRequest } from "./nbidp.ts";

const HOST = "nbidp.example.test";

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

describe("privateServiceReady", () => {
  const cluster = { address: HOST, online: true, private: true, type: "account" };

  it("waits until the proxy has connected: management derives the service's cluster from a live proxy", () => {
    assert.equal(privateServiceReady([], [], HOST), false);
    assert.equal(privateServiceReady([{ ...cluster, online: false }], [], HOST), false);
  });

  it("waits for a proxy running in private mode", () => {
    assert.equal(privateServiceReady([{ ...cluster, private: false }], [], HOST), false);
    assert.equal(privateServiceReady([{ ...cluster, private: undefined }], [], HOST), false);
  });

  it("ignores other clusters", () => {
    assert.equal(privateServiceReady([{ ...cluster, address: "proxy.example.test" }], [], HOST), false);
  });

  it("declares once the private cluster is online", () => {
    assert.equal(privateServiceReady([cluster], [], HOST), true);
  });

  it("keeps declaring a service that exists while the proxy is down, or Pulumi would delete it", () => {
    assert.equal(privateServiceReady([{ ...cluster, online: false }], [{ id: "s1", domain: HOST }], HOST), true);
  });
});

describe("privateServiceRequest", () => {
  const request = privateServiceRequest({ host: HOST, accessGroupIds: ["g-admins"] });

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

  it("forwards to Dex's Service directly from the proxy pod, not over the tunnel", () => {
    assert.deepEqual(request.targets, [
      {
        target_type: "cluster",
        target_id: HOST,
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
    assert.throws(() => privateServiceRequest({ host: HOST, accessGroupIds: [] }), /access group/);
  });
});

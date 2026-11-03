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
import type { LiveGroup } from "./policy.ts";

const HOST = "nbidp.example.test";

const live: LiveGroup[] = [
  { id: "g-all", name: "All", issued: "api" },
  { id: "g-admins", name: "admins", issued: "jwt" },
  { id: "g-family", name: "family", issued: "jwt" },
  { id: "g-tv", name: "apple-tv", issued: "api" },
  { id: "g-gw", name: "gateways", issued: "api" },
  { id: "g-k8s", name: "k8s-routers", issued: "api" },
];

describe("privateServiceAccessGroups", () => {
  it("admits the JWT-synced Authentik groups that exist, and reports the rest as missing", () => {
    const { ids, missing } = privateServiceAccessGroups(live);
    assert.deepEqual(ids, ["g-admins", "g-family"]);
    assert.deepEqual(missing, ["friends", "media-managers"]);
  });

  it("never admits All or a device group", () => {
    const { ids } = privateServiceAccessGroups(live);
    for (const id of ["g-all", "g-tv", "g-gw", "g-k8s"]) assert.ok(!ids.includes(id), `${id} must not reach Dex`);
  });

  it("refuses a same-named group made through the API: JWT sync never puts users in it", () => {
    const { ids, conflicts } = privateServiceAccessGroups([{ id: "g-fake", name: "admins", issued: "api" }]);
    assert.deepEqual(ids, []);
    assert.deepEqual(conflicts, ["admins"]);
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

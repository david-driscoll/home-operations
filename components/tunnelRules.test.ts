/**
 * npx tsx --test components/tunnelRules.test.ts
 *
 * The tunnel's hostname/path derivation — no Pulumi engine, no cluster, no network.
 *
 * Regexes are exercised with JavaScript's RegExp. That is a faithful stand-in for
 * cloudflared's Go RE2 only because tunnelRules.ts restricts itself to syntax both
 * engines share (no lookaround); one test below enforces that restriction.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIngressEntries, deriveTunnelRules, type HttpRouteLike, TRAVERSAL_DENY_SERVICE, TRAVERSAL_PATH } from "./tunnelRules.ts";

const external = [{ name: "external", namespace: "network" }];

type Spec = NonNullable<HttpRouteLike["spec"]>;

const route = (name: string, hostnames: string[], rules: Spec["rules"], parentRefs: Spec["parentRefs"] = external, namespace = "equestria"): HttpRouteLike => ({
  metadata: { name, namespace },
  spec: { parentRefs, hostnames, rules },
});

const prefix = (value: string) => ({ matches: [{ path: { type: "PathPrefix", value } }] });

/** Would cloudflared forward this path to the origin, given the ordered entries? */
function forwarded(entries: ReturnType<typeof buildIngressEntries>, hostname: string, path: string): boolean {
  for (const entry of entries) {
    if (entry.hostname !== undefined && entry.hostname !== hostname) continue;
    if (entry.path !== undefined && !new RegExp(entry.path).test(path)) continue;
    return entry.service === "origin";
  }
  return false;
}

describe("deriveTunnelRules", () => {
  it("restricts postiz to /uploads/ and the webhook to /hook/ (the two live routes)", () => {
    const rules = deriveTunnelRules([
      route("postiz-external", ["postiz.driscoll.tech"], [prefix("/uploads/")]),
      route("flux-webhook", ["flux-equestria-webhook.driscoll.tech"], [prefix("/hook/")], external, "flux-system"),
    ]);
    assert.deepEqual(rules, [
      { hostname: "flux-equestria-webhook.driscoll.tech", path: "^(/hook(/|$))" },
      { hostname: "postiz.driscoll.tech", path: "^(/uploads(/|$))" },
    ]);
  });

  it("publishes the whole hostname for PathPrefix /, a missing path, or a rule with no matches", () => {
    for (const rules of [[prefix("/")], [{ matches: [{}] }], [{}], [{ matches: [] }]]) {
      assert.deepEqual(deriveTunnelRules([route("r", ["a.example"], rules)]), [{ hostname: "a.example" }]);
    }
  });

  it("ignores routes not attached to network/external", () => {
    const rules = deriveTunnelRules([
      route("internal", ["x.example"], [prefix("/")], [{ name: "internal", namespace: "network" }]),
      // parentRef namespace omitted -> the ROUTE's namespace, not `network`
      route("local-external", ["y.example"], [prefix("/")], [{ name: "external" }], "equestria"),
      route("wrong-kind", ["z.example"], [prefix("/")], [{ name: "external", namespace: "network", kind: "Service" } as never]),
    ]);
    assert.deepEqual(rules, []);
  });

  it("merges paths when several routes claim one hostname, and whole-host wins", () => {
    assert.deepEqual(deriveTunnelRules([route("a", ["h.example"], [prefix("/b/")]), route("b", ["h.example"], [prefix("/a")])]), [{ hostname: "h.example", path: "^(/a(/|$)|/b(/|$))" }]);
    assert.deepEqual(deriveTunnelRules([route("a", ["h.example"], [prefix("/b/")]), route("b", ["h.example"], [prefix("/")])]), [{ hostname: "h.example" }]);
    assert.deepEqual(deriveTunnelRules([route("a", ["h.example"], [prefix("/")]), route("b", ["h.example"], [prefix("/b/")])]), [{ hostname: "h.example" }]);
  });

  it("escapes metacharacters and supports Exact", () => {
    const rules = deriveTunnelRules([route("r", ["h.example"], [{ matches: [{ path: { type: "Exact", value: "/a.b+c" } }] }])]);
    assert.deepEqual(rules, [{ hostname: "h.example", path: "^(/a\\.b\\+c$)" }]);
  });

  it("refuses RegularExpression rather than guessing", () => {
    assert.throws(() => deriveTunnelRules([route("r", ["h.example"], [{ matches: [{ path: { type: "RegularExpression", value: "/.*" } }] }])]), /cannot be expressed as a tunnel rule/);
  });

  it("skips hostname-less routes instead of inventing a wildcard", () => {
    assert.deepEqual(deriveTunnelRules([route("r", [], [prefix("/")])]), []);
  });
});

describe("buildIngressEntries + path semantics", () => {
  const entries = buildIngressEntries([{ hostname: "postiz.driscoll.tech", path: "^(/uploads(/|$))" }, { hostname: "whole.example" }], "http_status:404");

  it("orders deny before serve, and ends with the catch-all", () => {
    assert.deepEqual(entries, [
      { hostname: "postiz.driscoll.tech", path: TRAVERSAL_PATH, service: TRAVERSAL_DENY_SERVICE },
      { hostname: "postiz.driscoll.tech", path: "^(/uploads(/|$))", service: "origin" },
      { hostname: "whole.example", service: "origin" },
      { service: "http_status:404" },
    ]);
  });

  it("forwards uploads and nothing else on a restricted host", () => {
    for (const path of ["/uploads/", "/uploads", "/uploads/2026/09/15/abc.png"]) assert.equal(forwarded(entries, "postiz.driscoll.tech", path), true, path);
    for (const path of ["/", "/auth", "/api/", "/settings", "/uploadsx", "/x/uploads/"]) assert.equal(forwarded(entries, "postiz.driscoll.tech", path), false, path);
  });

  it("blocks the traversals Traefik was measured normalizing into /api/", () => {
    // cloudflared matches the DECODED path, so %2e%2e arrives here as `..`.
    for (const path of ["/uploads/../api/", "/uploads/..", "/uploads//../api/", decodeURIComponent("/uploads/%2e%2e/api/")]) {
      assert.equal(forwarded(entries, "postiz.driscoll.tech", path), false, path);
    }
    // ...without catching ordinary dots in filenames.
    assert.equal(forwarded(entries, "postiz.driscoll.tech", "/uploads/a..b.png"), true);
  });

  it("leaves unrestricted hosts whole and unknown hosts to the catch-all", () => {
    assert.equal(forwarded(entries, "whole.example", "/anything/../else"), true);
    assert.equal(forwarded(entries, "nobody.example", "/"), false);
  });

  it("refuses empty and duplicated hostname lists", () => {
    assert.throws(() => buildIngressEntries([], "http_status:404"), /no tunnel rules/);
    assert.throws(() => buildIngressEntries([{ hostname: "a" }, { hostname: "a" }], "http_status:404"), /duplicate hostnames a/);
  });

  it("emits no lookaround, so JavaScript and RE2 agree on every regex", () => {
    const all = [TRAVERSAL_PATH, ...deriveTunnelRules([route("r", ["h"], [prefix("/a.b/"), { matches: [{ path: { type: "Exact", value: "/c" } }] }])]).map(rule => rule.path ?? "")];
    for (const regex of all) assert.doesNotMatch(regex, /\(\?[=!<]/, regex);
  });
});

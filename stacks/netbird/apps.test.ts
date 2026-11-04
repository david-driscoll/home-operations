/**
 * node --test stacks/netbird/apps.test.ts
 *
 * Every tailnet app's NetBird twin (docs/plans/netbird-mirror.md §N): which
 * apps, under which name, open to whom, and the service management is sent.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appAccessGroups,
  appDomain,
  appHost,
  appServiceReady,
  appServiceRequest,
  definitionFor,
  type LiveDefinition,
  type LiveIngress,
  liveCustomDomain,
  type TailnetApp,
  TRAEFIK_NETBIRD_DOOR,
  tailnetApps,
} from "./apps.ts";

const ROOT = "example.test";

/** A tailnet Ingress as kubernetes/components/tailscale renders it into `network`. */
function tailnetIngress(app: string, namespace: string, host = app): LiveIngress {
  return {
    metadata: {
      name: `${app}-tailscale-ingress`,
      namespace: "network",
      labels: { "app.kubernetes.io/name": app, "kustomize.toolkit.fluxcd.io/name": `${app}-tailnet-ingress`, "kustomize.toolkit.fluxcd.io/namespace": namespace },
    },
    spec: { ingressClassName: "tailscale", tls: [{ hosts: [host] }] },
  };
}

describe("names", () => {
  it("puts every app under app.<root domain>, on its tailnet host label", () => {
    assert.equal(appDomain(ROOT), "app.example.test");
    assert.equal(appHost("git", ROOT), "git.app.example.test");
  });
});

describe("tailnetApps", () => {
  it("reads the app, its namespace and its TAILSCALE_HOST off the component's Ingress", () => {
    assert.deepEqual(tailnetApps([tailnetIngress("forgejo", "coder", "git"), tailnetIngress("sonarr", "equestria")]), [
      { app: "forgejo", namespace: "coder", host: "git" },
      { app: "sonarr", namespace: "equestria", host: "sonarr" },
    ]);
  });

  it("leaves out Funnel Ingresses and anything another ks rendered", () => {
    const funnel: LiveIngress = {
      metadata: { name: "funnel-postiz-media", labels: { "app.kubernetes.io/name": "postiz", "kustomize.toolkit.fluxcd.io/name": "funnel-postiz-media", "kustomize.toolkit.fluxcd.io/namespace": "equestria" } },
      spec: { ingressClassName: "tailscale", tls: [{ hosts: ["postiz-media"] }] },
    };
    const traefik: LiveIngress = { ...tailnetIngress("other", "equestria"), spec: { ingressClassName: "internal", tls: [{ hosts: ["other"] }] } };
    assert.deepEqual(tailnetApps([funnel, traefik]), []);
  });

  it("refuses two apps on one host rather than pick one", () => {
    assert.throws(() => tailnetApps([tailnetIngress("a", "equestria", "same"), tailnetIngress("b", "equestria", "same")]), /claimed by both/);
  });

  it("refuses a host that is not a single DNS label", () => {
    assert.throws(() => tailnetApps([tailnetIngress("a", "equestria", "a.b")]), /single DNS label/);
    assert.throws(() => tailnetApps([tailnetIngress("a", "equestria", "")]), /no ks namespace label or no tls host/);
  });
});

describe("appAccessGroups", () => {
  const app: TailnetApp = { app: "sonarr", namespace: "equestria", host: "sonarr" };
  const definition = (groups?: string[]): LiveDefinition => ({ metadata: { name: "sonarr", namespace: "equestria" }, spec: groups ? { access_policy: { groups } } : {} });

  it("is the definition's groups, plus admins, in USER_GROUPS order", () => {
    assert.deepEqual(appAccessGroups(definition(["media-managers"]), app), { groups: ["admins", "media-managers"], warnings: [] });
    assert.deepEqual(appAccessGroups(definition(["friends", "family"]), app).groups, ["admins", "family", "friends"]);
  });

  it("opens an app with no access_policy to all four user groups, as Tailscale's default-apps-access does", () => {
    assert.deepEqual(appAccessGroups(definition(), app), { groups: ["admins", "family", "friends", "media-managers"], warnings: [] });
    assert.deepEqual(appAccessGroups(definition([]), app).groups, ["admins", "family", "friends", "media-managers"]);
  });

  it("reads Authentik's `users`, the parent of every group, as everyone", () => {
    assert.deepEqual(appAccessGroups(definition(["users"]), app).groups, ["admins", "family", "friends", "media-managers"]);
  });

  it("skips a group NetBird does not have, and says so", () => {
    const access = appAccessGroups(definition(["editors", "family"]), app);
    assert.deepEqual(access.groups, ["admins", "family"]);
    assert.equal(access.warnings.length, 1);
    assert.match(access.warnings[0], /"editors" is not a NetBird user group/);
  });

  it("fails closed to admins when nothing in access_policy maps", () => {
    const access = appAccessGroups(definition(["editors"]), app);
    assert.deepEqual(access.groups, ["admins"]);
    assert.match(access.warnings.at(-1) ?? "", /admins-only/);
  });

  it("fails closed to admins for an app with no ApplicationDefinition", () => {
    const access = appAccessGroups(undefined, app);
    assert.deepEqual(access.groups, ["admins"]);
    assert.match(access.warnings[0], /no ApplicationDefinition/);
  });

  it("finds the definition by the app's namespace and name, not just the name", () => {
    const definitions: LiveDefinition[] = [{ metadata: { name: "sonarr", namespace: "other" } }, definition(["family"])];
    assert.equal(definitionFor(app, definitions), definitions[1]);
    assert.equal(definitionFor({ ...app, namespace: "nowhere" }, definitions), undefined);
  });
});

describe("appServiceRequest", () => {
  const request = appServiceRequest({ host: "git.app.example.test", clusterAddress: "nbidp.example.test", accessGroupIds: ["g-admins"] });

  it("is a private service keeping the client's Host, so Traefik can route on it", () => {
    assert.equal(request.private, true);
    assert.equal(request.domain, "git.app.example.test");
    assert.equal(request.pass_host_header, true);
    assert.deepEqual(request.access_groups, ["g-admins"]);
  });

  it("dials Traefik's netbird door from the proxy pod, on the proxy's cluster", () => {
    assert.equal(request.targets.length, 1);
    const [target] = request.targets;
    assert.equal(target.target_type, "cluster");
    assert.equal(target.target_id, "nbidp.example.test");
    assert.equal(target.host, TRAEFIK_NETBIRD_DOOR.host);
    assert.equal(target.port, 8446);
    assert.equal(target.protocol, "http");
    assert.equal(target.options.direct_upstream, true);
  });

  it("is named after the host label", () => {
    assert.equal(request.name, "app-git");
  });

  it("refuses a service nobody may reach", () => {
    assert.throws(() => appServiceRequest({ host: "x.app.example.test", clusterAddress: "nbidp.example.test", accessGroupIds: [] }), /at least one access group/);
  });
});

describe("readiness", () => {
  it("declares a service once the proxy is online and the domain validated, and keeps an existing one through an outage", () => {
    assert.equal(appServiceReady({ serviceExists: false, clusterOnline: true, domainValidated: true }), true);
    assert.equal(appServiceReady({ serviceExists: false, clusterOnline: true, domainValidated: false }), false);
    assert.equal(appServiceReady({ serviceExists: false, clusterOnline: false, domainValidated: true }), false);
    assert.equal(appServiceReady({ serviceExists: true, clusterOnline: false, domainValidated: false }), true);
  });

  it("finds the custom domain, not the free cluster address of the same name", () => {
    const domains = [
      { id: "free", domain: "app.example.test", validated: true, type: "free" },
      { id: "d1", domain: "app.example.test", validated: false, type: "custom" },
    ];
    assert.equal(liveCustomDomain(domains, "app.example.test")?.id, "d1");
    assert.equal(liveCustomDomain(domains, "other.example.test"), undefined);
  });
});

/**
 * node --test components/netbird/nbidp.test.ts
 *
 * nbidp (#2891, docs/plans/netbird-mirror.md §K): the Dex that turns the
 * NetBird private proxy's identity headers into OIDC for Authentik.
 *
 * The property these tests hold: every identity field Dex reads comes from a
 * header the proxy deletes from the client's request and then stamps itself.
 * Dex's authproxy connector reads FIVE headers, and four of them default to
 * names the proxy passes through untouched (X-Remote-User-Email and friends),
 * so leaving one at its default lets a NetBird user send
 * `X-Remote-User-Email: someone-else@...` and log into Authentik as them.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEX_BACKCHANNEL_URL, DEX_CONNECTOR_ID, NETBIRD_IDENTITY_HEADERS, nbidpHost, renderDexConfig, sourceEndpoints } from "./nbidp.ts";

const args = {
  issuer: "https://nbidp.example.test",
  clientId: "client-id",
  clientSecret: "s3cret",
  redirectUris: ["https://authentik.example.test/source/oauth/callback/netbird/"],
};

interface AuthproxyConfig {
  userIDHeader: string;
  userHeader: string;
  userNameHeader: string;
  emailHeader: string;
  groupHeader: string;
  groupHeaderSeparator: string;
  staticGroups?: string[];
}

const parse = () => JSON.parse(renderDexConfig(args));
const authproxy = () => {
  const connectors = parse().connectors as { type: string; id: string; config: AuthproxyConfig }[];
  assert.equal(connectors.length, 1, "exactly one connector, so Dex skips its chooser and never offers another way in");
  return connectors[0];
};

describe("renderDexConfig: the authproxy connector", () => {
  it("is the only connector, and has the id the source and proxy expect", () => {
    const connector = authproxy();
    assert.equal(connector.type, "authproxy");
    assert.equal(connector.id, DEX_CONNECTOR_ID);
  });

  it("reads every identity field from X-NetBird-User, never a default header", () => {
    const { config } = authproxy();
    for (const key of ["userIDHeader", "userHeader", "userNameHeader", "emailHeader"] as const) {
      assert.equal(config[key], NETBIRD_IDENTITY_HEADERS.user, `${key} must be the proxy-stamped header`);
    }
    assert.equal(NETBIRD_IDENTITY_HEADERS.user, "X-NetBird-User");
  });

  it("reads groups from X-NetBird-Groups, comma-separated as the proxy joins them", () => {
    const { config } = authproxy();
    assert.equal(config.groupHeader, "X-NetBird-Groups");
    assert.equal(config.groupHeaderSeparator, ",");
  });

  it("adds no static groups", () => {
    assert.equal(authproxy().config.staticGroups, undefined);
  });

  it("names no header the proxy does not strip", () => {
    const { config } = authproxy();
    const named = Object.entries(config)
      .filter(([key]) => key.endsWith("Header"))
      .map(([, value]) => value);
    for (const header of named) assert.ok(Object.values(NETBIRD_IDENTITY_HEADERS).includes(header as never), `${header} is not one the proxy controls`);
  });
});

describe("renderDexConfig: the rest of Dex", () => {
  it("issues under the nbidp name", () => {
    assert.equal(parse().issuer, "https://nbidp.example.test");
  });

  it("has one client, Authentik, with exactly the callbacks it was given", () => {
    const clients = parse().staticClients;
    assert.deepEqual(clients, [{ id: "client-id", secret: "s3cret", name: "Authentik", redirectURIs: args.redirectUris }]);
  });

  it("offers the authorization-code grant only, with no approval screen and no local passwords", () => {
    const config = parse();
    assert.deepEqual(config.oauth2.grantTypes, ["authorization_code"]);
    assert.deepEqual(config.oauth2.responseTypes, ["code"]);
    assert.equal(config.oauth2.skipApprovalScreen, true);
    assert.equal(config.enablePasswordDB, false);
  });

  it("listens where the Service and the probes look", () => {
    const config = parse();
    assert.equal(config.web.http, "0.0.0.0:5556");
    assert.equal(config.telemetry.http, "0.0.0.0:5558");
  });

  it("refuses to render without a client or a callback", () => {
    assert.throws(() => renderDexConfig({ ...args, redirectUris: [] }), /redirect/);
    assert.throws(() => renderDexConfig({ ...args, clientSecret: "" }), /client/);
    assert.throws(() => renderDexConfig({ ...args, issuer: "http://nbidp.example.test" }), /https/);
  });
});

describe("sourceEndpoints", () => {
  const endpoints = sourceEndpoints("https://nbidp.example.test");

  it("sends the browser to the issuer, which only resolves over NetBird", () => {
    assert.equal(endpoints.authorizationUrl, "https://nbidp.example.test/auth");
  });

  it("keeps Authentik's server-to-server calls in the cluster, on the two paths the CiliumNetworkPolicy allows", () => {
    assert.equal(endpoints.accessTokenUrl, `${DEX_BACKCHANNEL_URL}/token`);
    assert.equal(endpoints.profileUrl, `${DEX_BACKCHANNEL_URL}/userinfo`);
    assert.match(DEX_BACKCHANNEL_URL, /^http:\/\/nbidp-dex\.netbird-system\.svc\.cluster\.local:5556$/);
  });
});

describe("nbidpHost", () => {
  it("is one label under the root domain", () => {
    assert.equal(nbidpHost("example.test"), "nbidp.example.test");
  });
});

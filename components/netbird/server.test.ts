/**
 * node --test components/netbird/server.test.ts
 *
 * The files the netbird-edge VM runs NetBird from (#3000). Expected values are
 * the shapes upstream's getting-started.sh (v0.82.0) writes for a built-in
 * Traefik install on 443.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSetupResponse, renderDashboardEnv, renderServerConfig } from "./server.ts";

const secrets = {
  relayAuthSecret: "relay+secret/with=chars",
  datastoreEncryptionKey: "c3RvcmUta2V5LWJhc2U2NC1wYWRkZWQ=",
  sessionCookieEncryptionKey: "Y29va2llLWtleQ==",
};

describe("renderServerConfig", () => {
  const config = renderServerConfig({ domain: "netbird.example.test", ...secrets });

  it("advertises the public HTTPS endpoint and the embedded IdP issuer", () => {
    assert.match(config, /^ {2}exposedAddress: "https:\/\/netbird\.example\.test:443"$/m);
    assert.match(config, /^ {4}issuer: "https:\/\/netbird\.example\.test\/oauth2"$/m);
    assert.match(config, /^ {6}- "https:\/\/netbird\.example\.test\/nb-auth"$/m);
    assert.match(config, /^ {6}- "https:\/\/netbird\.example\.test\/nb-silent-auth"$/m);
  });

  it("quotes secrets so base64 padding and slashes survive YAML", () => {
    assert.match(config, /^ {2}authSecret: "relay\+secret\/with=chars"$/m);
    assert.match(config, /^ {4}encryptionKey: "c3RvcmUta2V5LWJhc2U2NC1wYWRkZWQ="$/m);
    assert.match(config, /^ {4}sessionCookieEncryptionKey: "Y29va2llLWtleQ=="$/m);
  });

  it("trusts only the bundled Traefik for client IPs and stores in SQLite", () => {
    assert.match(config, /trustedHTTPProxies:\n {6}- "172\.30\.0\.10\/32"/);
    // Unset, NetBird trusts forwarded client-IP headers from ANY source.
    assert.match(config, /trustedPeers:\n {6}- "172\.30\.0\.10\/32"/);
    assert.match(config, /^ {4}engine: "sqlite"$/m);
    assert.match(config, /^ {2}stunPorts:\n {4}- 3478$/m);
  });
});

describe("renderDashboardEnv", () => {
  const env = renderDashboardEnv({ domain: "netbird.example.test" });
  const vars = Object.fromEntries(
    env
      .split("\n")
      .filter(line => line && !line.startsWith("#"))
      .map(line => line.split(/=(.*)/s).slice(0, 2)),
  );

  it("points the dashboard at the management API and the embedded IdP", () => {
    assert.equal(vars.NETBIRD_MGMT_API_ENDPOINT, "https://netbird.example.test");
    assert.equal(vars.NETBIRD_MGMT_GRPC_API_ENDPOINT, "https://netbird.example.test");
    assert.equal(vars.AUTH_AUTHORITY, "https://netbird.example.test/oauth2");
    assert.equal(vars.AUTH_CLIENT_ID, "netbird-dashboard");
    assert.equal(vars.USE_AUTH0, "false");
  });

  it("asks for the groups scope, which JWT group sync reads", () => {
    assert.equal(vars.AUTH_SUPPORTED_SCOPES, "openid profile email groups");
  });

  it("leaves TLS to Traefik", () => {
    assert.equal(vars.LETSENCRYPT_DOMAIN, "none");
  });
});

describe("parseSetupResponse", () => {
  it("returns the owner and its bootstrap token", () => {
    const parsed = parseSetupResponse('{"user_id":"abc123","email":"admin@example.test","personal_access_token":"nbp_0123456789"}');
    assert.deepEqual(parsed, { userId: "abc123", email: "admin@example.test", personalAccessToken: "nbp_0123456789" });
  });

  it("refuses a response without a token: the server's NB_SETUP_PAT_ENABLED is off", () => {
    assert.throws(() => parseSetupResponse('{"user_id":"abc123","email":"admin@example.test"}'), /no personal_access_token.*NB_SETUP_PAT_ENABLED/);
  });

  it("never echoes the body when it is not JSON, since it may hold the token", () => {
    assert.throws(
      () => parseSetupResponse("<html>nbp_secret</html>"),
      (error: Error) => /not JSON/.test(error.message) && !error.message.includes("nbp_secret"),
    );
  });
});

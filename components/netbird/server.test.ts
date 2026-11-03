/**
 * node --test components/netbird/server.test.ts
 *
 * The files the netbird-edge VM runs NetBird from (#3000). Expected values are
 * the shapes upstream's getting-started.sh (v0.82.0) writes for a built-in
 * Traefik install on 443.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { parseSetupResponse, relayAddress, renderDashboardEnv, renderRelayEnv, renderServerConfig, stunUri } from "./server.ts";

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

describe("renderServerConfig with standalone relays (#3001)", () => {
  const relays = ["relay-eus2.example.test", "relay-cus.example.test"];
  const config = renderServerConfig({ domain: "netbird.example.test", ...secrets, relays });
  const server = parse(config).server;

  it("lists every relay over TLS on 443, signed with the shared secret", () => {
    assert.deepEqual(server.relays.addresses, ["rels://relay-eus2.example.test:443", "rels://relay-cus.example.test:443"]);
    assert.equal(server.relays.secret, secrets.relayAuthSecret);
    assert.equal(server.relays.credentialsTTL, "12h");
  });

  // Listing relays turns the embedded relay off, and the embedded STUN with
  // it (combined/cmd/config.go applyRelayDefaults, v0.82.0): without stuns
  // clients would be told to use a STUN port nothing listens on.
  it("points clients at the relays' STUN and opens no STUN port of its own", () => {
    assert.deepEqual(server.stuns, [{ uri: "stun:relay-eus2.example.test:3478" }, { uri: "stun:relay-cus.example.test:3478" }]);
    assert.equal(server.stunPorts, undefined);
  });

  it("is otherwise the same config", () => {
    assert.equal(server.exposedAddress, "https://netbird.example.test:443");
    assert.equal(server.store.encryptionKey, secrets.datastoreEncryptionKey);
  });

  it("renders the embedded relay when no relay is listed", () => {
    const embedded = parse(renderServerConfig({ domain: "netbird.example.test", ...secrets, relays: [] })).server;
    assert.equal(embedded.relays, undefined);
    assert.deepEqual(embedded.stunPorts, [3478]);
  });

  it("refuses a relay name that is not a bare hostname", () => {
    assert.throws(() => relayAddress("rels://relay.example.test"), /bare hostname/);
    assert.throws(() => stunUri("relay.example.test:3478"), /bare hostname/);
  });
});

describe("renderRelayEnv", () => {
  const env = Object.fromEntries(
    renderRelayEnv({ domain: "relay-cus.example.test", authSecret: "a+b/c$d=" })
      .split("\n")
      .filter(line => line && !line.startsWith("#"))
      .map(line => line.split(/=(.*)/s).slice(0, 2))
      .map(([name, value]) => {
        // Single-quoted: compose reads an env_file value in single quotes literally.
        assert.match(value, /^'.*'$/, `${name} is not single-quoted`);
        return [name, value.slice(1, -1)];
      }),
  );

  it("serves plain HTTP behind Traefik and advertises the TLS address", () => {
    assert.equal(env.NB_LISTEN_ADDRESS, ":80");
    assert.equal(env.NB_EXPOSED_ADDRESS, "rels://relay-cus.example.test:443");
    assert.equal(env.NB_TRUSTED_PROXIES, "172.30.0.10");
  });

  it("runs STUN on 3478 and carries the secret verbatim", () => {
    assert.equal(env.NB_ENABLE_STUN, "true");
    assert.equal(env.NB_STUN_PORTS, "3478");
    assert.equal(env.NB_AUTH_SECRET, "a+b/c$d=");
  });

  it("refuses a secret it cannot quote, without echoing it", () => {
    for (const authSecret of ["a\nb", "a'b"]) {
      assert.throws(
        () => renderRelayEnv({ domain: "relay.example.test", authSecret }),
        (error: Error) => /quote or a newline/.test(error.message) && !error.message.includes(authSecret),
      );
    }
  });
});

describe("compose.yaml", () => {
  const compose = parse(readFileSync(new URL("./compose.yaml", import.meta.url), "utf8"));
  const services = compose.services;

  it("runs the relay only on relay hosts, with STUN on 3478/udp", () => {
    assert.deepEqual(services.relay.profiles, ["relay"]);
    assert.deepEqual(services.relay.ports, ["3478:3478/udp"]);
    assert.ok(services.relay.labels.includes("traefik.http.routers.netbird-relay.tls.certresolver=relay"));
  });

  // The relay owns 3478/udp; two containers cannot bind it.
  it("leaves 3478/udp to the relay", () => {
    assert.equal(services["netbird-server"].ports, undefined);
  });

  it("lets a fenced host turn off netbird-server's restart policy", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: compose's own interpolation, not a JS template.
    assert.equal(services["netbird-server"].restart, "${NETBIRD_SERVER_RESTART:-unless-stopped}");
  });

  it("keeps the relay's certificate out of the acme.json that is backed up and moves between hosts", () => {
    const command: string[] = services.traefik.command;
    assert.ok(command.includes("--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"));
    assert.ok(command.includes("--certificatesresolvers.relay.acme.storage=/letsencrypt/relay-acme.json"));
  });
});

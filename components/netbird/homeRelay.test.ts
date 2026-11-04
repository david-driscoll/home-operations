/**
 * node --test components/netbird/homeRelay.test.ts
 *
 * The home relay (D30) is described three times: homeRelay.ts (read by the
 * port forward and the management servers), and the compose file and .env
 * that celestia runs. These keep the static two in step with the first.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { HOME_RELAY, homeRelayDomain } from "./homeRelay.ts";
import { RELAY_TLS_PORT, relayAddress, renderServerConfig } from "./server.ts";

const stackDir = new URL("../../docker/celestia/netbird-relay/", import.meta.url);
const compose = parse(readFileSync(new URL("compose.yaml", stackDir), "utf8"));
const relay = compose.services["netbird-relay"];
const env = Object.fromEntries(
  readFileSync(new URL(".env", stackDir), "utf8")
    .split("\n")
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const [name, ...rest] = line.split("=");
      return [name, rest.join("=").replace(/^"|"$/g, "")];
    }),
);

describe("homeRelayDomain", () => {
  it("names the relay beside relay-eus2 and relay-cus", () => {
    assert.equal(homeRelayDomain("example.test"), "relay-home.example.test");
  });

  it("refuses anything but a bare domain", () => {
    assert.throws(() => homeRelayDomain("https://example.test"), /bare domain/);
    assert.throws(() => homeRelayDomain(""), /bare domain/);
  });

  it("is advertised on the port every relay address carries", () => {
    assert.equal(HOME_RELAY.wanPort, RELAY_TLS_PORT);
    assert.equal(relayAddress(homeRelayDomain("example.test")), "rels://relay-home.example.test:443");
  });
});

describe("docker/celestia/netbird-relay", () => {
  it("publishes the forward's target port, TCP for WebSocket and UDP for QUIC", () => {
    assert.deepEqual(relay.ports, [`${HOME_RELAY.lanPort}:443/tcp`, `${HOME_RELAY.lanPort}:443/udp`]);
    assert.equal(env.NB_LISTEN_ADDRESS, ":443");
  });

  it("advertises the address the management servers list", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: DockgeLxc's substitution, not a JS template.
    const expected = relayAddress(homeRelayDomain("example.test")).replace("example.test", "${searchDomain}");
    assert.equal(env.NB_EXPOSED_ADDRESS, expected);
  });

  it("gets its own certificate for that name, kept across restarts", () => {
    assert.equal(env.NB_LETSENCRYPT_DOMAINS, `${HOME_RELAY.label}.\${searchDomain}`);
    const dataDir = env.NB_LETSENCRYPT_DATA_DIR;
    assert.ok(
      relay.volumes.some((v: string) => v.startsWith("/opt/stacks-data/") && v.endsWith(`:${dataDir}`)),
      "the Let's Encrypt data dir is a host bind mount",
    );
  });

  it("reads the shared relay secret from OpenBao, where stacks/netbird-edge writes it", () => {
    assert.equal(env.NB_AUTH_SECRET, "ref+openbao://secrets/apps/netbird/server#/relayAuthSecret");
  });

  // A Host() rule would make DockgeLxc publish the name as a CNAME to the
  // host's LAN address, Cloudflare included.
  it("stays out of Traefik", () => {
    assert.equal(relay.labels["traefik.enable"], false);
    assert.doesNotMatch(readFileSync(new URL("compose.yaml", stackDir), "utf8"), /Host\(`/);
  });

  it("runs the Azure relays' release, digest-pinned", () => {
    const azure = parse(readFileSync(new URL("./compose.yaml", import.meta.url), "utf8")).services.relay.image as string;
    const [, azureTag] = azure.match(/^netbirdio\/relay:([^@]+)/) ?? [];
    assert.match(relay.image, new RegExp(`^netbirdio/relay:${azureTag?.replaceAll(".", "\\.")}@sha256:[0-9a-f]{64}$`));
  });
});

describe("renderServerConfig with the home relay", () => {
  const config = parse(
    renderServerConfig({
      domain: "netbird.example.test",
      relayAuthSecret: "secret",
      datastoreEncryptionKey: "c3RvcmU=",
      sessionCookieEncryptionKey: "Y29va2ll",
      relays: [{ host: "relay-eus2.example.test" }, { host: "relay-cus.example.test" }, { host: homeRelayDomain("example.test"), stun: false }],
    }),
  ).server;

  it("lists it with the Azure relays", () => {
    assert.deepEqual(config.relays.addresses, ["rels://relay-eus2.example.test:443", "rels://relay-cus.example.test:443", "rels://relay-home.example.test:443"]);
  });

  it("leaves it out of STUN", () => {
    assert.deepEqual(config.stuns, [{ uri: "stun:relay-eus2.example.test:3478" }, { uri: "stun:relay-cus.example.test:3478" }]);
  });
});

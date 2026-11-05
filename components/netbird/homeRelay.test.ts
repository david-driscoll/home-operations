/**
 * node --test components/netbird/homeRelay.test.ts
 *
 * The home relay (D32) is described in several places: homeRelay.ts (read by
 * stacks/unifi-network and the management servers), the compose file, .env,
 * tls/ and init.sh that celestia runs, and the Certificate Equestria issues.
 * These keep the static ones in step with the first.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { gatewayWanIpv4, HOME_RELAY, homeRelayDomain, isPublicIpv4 } from "./homeRelay.ts";
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

  // Let's Encrypt cannot resolve a private name, so no TLS-ALPN: the DNS-01
  // certificate stacks/unifi-network copies to OpenBao, rendered as files.
  it("loads the DNS-01 certificate from the files OpenBao renders", () => {
    assert.equal(env.NB_LETSENCRYPT_DOMAINS, undefined);
    const [mount] = relay.volumes as string[];
    assert.equal(mount, "./tls:/etc/netbird-relay/tls:ro");
    assert.equal(env.NB_TLS_CERT_FILE, "/etc/netbird-relay/tls/tls.crt");
    assert.equal(env.NB_TLS_KEY_FILE, "/etc/netbird-relay/tls/tls.key");
    for (const [file, field] of [
      ["tls.crt", "tls_crt"],
      ["tls.key", "tls_key"],
    ]) {
      assert.equal(readFileSync(new URL(`tls/${file}`, stackDir), "utf8").trim(), `ref+openbao://secrets/${HOME_RELAY.tlsBaoPath}#/${field}`);
    }
  });

  // The relay never reloads its certificate; init.sh is what makes a renewal take.
  it("restarts the relay when the certificate files change", () => {
    const init = readFileSync(new URL("init.sh", stackDir), "utf8");
    assert.match(init, /sha256sum/);
    assert.match(init, /tls\/tls\.crt tls\/tls\.key/);
    assert.match(init, /docker restart netbird-relay/);
  });

  it("matches the Certificate cert-manager issues", () => {
    const certificate = parse(readFileSync(new URL("../../kubernetes/apps/netbird-system/relay-home/certificate.yaml", import.meta.url), "utf8"));
    assert.equal(certificate.spec.secretName, HOME_RELAY.tlsSecret.name);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Flux's substitution, not a JS template.
    assert.deepEqual(certificate.spec.dnsNames, [homeRelayDomain("example.test").replace("example.test", "${ROOT_DOMAIN}")]);
    const ks = parse(readFileSync(new URL("../../kubernetes/apps/netbird-system/relay-home/ks.yaml", import.meta.url), "utf8"));
    assert.equal(ks.spec.targetNamespace, HOME_RELAY.tlsSecret.namespace);
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

describe("gatewayWanIpv4", () => {
  const gateway = { type: "udm", name: "gw" };

  it("reads the gateway's wan1 address", () => {
    assert.equal(
      gatewayWanIpv4([
        { type: "usw", ip: "203.0.113.9" },
        { ...gateway, wan1: { ip: "198.51.100.7" }, ip: "203.0.113.1" },
      ]),
      "198.51.100.7",
    );
  });

  it("falls back to the uplink, then the device address", () => {
    assert.equal(gatewayWanIpv4([{ ...gateway, uplink: { ip: "198.51.100.8" } }]), "198.51.100.8");
    assert.equal(gatewayWanIpv4([{ ...gateway, ip: "198.51.100.9" }]), "198.51.100.9");
  });

  // A port forward cannot be reached through any of these.
  it("refuses a private, CGNAT or missing address rather than publish it", () => {
    for (const ip of ["10.10.0.1", "192.168.1.1", "172.20.0.1", "100.100.1.1", "169.254.1.1", "not-an-ip"]) {
      assert.throws(() => gatewayWanIpv4([{ ...gateway, wan1: { ip } }]), /no public IPv4/, ip);
    }
    assert.throws(() => gatewayWanIpv4([gateway]), /no public IPv4/);
  });

  it("refuses to guess between gateways, or without one", () => {
    assert.throws(() => gatewayWanIpv4([]), /one UniFi gateway, found 0/);
    assert.throws(() => gatewayWanIpv4([gateway, { type: "ugw" }]), /found 2/);
  });

  it("knows the routable ranges", () => {
    assert.ok(isPublicIpv4("198.51.100.1"));
    assert.ok(isPublicIpv4("100.63.255.255"));
    assert.ok(!isPublicIpv4("100.64.0.1"));
    assert.ok(!isPublicIpv4("224.0.0.1"));
    assert.ok(!isPublicIpv4("256.1.1.1"));
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

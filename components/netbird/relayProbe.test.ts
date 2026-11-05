/**
 * node --test components/netbird/relayProbe.test.ts
 *
 * The relay checks (D47). The home-relay probe script runs for real under
 * bash, against fake `curl`, `openssl` and `getent` that record their calls
 * and answer from environment variables: it reports only on a verified
 * connect, and never when it cannot reach the relay.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  RELAY_CERT_MIN_DAYS,
  RELAY_GATUS_GROUP,
  RELAY_PROBE_INTERVAL_MINUTES,
  RELAY_PROBE_STALE_AFTER_MINUTES,
  relayProbeHeartbeat,
  relayTlsEndpoint,
  renderRelayProbeScript,
  renderRelayProbeUnits,
} from "./relayProbe.ts";

const NAME = "relay-home.example.test";
const TOKEN = "netbird-relays_relay-home-from-azure-eus2";
const URL = "https://uptime.example.ts.net";

function box() {
  const dir = mkdtempSync(join(tmpdir(), "relay-probe-"));
  const bin = join(dir, "bin");
  const log = join(dir, "log");
  spawnSync("mkdir", ["-p", bin]);
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake("getent", `[ -n "\${FAKE_RESOLVE:-}" ] && echo "\${FAKE_RESOLVE} STREAM $3" || exit 2`);
  fake("curl", `echo "curl $*" >> "$FAKE_LOG"; case "$*" in *"/external"*) exit 0 ;; esac; [ "\${FAKE_TLS_OK:-1}" = 1 ]`);
  fake("openssl", `[ "$1" = s_client ] && exit 0; echo "openssl $*" >> "$FAKE_LOG"; [ "\${FAKE_CERT_OK:-1}" = 1 ]`);
  return { dir, bin, log };
}

function run(script: string, env: Record<string, string> = {}) {
  const b = box();
  const path = join(b.dir, "probe.sh");
  writeFileSync(path, script);
  const result = spawnSync("bash", [path], { encoding: "utf8", env: { PATH: `${b.bin}:/usr/bin:/bin`, FAKE_LOG: b.log, ...env } });
  const calls = existsSync(b.log) ? readFileSync(b.log, "utf8").trim().split("\n") : [];
  return { status: result.status, stderr: result.stderr, calls, reports: calls.filter(c => c.includes("/external")) };
}

const script = (address?: string) => renderRelayProbeScript({ name: NAME, address, heartbeat: { url: `${URL}/`, token: TOKEN } });

describe("renderRelayProbeScript", () => {
  it("is valid bash", () => {
    const b = box();
    const path = join(b.dir, "probe.sh");
    writeFileSync(path, script("203.0.113.7"));
    assert.equal(spawnSync("bash", ["-n", path]).status, 0);
  });

  it("connects by the fallback address with the relay's name, and reports success", () => {
    const { status, calls, reports } = run(script("203.0.113.7"));
    assert.equal(status, 0);
    assert.ok(calls.some(c => c.includes(`--connect-to ${NAME}:443:203.0.113.7:443 https://${NAME}/`)));
    assert.deepEqual(reports, [`curl -sS -o /dev/null --max-time 15 -X POST -H Authorization: Bearer ${TOKEN} ${URL}/api/v1/endpoints/${TOKEN}/external?success=true`]);
  });

  it("prefers the name when it resolves", () => {
    const { calls } = run(script("203.0.113.7"), { FAKE_RESOLVE: "198.51.100.9" });
    assert.ok(calls.some(c => c.includes(`--connect-to ${NAME}:443:198.51.100.9:443`)));
  });

  it("reports nothing when the relay does not answer verified TLS", () => {
    const { status, reports, stderr } = run(script("203.0.113.7"), { FAKE_TLS_OK: "0" });
    assert.equal(status, 1);
    assert.deepEqual(reports, []);
    assert.match(stderr, /no verified TLS/);
  });

  it("reports nothing when the name does not resolve and there is no address", () => {
    const { status, calls } = run(script());
    assert.equal(status, 1);
    assert.deepEqual(calls, []);
  });

  it("reports an explicit failure for a certificate about to expire", () => {
    const { status, reports, calls } = run(script("203.0.113.7"), { FAKE_CERT_OK: "0" });
    assert.equal(status, 1);
    assert.ok(calls.some(c => c.includes(`-checkend ${RELAY_CERT_MIN_DAYS * 86400}`)));
    assert.equal(reports.length, 1);
    assert.match(reports[0], /success=false&error=certificate-expires-soon$/);
  });

  it("refuses values it would have to quote", () => {
    assert.throws(() => renderRelayProbeScript({ name: "relay home", heartbeat: { url: URL, token: TOKEN } }), /does not quote/);
    assert.throws(() => renderRelayProbeScript({ name: NAME, address: "1.2.3.4;reboot", heartbeat: { url: URL, token: TOKEN } }), /does not quote/);
  });
});

describe("the Gatus side", () => {
  it("checks a public relay's handshake and certificate", () => {
    const endpoint = relayTlsEndpoint("relay-eus2.example.test");
    assert.equal(endpoint.url, "tls://relay-eus2.example.test:443");
    assert.equal(endpoint.name, "relay-eus2");
    assert.equal(endpoint.group, RELAY_GATUS_GROUP);
    assert.deepEqual(endpoint.conditions, ["[CONNECTED] == true", `[CERTIFICATE_EXPIRATION] > ${RELAY_CERT_MIN_DAYS * 24}h`]);
  });

  it("lets the heartbeat go stale after three missed probes", () => {
    const heartbeat = relayProbeHeartbeat({ name: "relay-home-from-azure-eus2", token: TOKEN });
    assert.equal(heartbeat.heartbeat?.interval, `${RELAY_PROBE_STALE_AFTER_MINUTES}m`);
    assert.equal(RELAY_PROBE_STALE_AFTER_MINUTES, 3 * RELAY_PROBE_INTERVAL_MINUTES);
    assert.equal(heartbeat.token, TOKEN);
  });

  it("runs the probe every RELAY_PROBE_INTERVAL_MINUTES", () => {
    assert.match(renderRelayProbeUnits().timer, new RegExp(`OnCalendar=\\*:0/${RELAY_PROBE_INTERVAL_MINUTES}\n`));
  });
});

/**
 * node --test components/netbird/relayProbe.test.ts
 *
 * The relay checks (D47). The home-relay probe script runs for real under
 * bash, against fake `curl`, `openssl` and `dig` that record their calls
 * and answer from environment variables: it resolves the name live through
 * the Technitium nodes, reports only on a verified connect, and never when it
 * cannot resolve or reach the relay.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  dnsResolvers,
  MAGIC_DNS,
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
const DNS_A = "100.64.0.11";
const DNS_B = "100.64.0.12";
const GATUS_HOST = "uptime.example.ts.net";
const GATUS_VIP = "100.64.0.20";

function box() {
  const dir = mkdtempSync(join(tmpdir(), "relay-probe-"));
  const bin = join(dir, "bin");
  const log = join(dir, "log");
  spawnSync("mkdir", ["-p", bin]);
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // FAKE_DNS="<resolver>=<answer> ...": the answer that resolver gives (`timeout`
  // prints what dig prints on stdout when a server does not answer). A resolver
  // not listed answers nothing.
  fake(
    "dig",
    `echo "dig $*" >> "$FAKE_LOG"
for a in "$@"; do case "$a" in @*) server=\${a#@} ;; esac; done
for pair in \${FAKE_DNS:-}; do
  [ "\${pair%%=*}" = "$server" ] || continue
  answer=\${pair#*=}
  if [ "$answer" = timeout ]; then echo ";; connection timed out; no servers could be reached"; exit 9; fi
  printf '%s\\n' \${answer//,/ }
done
exit 0`,
  );
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

const script = (resolvers: string[] = [DNS_A, DNS_B]) => renderRelayProbeScript({ name: NAME, resolvers, heartbeat: { url: `${URL}/`, token: TOKEN } });
const curlCalls = (calls: string[]) => calls.filter(c => c.startsWith("curl "));
/** The relay lookups only: the report's MagicDNS lookup for the Gatus VIP is asserted on its own. */
const digCalls = (calls: string[]) => calls.filter(c => c.startsWith("dig ") && c.endsWith(` ${NAME} A`));

describe("renderRelayProbeScript", () => {
  it("is valid bash", () => {
    const b = box();
    const path = join(b.dir, "probe.sh");
    writeFileSync(path, script());
    assert.equal(spawnSync("bash", ["-n", path]).status, 0);
  });

  it("asks the first Technitium node for the name, connects to its answer with the relay's name, and reports success", () => {
    const { status, calls, reports } = run(script(), { FAKE_DNS: `${DNS_A}=203.0.113.7 ${MAGIC_DNS}=${GATUS_VIP}` });
    assert.equal(status, 0);
    assert.deepEqual(digCalls(calls), [`dig +short +time=2 +tries=1 @${DNS_A} ${NAME} A`]);
    assert.ok(calls.some(c => c.includes(`--connect-to ${NAME}:443:203.0.113.7:443 https://${NAME}/`)));
    assert.deepEqual(reports, [`curl -sS -o /dev/null --max-time 15 --resolve ${GATUS_HOST}:443:${GATUS_VIP} -X POST -H Authorization: Bearer ${TOKEN} ${URL}/api/v1/endpoints/${TOKEN}/external?success=true`]);
  });

  it("looks the Gatus VIP up through MagicDNS, since the host resolver cannot see tailnet names", () => {
    const { calls } = run(script(), { FAKE_DNS: `${DNS_A}=203.0.113.7 ${MAGIC_DNS}=${GATUS_VIP}` });
    assert.ok(calls.includes(`dig +short +time=2 +tries=1 @${MAGIC_DNS} ${GATUS_HOST} A`));
  });

  it("still reports, unpinned, when MagicDNS gives no answer", () => {
    const { status, reports } = run(script(), { FAKE_DNS: `${DNS_A}=203.0.113.7 ${MAGIC_DNS}=timeout` });
    assert.equal(status, 0);
    assert.deepEqual(reports, [`curl -sS -o /dev/null --max-time 15 -X POST -H Authorization: Bearer ${TOKEN} ${URL}/api/v1/endpoints/${TOKEN}/external?success=true`]);
  });

  it("falls back to the next node when one times out or has no record", () => {
    const timedOut = run(script(), { FAKE_DNS: `${DNS_A}=timeout ${DNS_B}=198.51.100.9` });
    assert.equal(timedOut.status, 0);
    assert.equal(digCalls(timedOut.calls).length, 2);
    assert.ok(timedOut.calls.some(c => c.includes(`--connect-to ${NAME}:443:198.51.100.9:443`)));
    const empty = run(script(), { FAKE_DNS: `${DNS_B}=198.51.100.9` });
    assert.ok(empty.calls.some(c => c.includes(`--connect-to ${NAME}:443:198.51.100.9:443`)));
  });

  it("takes the A record from an answer that goes through a CNAME", () => {
    const { calls } = run(script(), { FAKE_DNS: `${DNS_A}=wan.example.test.,192.0.2.44` });
    assert.ok(calls.some(c => c.includes(`--connect-to ${NAME}:443:192.0.2.44:443`)));
  });

  it("reports nothing, and connects to nothing, when no node resolves the name", () => {
    const { status, calls, stderr } = run(script(), { FAKE_DNS: `${DNS_A}=timeout` });
    assert.equal(status, 1);
    assert.equal(digCalls(calls).length, 2);
    assert.deepEqual(curlCalls(calls), []);
    assert.match(stderr, /no resolver .* answered/);
  });

  it("reports nothing when the relay does not answer verified TLS", () => {
    const { status, reports, stderr } = run(script(), { FAKE_DNS: `${DNS_A}=203.0.113.7`, FAKE_TLS_OK: "0" });
    assert.equal(status, 1);
    assert.deepEqual(reports, []);
    assert.match(stderr, /no verified TLS/);
  });

  it("reports an explicit failure for a certificate about to expire", () => {
    const { status, reports, calls } = run(script(), { FAKE_DNS: `${DNS_A}=203.0.113.7`, FAKE_CERT_OK: "0" });
    assert.equal(status, 1);
    assert.ok(calls.some(c => c.includes(`-checkend ${RELAY_CERT_MIN_DAYS * 86400}`)));
    assert.equal(reports.length, 1);
    assert.match(reports[0], /success=false&error=certificate-expires-soon$/);
  });

  it("refuses values it would have to quote", () => {
    assert.throws(() => renderRelayProbeScript({ name: "relay home", resolvers: [DNS_A], heartbeat: { url: URL, token: TOKEN } }), /does not quote/);
    assert.throws(() => renderRelayProbeScript({ name: NAME, resolvers: ["1.2.3.4;reboot"], heartbeat: { url: URL, token: TOKEN } }), /does not quote/);
  });

  it("refuses to render with no resolver", () => {
    assert.throws(() => renderRelayProbeScript({ name: NAME, resolvers: [], heartbeat: { url: URL, token: TOKEN } }), /no resolvers/);
  });
});

describe("dnsResolvers", () => {
  it("lists the tag:dns IPv4 addresses once each, in cluster-key order", () => {
    const machines = [
      { key: "luna", ip: "100.64.0.12" },
      { key: "celestia", ip: "100.64.0.11" },
      { key: "equestria", ip: "fd7a:115c:a1e0::1" },
      { key: "celestia-old", ip: "100.64.0.11" },
    ];
    assert.deepEqual(dnsResolvers(machines), ["100.64.0.11", "100.64.0.12"]);
  });

  it("is empty when the tailnet has no tag:dns device", () => {
    assert.deepEqual(dnsResolvers([]), []);
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

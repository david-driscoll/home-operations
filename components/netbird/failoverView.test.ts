/**
 * node --test components/netbird/failoverView.test.ts
 *
 * Each host's view of the others (#3161, ADR 0002): the second view the
 * failover watchdog needs before it flips. The script runs for real under
 * bash, against fake `curl` and `dig` that record their calls: it probes
 * management at every other host with the certificate verified for the
 * lease's name, and PUTs what it saw to Garage, signed with the bucket key.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FAILOVER_VIEW_HEALTH_PATH, FAILOVER_VIEW_INTERVAL_SECONDS, FAILOVER_VIEW_PREFIX, failoverViewPaths, renderFailoverViewCurlConfig, renderFailoverViewScript, renderFailoverViewUnits } from "./failoverView.ts";
import { MAGIC_DNS } from "./relayProbe.ts";

const LEASE = "netbird.example.test";
const PRIMARY = "203.0.113.10";
const OCI = "192.0.2.5";
const GARAGE_HOST = "garage-s3.example.ts.net";
const GARAGE_VIP = "100.64.0.30";
const ENDPOINT = `https://${GARAGE_HOST}`;

function box() {
  const dir = mkdtempSync(join(tmpdir(), "failover-view-"));
  const bin = join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  const fake = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake("dig", `echo "dig $*" >> "$FAKE_LOG"; [ -n "\${FAKE_MAGIC_DNS:-}" ] && echo "$FAKE_MAGIC_DNS"; exit 0`);
  // A health probe prints the HTTP code FAKE_HEALTH gives its address
  // ("<ip>=<code> ..."; unlisted: 000, no answer). The PUT copies its body to
  // FAKE_PUT and exits FAKE_PUT_STATUS.
  fake(
    "curl",
    `echo "curl $*" >> "$FAKE_LOG"
case "$*" in
  *--aws-sigv4*)
    prev=; for a in "$@"; do [ "$prev" = -T ] && cp "$a" "$FAKE_PUT"; prev=$a; done
    exit "\${FAKE_PUT_STATUS:-0}" ;;
esac
for a in "$@"; do case "$a" in --resolve) next=1 ;; *) [ -n "\${next:-}" ] && { ip=\${a##*:}; next=; } ;; esac; done
code=000
for pair in \${FAKE_HEALTH:-}; do [ "\${pair%%=*}" = "$ip" ] && code=\${pair#*=}; done
printf '%s' "$code"
[ "$code" != 000 ]`,
  );
  return { dir, bin, log: join(dir, "log"), put: join(dir, "put.json") };
}

function run(script: string, env: Record<string, string> = {}) {
  const b = box();
  const path = join(b.dir, "view.sh");
  writeFileSync(path, script.replaceAll(failoverViewPaths().dir, b.dir));
  const result = spawnSync("bash", [path], { encoding: "utf8", env: { PATH: `${b.bin}:/usr/bin:/bin`, FAKE_LOG: b.log, FAKE_PUT: b.put, FAKE_MAGIC_DNS: GARAGE_VIP, ...env } });
  const calls = existsSync(b.log) ? readFileSync(b.log, "utf8").trim().split("\n") : [];
  const put = existsSync(b.put) ? JSON.parse(readFileSync(b.put, "utf8")) : undefined;
  return { status: result.status, stderr: result.stderr, calls, put, dir: b.dir };
}

const script = (targets = [PRIMARY]) => renderFailoverViewScript({ observer: "azure-cus", lease: LEASE, targets, s3: { endpoint: `${ENDPOINT}/`, bucket: "netbird-backups" } });

describe("renderFailoverViewScript", () => {
  it("is valid bash", () => {
    const b = box();
    const path = join(b.dir, "view.sh");
    writeFileSync(path, script());
    assert.equal(spawnSync("bash", ["-n", path]).status, 0);
  });

  it("probes management at each other host under the lease's name, certificate verified", () => {
    const { status, calls } = run(script([PRIMARY, OCI]), { FAKE_HEALTH: `${PRIMARY}=200 ${OCI}=200` });
    assert.equal(status, 0);
    const probes = calls.filter(c => c.startsWith("curl ") && !c.includes("--aws-sigv4"));
    assert.deepEqual(probes, [
      `curl -s -o /dev/null -w %{http_code} --max-time 10 --resolve ${LEASE}:443:${PRIMARY} https://${LEASE}${FAILOVER_VIEW_HEALTH_PATH}`,
      `curl -s -o /dev/null -w %{http_code} --max-time 10 --resolve ${LEASE}:443:${OCI} https://${LEASE}${FAILOVER_VIEW_HEALTH_PATH}`,
    ]);
    assert.ok(!probes.some(c => / -k | --insecure /.test(c)));
  });

  it("publishes what it saw: only a 200 is healthy", () => {
    assert.deepEqual(run(script([PRIMARY, OCI]), { FAKE_HEALTH: `${PRIMARY}=200 ${OCI}=502` }).put, { observer: "azure-cus", targets: { [PRIMARY]: true, [OCI]: false } });
    assert.deepEqual(run(script([PRIMARY])).put, { observer: "azure-cus", targets: { [PRIMARY]: false } }, "no answer at all is down too");
  });

  it("PUTs to the bucket under its own name, SigV4-signed with the key from its curl config, through MagicDNS", () => {
    const { calls, dir } = run(script(), { FAKE_HEALTH: `${PRIMARY}=200` });
    const put = calls.find(c => c.includes("--aws-sigv4"));
    assert.ok(put);
    assert.ok(put.includes("--aws-sigv4 aws:amz:garage:s3"));
    assert.ok(put.includes(`-K ${dir}/s3.curlrc`));
    assert.ok(put.includes("-H x-amz-content-sha256: UNSIGNED-PAYLOAD"));
    assert.ok(put.includes(`--resolve ${GARAGE_HOST}:443:${GARAGE_VIP}`));
    assert.ok(put.endsWith(`${ENDPOINT}/netbird-backups/${FAILOVER_VIEW_PREFIX}azure-cus.json`));
    assert.ok(calls.includes(`dig +short +time=2 +tries=1 @${MAGIC_DNS} ${GARAGE_HOST} A`));
  });

  it("fails the run when Garage refuses the PUT, so the view goes stale rather than lying", () => {
    const { status, stderr } = run(script(), { FAKE_PUT_STATUS: "22" });
    assert.notEqual(status, 0);
    assert.match(stderr, /could not publish/);
  });

  it("refuses values it would have to quote, and an empty target list", () => {
    assert.throws(() => renderFailoverViewScript({ observer: "azure cus", lease: LEASE, targets: [PRIMARY], s3: { endpoint: ENDPOINT, bucket: "b" } }), /observer/);
    assert.throws(() => renderFailoverViewScript({ observer: "azure-cus", lease: LEASE, targets: ["1.2.3.4;rm"], s3: { endpoint: ENDPOINT, bucket: "b" } }), /target/);
    assert.throws(() => renderFailoverViewScript({ observer: "azure-cus", lease: LEASE, targets: [], s3: { endpoint: ENDPOINT, bucket: "b" } }), /no other host/);
  });
});

describe("renderFailoverViewCurlConfig", () => {
  it("holds the key as curl's user, so it never appears on a command line", () => {
    assert.equal(renderFailoverViewCurlConfig({ accessKeyId: "GK0123abc", secretAccessKey: "s3cr3t0123" }), 'user = "GK0123abc:s3cr3t0123"\n');
  });

  it("refuses a key it would have to quote", () => {
    assert.throws(() => renderFailoverViewCurlConfig({ accessKeyId: "GK", secretAccessKey: 'a"b' }), /quote/);
  });
});

describe("renderFailoverViewUnits", () => {
  it("runs the view every FAILOVER_VIEW_INTERVAL_SECONDS, well inside the watchdog's freshness window", () => {
    const { timer, service } = renderFailoverViewUnits();
    assert.match(timer, new RegExp(`OnUnitActiveSec=${FAILOVER_VIEW_INTERVAL_SECONDS}s`));
    assert.match(service, new RegExp(`ExecStart=${failoverViewPaths().script}`));
    assert.ok(FAILOVER_VIEW_INTERVAL_SECONDS <= 60);
  });
});

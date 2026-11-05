/**
 * node --test components/netbird/metrics.test.ts
 *
 * The Alloy config that ships the netbird-edge hosts' metrics to Thanos, and
 * the compose service that runs it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { NETBIRD_METRICS_CLUSTER, NETBIRD_METRICS_PORT, renderAlloyConfig } from "./metrics.ts";
import { renderServerConfig } from "./server.ts";

const base = { host: "netbird-azure-eus2", remoteWriteUrl: "http://thanos-receive.tailnet.test:19291/api/v1/receive", region: "eastus2" };

describe("renderAlloyConfig", () => {
  const withRelay = renderAlloyConfig({ ...base, relay: true });
  const withoutRelay = renderAlloyConfig({ ...base, relay: false });

  it("scrapes the combined server, and the relay only where it runs", () => {
    assert.match(withRelay, /"__address__" = "netbird-server:9090", "job" = "netbird-server", "host" = "netbird-azure-eus2"/);
    assert.match(withRelay, /"__address__" = "netbird-relay:9090", "job" = "netbird-relay"/);
    assert.doesNotMatch(withoutRelay, /netbird-relay/);
  });

  it("remote-writes to Thanos with the labels the dashboards filter on", () => {
    assert.match(withRelay, /url = "http:\/\/thanos-receive\.tailnet\.test:19291\/api\/v1\/receive"/);
    assert.match(withRelay, new RegExp(`cluster += "${NETBIRD_METRICS_CLUSTER}"`));
    assert.match(withRelay, /environment += "homelab"/);
    assert.match(withRelay, /region += "eastus2"/);
  });

  it("strips the combined server's signal_ prefix and renames endpoint to exported_endpoint", () => {
    assert.match(withRelay, /regex += "signal_\(\.\+\)"\n\s+target_label += "__name__"\n\s+replacement += "\$1"/);
    assert.match(withRelay, /source_labels = \["endpoint"\]\n\s+regex += "\(\.\+\)"\n\s+target_label += "exported_endpoint"/);
    assert.match(withRelay, /action = "labeldrop"\n\s+regex += "endpoint"/);
  });

  it("scrapes the CrowdSec agent on every host, labelled with its LAPI name, outside the NetBird relabelling", () => {
    for (const config of [withRelay, withoutRelay]) {
      assert.match(config, /"__address__" = "netbird-crowdsec:6060", "job" = "crowdsec", "host" = "netbird-azure-eus2", "lapi_name" = "netbird_azure_eus2"/);
      assert.match(config, /prometheus\.scrape "crowdsec" \{[\s\S]*?forward_to += \[prometheus\.relabel\.crowdsec\.receiver\]/);
    }
  });

  it("refuses a host or URL that would break the config", () => {
    assert.throws(() => renderAlloyConfig({ ...base, host: 'bad"host', relay: true }), /not a bare hostname/);
    assert.throws(() => renderAlloyConfig({ ...base, remoteWriteUrl: "thanos:19291", relay: true }), /not http/);
  });

  it("matches the port the server config exposes", () => {
    const config = renderServerConfig({ domain: "netbird.example.test", relayAuthSecret: "a", datastoreEncryptionKey: "b", sessionCookieEncryptionKey: "c" });
    assert.match(config, new RegExp(`^ {2}metricsPort: ${NETBIRD_METRICS_PORT}$`, "m"));
  });
});

describe("compose.yaml alloy service", () => {
  const compose = parse(readFileSync(new URL("./compose.yaml", import.meta.url), "utf8"));
  const alloy = compose.services.alloy;

  it("only runs with the metrics profile, on the compose network, resolving tailnet names", () => {
    assert.deepEqual(alloy.profiles, ["metrics"]);
    assert.deepEqual(alloy.networks, ["netbird"]);
    assert.deepEqual(alloy.dns, ["100.100.100.100"]);
  });

  it("publishes no ports: the hosts are internet-facing", () => {
    assert.equal(alloy.ports, undefined);
  });

  it("reads the rendered config", () => {
    assert.ok(alloy.volumes.includes("./alloy.alloy:/etc/alloy/config.alloy:ro"));
    assert.ok(alloy.command.includes("/etc/alloy/config.alloy"));
  });
});

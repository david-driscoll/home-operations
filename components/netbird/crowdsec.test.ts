/**
 * node --test components/netbird/crowdsec.test.ts
 *
 * The edge hosts' CrowdSec files, and the compose wiring they depend on.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import {
  CROWDSEC_APPSEC_PORT,
  CROWDSEC_COLLECTIONS,
  CROWDSEC_CONTAINER,
  CROWDSEC_INTERNAL_CIDRS,
  CROWDSEC_METRICS_PORT,
  CROWDSEC_MIDDLEWARE,
  CROWDSEC_SOCKET_PROXY,
  CROWDSEC_SOCKET_PROXY_PORT,
  crowdsecLapiEnv,
  crowdsecLapiName,
  crowdsecLapiUrl,
  renderAppsecAcquisition,
  renderBouncerKeyFile,
  renderCrowdsecConfigLocal,
  renderCrowdsecEnv,
  renderCrowdsecWhitelist,
  renderTraefikAcquisition,
  renderTraefikDynamic,
  TRAEFIK_BOUNCER_KEY_PATH,
  TRAEFIK_CONTAINER,
} from "./crowdsec.ts";

const tailnet = "tailnet.test";

describe("LAPI identities", () => {
  it("names a host's machine and bouncer alike, with underscores the LAPI's env vars can carry", () => {
    assert.equal(crowdsecLapiName("netbird-azure-eus2"), "netbird_azure_eus2");
    assert.deepEqual(crowdsecLapiEnv("netbird-azure-eus2"), { bouncerKey: "BOUNCER_KEY_netbird_azure_eus2", machinePassword: "EDGE_MACHINE_PASSWORD_netbird_azure_eus2" });
  });

  it("keeps the bouncer name the chart entrypoint derives from the env var (cut -d_ -f3-)", () => {
    const { bouncerKey } = crowdsecLapiEnv("netbird-azure-cus");
    assert.equal(bouncerKey.split("_").slice(2).join("_"), crowdsecLapiName("netbird-azure-cus"));
  });

  it("refuses a host that is not a bare hostname", () => {
    assert.throws(() => crowdsecLapiName("Bad_Host"), /not a bare hostname/);
    assert.throws(() => crowdsecLapiName("a.b"), /not a bare hostname/);
  });

  it("reaches the LAPI by its tailnet name on 8080", () => {
    assert.equal(crowdsecLapiUrl(tailnet), "http://crowdsec-lapi.tailnet.test:8080");
    assert.throws(() => crowdsecLapiUrl("bad tailnet"), /not a DNS name/);
  });
});

describe("renderCrowdsecEnv", () => {
  const env = renderCrowdsecEnv({ host: "netbird-azure-eus2", tailnet, machinePassword: "abc123" });

  it("runs agent-only, logging in to Equestria's LAPI as the host's machine", () => {
    assert.match(env, /^DISABLE_LOCAL_API='true'$/m);
    assert.match(env, /^LOCAL_API_URL='http:\/\/crowdsec-lapi\.tailnet\.test:8080'$/m);
    assert.match(env, /^AGENT_USERNAME='netbird_azure_eus2'$/m);
    assert.match(env, /^AGENT_PASSWORD='abc123'$/m);
  });

  it("refuses a password the env file or the plugin could not carry", () => {
    assert.throws(() => renderCrowdsecEnv({ host: "h", tailnet, machinePassword: "a'b" }), /alphanumeric/);
    assert.throws(() => renderBouncerKeyFile("key\n"), /alphanumeric/);
  });

  it("writes the bouncer key bare, with no newline", () => {
    assert.equal(renderBouncerKeyFile("Abc123"), "Abc123");
  });
});

describe("acquisitions and config", () => {
  it("reads netbird-traefik's log through the socket proxy, as Traefik's", () => {
    const acquis = parse(renderTraefikAcquisition());
    assert.equal(acquis.source, "docker");
    assert.equal(acquis.docker_host, `tcp://${CROWDSEC_SOCKET_PROXY}:${CROWDSEC_SOCKET_PROXY_PORT}`);
    assert.deepEqual(acquis.container_name, [TRAEFIK_CONTAINER]);
    assert.deepEqual(acquis.labels, { type: "traefik" });
  });

  it("listens for AppSec on the compose network with the default rules", () => {
    const appsec = parse(renderAppsecAcquisition());
    assert.equal(appsec.source, "appsec");
    assert.equal(appsec.listen_addr, `0.0.0.0:${CROWDSEC_APPSEC_PORT}`);
    assert.deepEqual(appsec.appsec_configs, ["crowdsecurity/appsec-default"]);
  });

  it("serves metrics beyond loopback, for Alloy", () => {
    const local = parse(renderCrowdsecConfigLocal());
    assert.equal(local.prometheus.listen_addr, "0.0.0.0");
    assert.equal(local.prometheus.listen_port, CROWDSEC_METRICS_PORT);
  });

  it("whitelists every internal range", () => {
    assert.deepEqual(parse(renderCrowdsecWhitelist()).whitelist.cidr, [...CROWDSEC_INTERNAL_CIDRS]);
  });
});

describe("renderTraefikDynamic", () => {
  const off = parse(renderTraefikDynamic({ tailnet, enforce: false }));
  const on = parse(renderTraefikDynamic({ tailnet, enforce: true }));
  const plugin = off.http.middlewares["netbird-crowdsec"].plugin["crowdsec-bouncer-traefik-plugin"];

  it("defines the middleware the routers name, under the plugin name compose.yaml loads", () => {
    assert.equal(CROWDSEC_MIDDLEWARE, "netbird-crowdsec@file");
    assert.ok(plugin);
  });

  it("is a kill switch: enforce flips only `enabled`", () => {
    assert.equal(plugin.enabled, false);
    const onPlugin = on.http.middlewares["netbird-crowdsec"].plugin["crowdsec-bouncer-traefik-plugin"];
    assert.equal(onPlugin.enabled, true);
    assert.deepEqual({ ...onPlugin, enabled: false }, plugin);
  });

  it("streams from the LAPI over the tailnet with the mounted key", () => {
    assert.equal(plugin.crowdsecMode, "stream");
    assert.equal(plugin.crowdsecLapiHost, "crowdsec-lapi.tailnet.test:8080");
    assert.equal(plugin.crowdsecLapiKeyFile, TRAEFIK_BOUNCER_KEY_PATH);
  });

  it("fails open on every path", () => {
    assert.equal(plugin.streamStartupBlock, false);
    assert.equal(plugin.updateMaxFailure, -1);
    assert.equal(plugin.crowdsecAppsecFailureBlock, false);
    assert.equal(plugin.crowdsecAppsecUnreachableBlock, false);
  });

  it("asks the local AppSec and trusts no forwarded headers", () => {
    assert.equal(plugin.crowdsecAppsecEnabled, true);
    assert.equal(plugin.crowdsecAppsecHost, `${CROWDSEC_CONTAINER}:${CROWDSEC_APPSEC_PORT}`);
    assert.equal(plugin.forwardedHeadersTrustedIPs, undefined);
    assert.deepEqual(plugin.clientTrustedIPs, [...CROWDSEC_INTERNAL_CIDRS]);
  });
});

describe("compose.yaml CrowdSec wiring", () => {
  const compose = parse(readFileSync(new URL("./compose.yaml", import.meta.url), "utf8"));
  const { traefik, crowdsec, dashboard } = compose.services;
  const socket = compose.services["crowdsec-socket"];
  const server = compose.services["netbird-server"];
  const label = (labels: string[], key: string) => labels.find(l => l.startsWith(`${key}=`))?.slice(key.length + 1);

  it("loads the plugin, aborting on a failed download, and the file provider", () => {
    assert.ok(traefik.command.includes("--experimental.abortOnPluginFailure=true"));
    assert.ok(traefik.command.includes("--experimental.plugins.crowdsec-bouncer-traefik-plugin.modulename=github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin"));
    assert.ok(traefik.command.includes("--providers.file.filename=/etc/traefik/dynamic.yaml"));
    assert.ok(traefik.volumes.includes("./traefik-dynamic.yaml:/etc/traefik/dynamic.yaml:ro"));
    assert.ok(traefik.volumes.includes(`./crowdsec-bouncer.key:${TRAEFIK_BOUNCER_KEY_PATH}:ro`));
    assert.deepEqual(traefik.dns, ["100.100.100.100", "1.1.1.1"]);
  });

  it("puts the dashboard, /api and /oauth2 through the middleware, and nothing else", () => {
    assert.equal(label(dashboard.labels, "traefik.http.routers.netbird-dashboard.middlewares"), CROWDSEC_MIDDLEWARE);
    assert.equal(label(server.labels, "traefik.http.routers.netbird-api.middlewares"), CROWDSEC_MIDDLEWARE);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: compose's own interpolation, matched literally.
    assert.equal(label(server.labels, "traefik.http.routers.netbird-api.rule"), "Host(`${NETBIRD_DOMAIN}`) && (PathPrefix(`/api`) || PathPrefix(`/oauth2`))");
    // Above netbird-backend, which still carries /api and /oauth2 in its rule.
    assert.ok(Number(label(server.labels, "traefik.http.routers.netbird-api.priority")) > Number(label(server.labels, "traefik.http.routers.netbird-backend.priority")));
    assert.equal(label(server.labels, "traefik.http.routers.netbird-grpc.middlewares"), undefined);
    assert.equal(label(server.labels, "traefik.http.routers.netbird-backend.middlewares"), undefined);
  });

  it("runs the agent under the name Traefik and Alloy reach it by, with the collections", () => {
    assert.equal(crowdsec.container_name, CROWDSEC_CONTAINER);
    assert.equal(crowdsec.profiles, undefined);
    assert.equal(crowdsec.ports, undefined);
    assert.deepEqual(crowdsec.environment.COLLECTIONS.split(/\s+/), [...CROWDSEC_COLLECTIONS]);
    assert.deepEqual(crowdsec.env_file, ["./crowdsec.env"]);
  });

  it("keeps the Docker socket out of the crowdsec container", () => {
    assert.ok(!crowdsec.volumes.some((v: string) => v.includes("docker.sock")));
    assert.equal(socket.container_name, CROWDSEC_SOCKET_PROXY);
    assert.deepEqual(socket.networks, ["crowdsec-socket"]);
    assert.equal(socket.environment.POST, "0");
    assert.equal(socket.environment.EXEC, undefined);
    assert.equal(compose.networks["crowdsec-socket"].internal, true);
  });
});

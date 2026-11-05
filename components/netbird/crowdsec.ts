/**
 * CrowdSec on the netbird-edge hosts (docs.netbird.io/selfhosted/maintenance/crowdsec-dashboard).
 *
 * Each host runs a `crowdsec` container (compose.yaml) that is an agent and an
 * AppSec listener but NOT a LAPI: it reports to Equestria's LAPI over the
 * tailnet (`svc:crowdsec-lapi`, kubernetes/apps/network/crowdsec/tailnet-service.yaml,
 * the `netbird-edge-crowdsec` grant), so the edge and home share one decision
 * pool. The agent reads the edge Traefik's log through a read-only Docker
 * socket proxy; Traefik's bouncer plugin streams decisions from the same LAPI
 * and asks the local AppSec about every dashboard, `/api` and `/oauth2`
 * request. gRPC (management, signal) and the relay are deliberately left
 * alone: a false positive there takes peers off the mesh.
 *
 * Every failure mode fails OPEN, because the edge exists to keep the control
 * plane up while home is down:
 *   - LAPI unreachable: the bouncer keeps its last decision cache
 *     (streamStartupBlock false, updateMaxFailure -1), and AppSec keeps a key it
 *     has already validated (CrowdSec 1.8.2 checkAuth extends its cache when the
 *     LAPI cannot answer). The one gap: a crowdsec container that STARTS while
 *     the LAPI is unreachable has no cached key, answers 401, and the plugin
 *     treats any non-200/500 as a block. Step 2 of the rollout checks this.
 *   - AppSec unreachable or answering 500: allowed (both *Block flags false).
 *
 * Identity is per host and pre-provisioned, never the LAPI's auto-registration
 * token: stacks/netbird-edge generates a machine password and a bouncer key for
 * each host and records them at CROWDSEC_EDGE_BAO_PATH, keyed by the env var
 * names the LAPI reads (`crowdsecLapiEnv`). The LAPI registers the bouncers
 * itself (BOUNCER_KEY_*, its entrypoint) and the machines through
 * kubernetes/apps/network/crowdsec/edge-register.sh.
 *
 * Pure, with no Pulumi imports, so `node --test` covers it.
 */

/** The compose service and container that run the agent and AppSec. */
export const CROWDSEC_CONTAINER = "netbird-crowdsec";
/** The AppSec listener, on the compose network only. */
export const CROWDSEC_APPSEC_PORT = 7422;
/** The agent's Prometheus endpoint, on the compose network only. */
export const CROWDSEC_METRICS_PORT = 6060;
/** Equestria's LAPI, as the tailnet Service publishes it. */
export const CROWDSEC_LAPI_PORT = 8080;
export const CROWDSEC_LAPI_TAILNET_NAME = "crowdsec-lapi";
/** The read-only Docker API the agent reads Traefik's log through. */
export const CROWDSEC_SOCKET_PROXY = "netbird-crowdsec-socket";
export const CROWDSEC_SOCKET_PROXY_PORT = 2375;
/** The container whose log the agent parses (compose.yaml `traefik`). */
export const TRAEFIK_CONTAINER = "netbird-traefik";

/** Traefik's dynamic-config file, where the middleware lives (Traefik's own file provider, so it exists whatever containers run). */
export const TRAEFIK_DYNAMIC_FILE = "traefik-dynamic.yaml";
/** The middleware the dashboard and `/api` routers name. */
export const CROWDSEC_MIDDLEWARE = "netbird-crowdsec@file";
/** Where Traefik reads the bouncer key (compose.yaml mounts it). */
export const TRAEFIK_BOUNCER_KEY_PATH = "/etc/traefik/crowdsec-bouncer.key";

/** Where stacks/netbird-edge records the edge identities; crowdsec-netbird-edge (ExternalSecret) reads it. */
export const CROWDSEC_EDGE_BAO_PATH = "clusters/equestria/apps/crowdsec/netbird-edge";

/**
 * Never banned at the edge either: loopback, RFC 1918, the compose network
 * and CGNAT (the tailnet and NetBird's own peer range). The LAPI holds the
 * same list as an allowlist (edge-register.sh), which also stops an agent
 * that skipped this file.
 */
export const CROWDSEC_INTERNAL_CIDRS = ["127.0.0.1/32", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"] as const;

/** The hub content the agent installs: Traefik's log, the generic HTTP and CVE scenarios, and the AppSec rules. */
export const CROWDSEC_COLLECTIONS = ["crowdsecurity/traefik", "crowdsecurity/base-http-scenarios", "crowdsecurity/http-cve", "crowdsecurity/appsec-virtual-patching", "crowdsecurity/appsec-generic-rules"] as const;

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function bareHost(host: string): string {
  if (!HOSTNAME.test(host)) throw new Error(`CrowdSec host '${host}' is not a bare hostname`);
  return host;
}

/**
 * `netbird-azure-eus2` -> `netbird_azure_eus2`: the host's machine AND bouncer
 * name on the LAPI, and the suffix of the env vars both arrive as, which bash
 * cannot read with dashes in. Also the `lapi_name` label on the host's
 * crowdsec metrics (metrics.ts), so a Thanos rule can join them to the LAPI's
 * per-machine and per-bouncer series without a regex.
 */
export function crowdsecLapiName(host: string): string {
  return bareHost(host).replaceAll("-", "_");
}

/**
 * The LAPI env vars one host's identity arrives as (lapi.envFrom on the
 * `crowdsec-netbird-edge` Secret). BOUNCER_KEY_<name> is the chart
 * entrypoint's own convention and registers bouncer `<name>`;
 * EDGE_MACHINE_PASSWORD_<name> is edge-register.sh's, which registers machine
 * `<name>`.
 */
export function crowdsecLapiEnv(host: string): { bouncerKey: string; machinePassword: string } {
  const name = crowdsecLapiName(host);
  return { bouncerKey: `BOUNCER_KEY_${name}`, machinePassword: `EDGE_MACHINE_PASSWORD_${name}` };
}

/** `http://crowdsec-lapi.<tailnet>:8080`. */
export function crowdsecLapiUrl(tailnet: string): string {
  if (!/^[a-z0-9.-]+$/i.test(tailnet)) throw new Error(`Tailnet '${tailnet}' is not a DNS name`);
  return `http://${CROWDSEC_LAPI_TAILNET_NAME}.${tailnet}:${CROWDSEC_LAPI_PORT}`;
}

/** A secret the files below can carry: no quote, newline, or anything outside the bouncer plugin's key alphabet. */
function plainSecret(name: string, value: string): string {
  if (!/^[A-Za-z0-9]+$/.test(value)) throw new Error(`${name} must be alphanumeric`);
  return value;
}

export interface CrowdsecAgentEnvArgs {
  /** The host's tailnet name; the machine is crowdsecLapiName of it. */
  host: string;
  /** The tailnet's DNS name, for the LAPI URL. */
  tailnet: string;
  machinePassword: string;
}

/**
 * `crowdsec.env`: agent-only (DISABLE_LOCAL_API), logging in to Equestria's
 * LAPI as this host's machine. Secret: it carries the machine password. The
 * image's entrypoint writes these into local_api_credentials.yaml on every
 * start (build/docker/docker_start.sh, v1.8.2).
 */
export function renderCrowdsecEnv(args: CrowdsecAgentEnvArgs): string {
  const vars: [string, string][] = [
    ["DISABLE_LOCAL_API", "true"],
    ["LOCAL_API_URL", crowdsecLapiUrl(args.tailnet)],
    ["AGENT_USERNAME", crowdsecLapiName(args.host)],
    ["AGENT_PASSWORD", plainSecret("The machine password", args.machinePassword)],
    ["CUSTOM_HOSTNAME", bareHost(args.host)],
  ];
  return `# Rendered by stacks/netbird-edge (Pulumi), components/netbird/crowdsec.ts. Edits on the VM are overwritten.\n${vars.map(([k, v]) => `${k}='${v}'`).join("\n")}\n`;
}

/** `crowdsec-bouncer.key`: the bare key, which the plugin reads from crowdsecLapiKeyFile. Secret. */
export function renderBouncerKeyFile(bouncerKey: string): string {
  return plainSecret("The bouncer key", bouncerKey);
}

/**
 * The agent's Traefik acquisition: the `netbird-traefik` container's log, read
 * through the socket proxy. Traefik's stdout carries its own log lines too;
 * the traefik parser drops what is not an access line.
 */
export function renderTraefikAcquisition(): string {
  return `# Rendered by components/netbird/crowdsec.ts. Edits on the VM are overwritten.
source: docker
docker_host: tcp://${CROWDSEC_SOCKET_PROXY}:${CROWDSEC_SOCKET_PROXY_PORT}
container_name:
  - ${TRAEFIK_CONTAINER}
labels:
  type: traefik
`;
}

/**
 * The AppSec listener the bouncer asks. Same config as Equestria's
 * (kubernetes/apps/network/crowdsec/values.yaml `appsec.acquisitions`), with a
 * long key cache: a validated key outlives a LAPI outage either way, but a
 * long one means fewer round trips over the tailnet.
 */
export function renderAppsecAcquisition(): string {
  return `# Rendered by components/netbird/crowdsec.ts. Edits on the VM are overwritten.
source: appsec
listen_addr: 0.0.0.0:${CROWDSEC_APPSEC_PORT}
path: /
appsec_configs:
  - crowdsecurity/appsec-default
auth_cache_duration: 6h
labels:
  type: appsec
`;
}

/** `config.yaml.local`: metrics on the compose network, for Alloy. The image binds 127.0.0.1 otherwise. */
export function renderCrowdsecConfigLocal(): string {
  return `# Rendered by components/netbird/crowdsec.ts. Edits on the VM are overwritten.
prometheus:
  enabled: true
  level: full
  listen_addr: 0.0.0.0
  listen_port: ${CROWDSEC_METRICS_PORT}
`;
}

/** The same postoverflow whitelist the cluster agents carry (values.yaml `s01-whitelist`), minus the cluster's own ranges, which 10.0.0.0/8 covers. */
export function renderCrowdsecWhitelist(): string {
  return `# Rendered by components/netbird/crowdsec.ts. Edits on the VM are overwritten.
name: driscoll/internal-networks
description: "Never ban LAN, compose-network or tailnet addresses"
whitelist:
  reason: "internal network"
  cidr:
${CROWDSEC_INTERNAL_CIDRS.map(cidr => `    - "${cidr}"`).join("\n")}
`;
}

export interface TraefikDynamicArgs {
  /** The tailnet's DNS name, for the LAPI host. */
  tailnet: string;
  /**
   * The middleware's kill switch. False ships the whole chain with nothing
   * enforced (rollout step 1); flipping it is step 2. Even off, the plugin
   * validates its config and reads the key file, so a bad key breaks every
   * route carrying it either way.
   */
  enforce: boolean;
}

/**
 * Traefik's dynamic config (file provider): the `netbird-crowdsec` middleware.
 * In a file, not in container labels, so it exists on every host whatever is
 * running; a router naming a middleware that does not exist is itself dropped.
 */
export function renderTraefikDynamic(args: TraefikDynamicArgs): string {
  const lapiHost = new URL(crowdsecLapiUrl(args.tailnet)).host;
  return `# Rendered by stacks/netbird-edge (Pulumi), components/netbird/crowdsec.ts. Edits on the VM are overwritten.
http:
  middlewares:
    netbird-crowdsec:
      plugin:
        crowdsec-bouncer-traefik-plugin:
          enabled: ${args.enforce}
          logLevel: INFO
          # Decisions from Equestria's LAPI over the tailnet, cached locally and
          # refreshed every minute. Fails open: an unreachable LAPI leaves the
          # last cache in force, and a cold start with no LAPI allows everything.
          crowdsecMode: stream
          crowdsecLapiScheme: http
          crowdsecLapiHost: ${JSON.stringify(lapiHost)}
          crowdsecLapiKeyFile: ${TRAEFIK_BOUNCER_KEY_PATH}
          streamStartupBlock: false
          updateMaxFailure: -1
          updateIntervalSeconds: 60
          httpTimeoutSeconds: 3
          remediationStatusCode: 403
          # The local AppSec, per request. Unreachable or erroring: allowed.
          crowdsecAppsecEnabled: true
          crowdsecAppsecHost: "${CROWDSEC_CONTAINER}:${CROWDSEC_APPSEC_PORT}"
          crowdsecAppsecFailureBlock: false
          crowdsecAppsecUnreachableBlock: false
          # No forwardedHeadersTrustedIPs, on purpose: Traefik is the first hop
          # here and its entrypoints trust no forwarded headers, so it strips a
          # client's X-Forwarded-For and the plugin sees the socket's address.
          # Same spelling as home's middleware (traefik/middleware/crowdsec.yaml);
          # Traefik matches plugin keys case-insensitively.
          clientTrustedIPs:
${CROWDSEC_INTERNAL_CIDRS.map(cidr => `            - "${cidr}"`).join("\n")}
`;
}

/**
 * The collector's configuration, from the environment the CronJob sets
 * (kubernetes/apps/database/network-map/cronjob.yaml) and the one Secret its
 * ExternalSecret renders. Pure: `loadConfig(env)` takes the env as an argument.
 *
 * A source whose settings are missing or malformed is `undefined` here, with
 * the reason in `problems`, and ./main.ts reports it as failed rather than
 * quietly leaving it out.
 */
import type { SourceName } from "./model.ts";
import type { DockerTarget } from "./sources/docker.ts";
import type { ProxmoxTarget } from "./sources/proxmox.ts";

export const ALL_SOURCES: SourceName[] = ["unifi", "tailscale", "netbird", "kubernetes", "proxmox", "docker"];

export interface Config {
  neo4j: { uri: string; username: string; password: string };
  homeSite: string;
  retentionDays: number;
  sourceTimeoutMs: number;
  sources: SourceName[];
  /** Why a source's block is missing: an unset variable, or a target list that did not parse. */
  problems: Partial<Record<SourceName, string>>;
  unifi?: { url: string; apiKey: string; site: string };
  tailscale?: { clientId: string; clientSecret: string; tailnet: string; scopes?: string };
  netbird?: { url: string; token: string };
  kubernetes?: { url: string; tokenFile: string; cluster: string; site: string };
  proxmox?: { targets: (ProxmoxTarget & { url: string; authorization: string })[] };
  docker?: { targets: (DockerTarget & { url: string })[] };
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The env var holding a Proxmox token: `main` -> PROXMOX_TOKEN_MAIN, `alpha-site` -> PROXMOX_TOKEN_ALPHA_SITE. */
export const proxmoxTokenVar = (token: string) => `PROXMOX_TOKEN_${token.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

/**
 * PROXMOX_TARGETS: a JSON list of `{name, url, site, token}`. `token` names
 * the PROXMOX_TOKEN_<TOKEN> variable, whose value is `USER@REALM!TOKENID=SECRET`.
 */
export function parseProxmoxTargets(env: Env): NonNullable<Config["proxmox"]>["targets"] {
  const raw = JSON.parse(required(env, "PROXMOX_TARGETS")) as { name: string; url: string; site: string; token: string }[];
  return raw.map(t => {
    if (!t.name || !t.url || !t.site || !t.token) throw new Error(`PROXMOX_TARGETS entry ${JSON.stringify(t.name)} needs name, url, site and token`);
    return { name: t.name, url: t.url, site: t.site, authorization: `PVEAPIToken=${required(env, proxmoxTokenVar(t.token))}` };
  });
}

/** DOCKER_TARGETS: a JSON list of `{name, host, site}`; each is reached at http://<host>:2375. */
export function parseDockerTargets(env: Env): NonNullable<Config["docker"]>["targets"] {
  const raw = JSON.parse(required(env, "DOCKER_TARGETS")) as { name: string; host: string; site: string; port?: number }[];
  return raw.map(t => {
    if (!t.name || !t.host || !t.site) throw new Error(`DOCKER_TARGETS entry ${JSON.stringify(t.name)} needs name, host and site`);
    return { name: t.name, host: t.host, site: t.site, url: `http://${t.host}:${t.port ?? 2375}` };
  });
}

export function loadConfig(env: Env): Config {
  const sources = env.SOURCES
    ? env.SOURCES.split(",")
        .map(s => s.trim())
        .filter((s): s is SourceName => (ALL_SOURCES as string[]).includes(s))
    : ALL_SOURCES;
  const problems: Config["problems"] = {};
  const optional = <T>(source: SourceName, build: () => T): T | undefined => {
    try {
      return build();
    } catch (error) {
      problems[source] = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  };
  const k8sHost = env.KUBERNETES_SERVICE_HOST;
  return {
    neo4j: { uri: required(env, "NEO4J_URI"), username: required(env, "NEO4J_USERNAME"), password: required(env, "NEO4J_PASSWORD") },
    homeSite: env.HOME_SITE || "home",
    retentionDays: Number(env.RETENTION_DAYS || 30),
    sourceTimeoutMs: Number(env.SOURCE_TIMEOUT_SECONDS || 240) * 1000,
    sources,
    problems,
    unifi: optional("unifi", () => ({ url: required(env, "UNIFI_URL"), apiKey: required(env, "UNIFI_API_KEY"), site: env.UNIFI_SITE || "default" })),
    tailscale: optional("tailscale", () => ({
      clientId: required(env, "TAILSCALE_CLIENT_ID"),
      clientSecret: required(env, "TAILSCALE_CLIENT_SECRET"),
      tailnet: env.TAILSCALE_TAILNET || "-",
      scopes: env.TAILSCALE_SCOPES || undefined,
    })),
    netbird: optional("netbird", () => ({ url: required(env, "NETBIRD_URL"), token: required(env, "NETBIRD_TOKEN") })),
    kubernetes: optional("kubernetes", () => ({
      url: `https://${required(env, "KUBERNETES_SERVICE_HOST").includes(":") ? `[${k8sHost}]` : k8sHost}:${env.KUBERNETES_SERVICE_PORT || "443"}`,
      tokenFile: env.KUBERNETES_TOKEN_FILE || "/var/run/secrets/kubernetes.io/serviceaccount/token",
      cluster: env.KUBERNETES_CLUSTER || "equestria",
      site: env.KUBERNETES_SITE || env.HOME_SITE || "home",
    })),
    proxmox: optional("proxmox", () => ({ targets: parseProxmoxTargets(env) })),
    docker: optional("docker", () => ({ targets: parseDockerTargets(env) })),
  };
}

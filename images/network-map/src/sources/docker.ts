/**
 * Docker hosts (the Dockge LXCs): the host itself, every container with its
 * own LAN presence (a macvlan/ipvlan NIC, like a NetBird gateway's), and the
 * apps Traefik serves there, from the containers' labels.
 *
 *   GET /info                       the host's name and OS
 *   GET /networks                   network drivers, to tell macvlan from bridge
 *   GET /containers/json?all=true   containers, their labels and per-network MAC/IP
 *
 * Plain HTTP to each host's docker-socket-proxy on 2375
 * (docker/_common/docker-socket-proxy), by `dockge-<host>.<root domain>`, as
 * kubernetes/apps/agents/agent-tools-servers/docker/ does: CoreDNS rewrites
 * those names to the tailnet egress Services (kube-system/coredns
 * helm/values.yaml), whose `docker-proxy` port is 2375. Only GETs.
 *
 * Containers on a bridge network share the host's presence, so they are not
 * Machines; their apps RUN on the host.
 */
import type { ApiClient } from "../http.ts";
import { emptyResult, type SourceResult } from "../model.ts";
import { normalizeHostname, normalizeIp, normalizeMac, uniq } from "../normalize.ts";

export interface DockerInfo {
  ID?: string;
  Name?: string;
  OperatingSystem?: string;
}

export interface DockerNetwork {
  Name: string;
  Driver?: string;
}

export interface DockerContainer {
  Id: string;
  Names?: string[];
  Image?: string;
  State?: string;
  Created?: number;
  Labels?: Record<string, string>;
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string; MacAddress?: string }> };
}

export interface DockerTarget {
  /** `luna`, `as`: the estate's short host name. */
  name: string;
  /** The host's DNS name (`dockge-luna.<root domain>`): its first label is the LXC's hostname. */
  host: string;
  site: string;
}

const OWN_PRESENCE_DRIVERS = new Set(["macvlan", "ipvlan"]);

/** `Host(\`a\`) || Host(\`b\`, \`c\`)` -> [a, b, c]. HostRegexp and the rest are ignored. */
export function traefikHosts(rule: string): string[] {
  const out: string[] = [];
  for (const match of rule.matchAll(/Host\(([^)]*)\)/g)) {
    for (const name of match[1].matchAll(/`([^`]+)`|"([^"]+)"/g)) out.push((name[1] ?? name[2]).toLowerCase());
  }
  return uniq(out);
}

/** The observed App id for a container: its compose project (the Dockge stack), else its name. */
export const containerAppId = (c: DockerContainer) => c.Labels?.["com.docker.compose.project"] ?? containerName(c);
const containerName = (c: DockerContainer) => (c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, "");

export function parseDocker(target: DockerTarget, info: DockerInfo, networks: DockerNetwork[], containers: DockerContainer[]): SourceResult {
  const result = emptyResult("docker");
  const hostKey = `docker:host:${target.name}`;
  result.machines.push({
    source: "docker",
    key: hostKey,
    name: info.Name ?? normalizeHostname(target.host) ?? target.name,
    os: info.OperatingSystem,
    status: "online",
    hostnames: uniq([normalizeHostname(info.Name), normalizeHostname(target.host)]),
    interfaces: [],
  });
  const entryId = `traefik:${target.name}`;
  const driver = new Map(networks.map(n => [n.Name, n.Driver]));

  for (const c of containers) {
    const name = containerName(c);
    const running = c.State === "running";
    const ownNics = Object.entries(c.NetworkSettings?.Networks ?? {}).filter(([net]) => OWN_PRESENCE_DRIVERS.has(driver.get(net) ?? ""));
    let runsOn = hostKey;
    if (ownNics.length > 0) {
      const key = `docker:${target.name}/${name}`;
      runsOn = key;
      result.machines.push({
        source: "docker",
        key,
        name,
        kind: "container",
        status: c.State,
        firstSeen: c.Created ? new Date(c.Created * 1000).toISOString() : undefined,
        hostnames: uniq([normalizeHostname(name), normalizeHostname(c.Labels?.["com.docker.compose.service"])]),
        hostedOn: hostKey,
        interfaces: ownNics.map(([net, n]) => ({ network: { lan: true, site: target.site }, mac: normalizeMac(n.MacAddress), ips: uniq([normalizeIp(n.IPAddress)]), nic: net, online: running })),
      });
    }

    const labels = c.Labels ?? {};
    if (labels["traefik.enable"] === "false") continue;
    const rules = Object.entries(labels).filter(([k]) => /^traefik\.http\.routers\.[^.]+\.rule$/.test(k));
    if (rules.length === 0) continue;
    const appId = containerAppId(c);
    if (!result.apps.some(a => a.key === appId)) result.apps.push({ key: appId, props: { name: appId, cluster: target.name } });
    result.runs.push({ machine: runsOn, app: appId });
    for (const [key, rule] of rules) {
      const router = key.split(".")[3];
      for (const host of traefikHosts(rule)) {
        result.servedBy.push({ app: appId, entryPoint: entryId, name: host });
        // A `*-tailscale` router answers on a tailnet name this host serves.
        if (router.endsWith("-tailscale")) result.aliases.push({ fqdn: host, observationKey: hostKey });
      }
    }
  }
  if (result.apps.length > 0) result.entryPoints.push({ key: entryId, props: { kind: "traefik", name: `traefik-${target.name}`, address: target.host } });
  return result;
}

export async function collectDocker(targets: { target: DockerTarget; client: ApiClient }[]): Promise<SourceResult> {
  const merged = emptyResult("docker");
  for (const { target, client } of targets) {
    try {
      const [info, networks, containers] = await Promise.all([client.getJson<DockerInfo>("/info"), client.getJson<DockerNetwork[]>("/networks"), client.getJson<DockerContainer[]>("/containers/json?all=true")]);
      const one = parseDocker(target, info, networks, containers);
      for (const k of ["machines", "apps", "entryPoints", "servedBy", "runs", "aliases"] as const) (merged[k] as unknown[]).push(...one[k]);
    } catch (error) {
      merged.errors.push(`docker ${target.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (merged.errors.length === targets.length && targets.length > 0) throw new Error(merged.errors.join("; "));
  return merged;
}

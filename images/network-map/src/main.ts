/**
 * The network map's observed-layer collector (docs/network-map/schema.md,
 * docs/adr/0006-network-map-neo4j-homelable-projection.md). An hourly
 * CronJob in `database` (kubernetes/apps/database/network-map).
 *
 * One run:
 *   1. create the constraints and indexes (idempotent);
 *   2. read all six sources at once, each on its own: one failing never
 *      stops another, and a failed source keeps its previous nodes;
 *   3. join their machines and build the graph plan (./build.ts);
 *   4. write it in one transaction (./cypher.ts has the strategy);
 *   5. log one JSON line per source, and a summary.
 *
 * Exits 1 when any source failed or was partial, or the write failed, so the
 * Job's status says so; the NetworkMapCollectorNotRunning rule pages when no
 * run has fully succeeded for a while.
 */
import { readFile } from "node:fs/promises";
import neo4j, { type Driver, type ManagedTransaction } from "neo4j-driver";
import { buildGraph } from "./build.ts";
import { type Config, loadConfig } from "./config.ts";
import { fallbackNetworksQuery, nodeStatements, relStatements, retentionStatement, runRecordStatement, type SourceOutcome, type Statement, schemaStatements, staleStatements } from "./cypher.ts";
import { httpClient } from "./http.ts";
import type { SourceName, SourceResult } from "./model.ts";
import { collectDocker } from "./sources/docker.ts";
import { collectKubernetes } from "./sources/kubernetes.ts";
import { collectNetbird } from "./sources/netbird.ts";
import { collectProxmox } from "./sources/proxmox.ts";
import { collectTailscale, mintTailscaleToken } from "./sources/tailscale.ts";
import { collectUnifi } from "./sources/unifi.ts";

type Collected = SourceResult & { unresolved?: string[] };

/** Each source from its config block. Throws when the block is missing. */
function collectors(config: Config): Record<SourceName, () => Promise<Collected>> {
  const need = <T>(source: SourceName, block: T | undefined): T => {
    if (!block) throw new Error(`not configured: ${config.problems[source] ?? "missing settings"}`);
    return block;
  };
  return {
    unifi: async () => {
      const c = need("unifi", config.unifi);
      return collectUnifi(httpClient({ baseUrl: c.url, headers: { "X-API-KEY": c.apiKey } }), c.site);
    },
    tailscale: async () => {
      const c = need("tailscale", config.tailscale);
      const token = await mintTailscaleToken(c.clientId, c.clientSecret, c.scopes);
      return collectTailscale(httpClient({ baseUrl: "https://api.tailscale.com", headers: { Authorization: `Bearer ${token}` } }), { tailnet: c.tailnet });
    },
    netbird: async () => {
      const c = need("netbird", config.netbird);
      return collectNetbird(httpClient({ baseUrl: c.url, headers: { Authorization: `Token ${c.token}` } }));
    },
    kubernetes: async () => {
      const c = need("kubernetes", config.kubernetes);
      // Read every run: the projected token rotates.
      const token = (await readFile(c.tokenFile, "utf8")).trim();
      return collectKubernetes(httpClient({ baseUrl: c.url, headers: { Authorization: `Bearer ${token}` } }), { cluster: c.cluster, site: c.site });
    },
    proxmox: async () => {
      const c = need("proxmox", config.proxmox);
      return collectProxmox(c.targets.map(t => ({ target: t, client: httpClient({ baseUrl: t.url, headers: { Authorization: t.authorization } }) })));
    },
    docker: async () => {
      const c = need("docker", config.docker);
      return collectDocker(c.targets.map(t => ({ target: t, client: httpClient({ baseUrl: t.url }) })));
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** JS numbers are floats to Bolt; whole numbers go as integers so a VLAN reads 20, not 20.0. */
export function toBolt(value: unknown): unknown {
  if (typeof value === "number") return Number.isInteger(value) ? neo4j.int(value) : value;
  if (Array.isArray(value)) return value.map(toBolt);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toBolt(v)]));
  return value;
}

const run = (tx: ManagedTransaction, s: Statement) => tx.run(s.text, toBolt(s.params) as Record<string, unknown>);

const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ msg: "network-map", ...fields }));

async function main(): Promise<number> {
  const config = loadConfig(process.env);
  const now = new Date().toISOString();
  const ctx = { run: now, now };
  const driver: Driver = neo4j.driver(config.neo4j.uri, neo4j.auth.basic(config.neo4j.username, config.neo4j.password), { disableLosslessIntegers: true });
  try {
    await driver.verifyConnectivity();
    for (const text of schemaStatements()) await driver.executeQuery(text);

    const all = collectors(config);
    const settled = await Promise.allSettled(config.sources.map(source => withTimeout(all[source](), config.sourceTimeoutMs, source)));
    const outcomes: SourceOutcome[] = [];
    const results: Collected[] = [];
    settled.forEach((s, i) => {
      const source = config.sources[i];
      if (s.status === "rejected") {
        outcomes.push({ source, status: "failed", error: s.reason instanceof Error ? s.reason.message : String(s.reason) });
        return;
      }
      results.push(s.value);
      outcomes.push({ source, status: s.value.errors.length > 0 ? "partial" : "ok", error: s.value.errors.join("; ") || undefined });
    });
    if (results.length === 0) {
      for (const o of outcomes) log({ source: o.source, status: o.status, error: o.error });
      log({ result: "no source answered; the graph is left as it was" });
      const record = runRecordStatement(ctx, outcomes);
      await driver.executeQuery(record.text, toBolt(record.params) as Record<string, unknown>);
      return 1;
    }

    // Without UniFi's networks every LAN interface would move to a fallback network; use last run's.
    let fallbackHomeNetworks: { networkId: string; cidr: string }[] | undefined;
    if (!results.some(r => r.source === "unifi")) {
      const { records } = await driver.executeQuery(fallbackNetworksQuery.text, fallbackNetworksQuery.params);
      fallbackHomeNetworks = records.map(r => ({ networkId: r.get("networkId") as string, cidr: r.get("cidr") as string }));
    }

    const { plan, machines } = buildGraph(results, { homeSite: config.homeSite, fallbackHomeNetworks });
    const replaced = outcomes.filter(o => o.status === "ok").map(o => o.source);
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    let removed: number;
    try {
      // One transaction: the graph moves from last run's to this run's in one step, or not at all.
      removed = await session.executeWrite(async tx => {
        for (const s of nodeStatements(plan, ctx)) await run(tx, s);
        for (const s of relStatements(plan, ctx)) await run(tx, s);
        for (const source of replaced) for (const s of staleStatements(source, ctx)) await run(tx, s);
        const retention = await run(tx, retentionStatement(ctx, config.retentionDays));
        await run(tx, runRecordStatement(ctx, outcomes));
        return Number(retention.records[0]?.get("removed") ?? 0);
      });
    } finally {
      await session.close();
    }

    for (const o of outcomes) {
      const r = results.find(x => x.source === o.source);
      log({
        source: o.source,
        status: o.status,
        error: o.error,
        replaced: o.status === "ok",
        ...(r && {
          machines: r.machines.length,
          interfaces: r.machines.reduce((n, m) => n + m.interfaces.length, 0),
          networks: r.networks.length,
          groups: r.groups.length,
          routes: r.routes.length,
          policies: r.policies.length,
          reaches: r.reaches.length,
          apps: r.apps.length,
          entryPoints: r.entryPoints.length,
          unresolved: r.unresolved?.length ? r.unresolved : undefined,
        }),
      });
    }
    const count = (label: string) => plan.nodes.filter(n => n.label === label).length;
    log({
      run: ctx.run,
      machines: machines.length,
      joined: machines.filter(m => m.joined).length,
      unjoined: machines.filter(m => !m.joined).length,
      interfaces: count("Interface"),
      nodes: plan.nodes.length,
      relationships: plan.rels.length,
      retentionRemoved: removed,
      failed: outcomes.filter(o => o.status !== "ok").map(o => o.source),
    });
    return outcomes.every(o => o.status === "ok") ? 0 : 1;
  } finally {
    await driver.close();
  }
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    error => {
      console.error(JSON.stringify({ msg: "network-map", error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    },
  );
}

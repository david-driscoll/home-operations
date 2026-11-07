/**
 * A fake of every region exit's agent (the picker sidecar's JSON API,
 * kubernetes/apps/netbird-system/region-exits/picker.ts), all on one port:
 * `/<name>/status`, `/<name>/regions` and `POST /<name>/region`. Point the app
 * at it with NUXT_AGENT_URL_TEMPLATE=http://127.0.0.1:8099/{name}.
 *
 *   npm run dev:agent        # then, in another terminal:
 *   NUXT_AGENT_URL_TEMPLATE=http://127.0.0.1:8099/{name} npm run dev
 *
 * A move reconnects after RECONNECT_MS, as gluetun does. misty-fly starts with
 * two people on it (moves ask for confirmation), high-winds does not answer,
 * and fleetfoot is offline on NetBird. The e2e tests start it too.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

interface Region {
  country: string;
  city: string | null;
}

interface FakeExit {
  region: Region;
  tunnelUp: boolean;
  overlays: { tailscale: boolean; netbird: boolean };
  activeClients: number | null;
  lastMove: { by: string | null; at: string } | null;
  answers: boolean;
}

export interface MockAgent {
  url: string;
  /** The URL template for NUXT_AGENT_URL_TEMPLATE. */
  template: string;
  exits: Map<string, FakeExit>;
  /** Every POST /region body received, in order. */
  moves: { name: string; body: Record<string, unknown> }[];
  close: () => Promise<void>;
}

const REGIONS = [
  { country: "Canada", cities: ["Montreal QC", "Toronto ON", "Vancouver BC"] },
  { country: "Germany", cities: ["Berlin", "Frankfurt"] },
  { country: "Japan", cities: ["Osaka", "Tokyo"] },
  { country: "UK", cities: ["London", "Manchester"] },
  { country: "USA", cities: ["Dallas TX", "New York NY", "Seattle WA"] },
];

/** How a Mullvad country name reads in gluetun's public-IP lookup. */
const EGRESS_COUNTRY: Record<string, string> = { USA: "United States", UK: "United Kingdom" };

const RECONNECT_MS = 3000;

function initialExits(): Map<string, FakeExit> {
  const exit = (region: Region, extra: Partial<FakeExit> = {}): FakeExit => ({
    region,
    tunnelUp: true,
    overlays: { tailscale: true, netbird: true },
    activeClients: 0,
    lastMove: null,
    answers: true,
    ...extra,
  });
  return new Map([
    ["spitfire", exit({ country: "USA", city: null }, { activeClients: 1, lastMove: { by: "Jamie", at: new Date(Date.now() - 2 * 3600_000).toISOString() } })],
    ["soarin", exit({ country: "Canada", city: "Toronto ON" })],
    ["fleetfoot", exit({ country: "UK", city: null }, { overlays: { tailscale: true, netbird: false }, lastMove: { by: null, at: new Date(Date.now() - 86400_000).toISOString() } })],
    ["misty-fly", exit({ country: "Germany", city: "Berlin" }, { activeClients: 2 })],
    ["high-winds", exit({ country: "Japan", city: null }, { answers: false })],
  ]);
}

function status(name: string, exit: FakeExit) {
  const { tunnelUp, overlays } = exit;
  const availability = !tunnelUp
    ? { state: "offline", reason: "tunnel" }
    : overlays.tailscale && overlays.netbird
      ? { state: "online" }
      : overlays.tailscale
        ? { state: "degraded", offlineOn: "netbird" }
        : overlays.netbird
          ? { state: "degraded", offlineOn: "tailscale" }
          : { state: "offline", reason: "overlays" };
  return {
    name,
    region: exit.region,
    tunnel: { up: tunnelUp, status: tunnelUp ? "running" : "starting" },
    egress: tunnelUp ? { country: EGRESS_COUNTRY[exit.region.country] ?? exit.region.country, city: exit.region.city, ip: "198.51.100.7" } : null,
    activeClients: exit.activeClients,
    overlays,
    availability,
    lastMove: exit.lastMove,
  };
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function startMockAgent(port = 0): Promise<MockAgent> {
  const exits = initialExits();
  const moves: MockAgent["moves"] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const server: Server = createServer(async (req, res) => {
    const [, name, endpoint, ...rest] = new URL(req.url ?? "/", "http://mock").pathname.split("/");
    const exit = exits.get(name ?? "");
    if (!exit || rest.length > 0) return send(res, 404, { error: "not found" });
    if (!exit.answers) {
      res.destroy();
      return;
    }
    if (req.method === "GET" && endpoint === "status") return send(res, 200, status(name ?? "", exit));
    if (req.method === "GET" && endpoint === "regions") return send(res, 200, REGIONS);
    if (req.method === "POST" && endpoint === "region") {
      if (!(req.headers["content-type"] ?? "").includes("application/json")) return send(res, 415, { error: "send JSON" });
      const body = await readJson(req);
      moves.push({ name: name ?? "", body });
      const offered = REGIONS.find(r => r.country.toLowerCase() === String(body.country ?? "").toLowerCase());
      if (!offered) return send(res, 400, { error: `Mullvad has no WireGuard servers in ${String(body.country)}` });
      const city = typeof body.city === "string" && body.city ? (offered.cities.find(c => c.toLowerCase() === String(body.city).toLowerCase()) ?? undefined) : null;
      if (city === undefined) return send(res, 400, { error: `Mullvad has no WireGuard servers in ${String(body.city)}, ${offered.country}` });
      if (body.confirm !== true && exit.activeClients !== 0) {
        const people =
          exit.activeClients === null ? `The picker cannot tell how many people are using ${name}.` : `${exit.activeClients + (exit.activeClients === 1 ? " person is" : " people are")} using ${name} right now.`;
        return send(res, 409, { error: `${people} Send it again with confirm: true to move them.`, activeClients: exit.activeClients, confirm: true });
      }
      exit.region = { country: offered.country, city };
      exit.lastMove = { by: typeof body.movedBy === "string" && body.movedBy ? body.movedBy : null, at: new Date().toISOString() };
      exit.tunnelUp = false;
      const timer = setTimeout(() => {
        exit.tunnelUp = true;
        timers.delete(timer);
      }, RECONNECT_MS);
      timers.add(timer);
      return send(res, 200, { region: exit.region, outcome: "running" });
    }
    return send(res, 404, { error: "not found" });
  });

  return new Promise(resolve => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      const url = `http://127.0.0.1:${actual}`;
      resolve({
        url,
        template: `${url}/{name}`,
        exits,
        moves,
        close: () =>
          new Promise<void>(done => {
            for (const timer of timers) clearTimeout(timer);
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

if (import.meta.main) {
  const agent = await startMockAgent(Number(process.env.PORT ?? 8099));
  console.log(`mock agents on ${agent.url}; NUXT_AGENT_URL_TEMPLATE=${agent.template}`);
}

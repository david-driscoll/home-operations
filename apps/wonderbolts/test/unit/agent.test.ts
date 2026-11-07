import { describe, expect, it } from "vitest";
import { type AgentConfig, agentUrl, collectOverview, fetchPage, fetchRegions, fetchView, namesFrom, postMove, viewFromStatus } from "../../server/utils/agent";

const config: AgentConfig = { regionExits: ["spitfire", "soarin", "misty-fly"], agentUrlTemplate: "http://region-exits-{name}.netbird-system.svc:8080" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  url: string;
  init: RequestInit | undefined;
}
/** A fetch answering by URL; anything unrouted throws, as an agent that is not there would. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: ${url}`);
    return route();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const STATUS = {
  name: "spitfire",
  region: { country: "USA", city: "Dallas TX" },
  tunnel: { up: true, status: "running" },
  egress: { country: "United States", city: "Dallas", ip: "198.51.100.7" },
  activeClients: 2,
  overlays: { tailscale: true, netbird: true },
  availability: { state: "online" },
  lastMove: { by: "Jamie", at: "2026-11-07T17:00:00.000Z" },
};
const SPITFIRE = "http://region-exits-spitfire.netbird-system.svc:8080";

describe("agentUrl", () => {
  it("builds a region exit's agent URL from the template", () => {
    expect(agentUrl(config, "misty-fly")).toBe("http://region-exits-misty-fly.netbird-system.svc:8080");
  });

  it.each(["high-winds", "", "spitfire.evil", "../soarin", "SPITFIRE", "spitfire/region"])("builds none for %j, which is not a configured region exit", name => {
    expect(agentUrl(config, name)).toBeNull();
  });

  it("drops a trailing slash so paths join cleanly", () => {
    expect(agentUrl({ ...config, agentUrlTemplate: "http://127.0.0.1:8099/{name}/" }, "soarin")).toBe("http://127.0.0.1:8099/soarin");
  });
});

describe("namesFrom", () => {
  it("splits, trims and drops empties", () => {
    expect(namesFrom(" spitfire, soarin ,,fleetfoot ")).toEqual(["spitfire", "soarin", "fleetfoot"]);
  });
});

describe("viewFromStatus", () => {
  it("takes an agent's /status as it is", () => {
    expect(viewFromStatus("spitfire", STATUS)).toEqual({
      name: "spitfire",
      availability: { state: "online" },
      region: { country: "USA", city: "Dallas TX" },
      tunnel: { up: true, status: "running" },
      egress: { country: "United States", city: "Dallas", ip: "198.51.100.7" },
      activeClients: 2,
      lastMove: { by: "Jamie", at: "2026-11-07T17:00:00.000Z" },
    });
  });

  it("works out availability from the tunnel and overlays for an agent from before it reported one", () => {
    const { availability, ...old } = STATUS;
    expect(viewFromStatus("spitfire", { ...old, overlays: { tailscale: true, netbird: false } }).availability).toEqual({ state: "degraded", offlineOn: "netbird" });
    expect(viewFromStatus("spitfire", { ...old, tunnel: { up: false } }).availability).toEqual({ state: "offline", reason: "tunnel" });
    expect(viewFromStatus("spitfire", { ...old, overlays: {} }).availability).toEqual({ state: "offline", reason: "overlays" });
  });

  it("works it out too when the reported one is not one it knows", () => {
    expect(viewFromStatus("spitfire", { ...STATUS, availability: { state: "sideways" } }).availability).toEqual({ state: "online" });
  });

  it("reports no last move from an agent from before it kept one, or with a bad time", () => {
    const { lastMove, ...old } = STATUS;
    expect(viewFromStatus("spitfire", old).lastMove).toBeNull();
    expect(viewFromStatus("spitfire", { ...STATUS, lastMove: { by: "Jamie", at: "yesterday-ish" } }).lastMove).toBeNull();
  });

  it("keeps a last move with no mover as by null", () => {
    expect(viewFromStatus("spitfire", { ...STATUS, lastMove: { by: null, at: "2026-11-07T17:00:00.000Z" } }).lastMove).toEqual({ by: null, at: "2026-11-07T17:00:00.000Z" });
  });

  it("survives nonsense", () => {
    const view = viewFromStatus("spitfire", { region: "USA", tunnel: 7, egress: { ip: 1 }, activeClients: "two", lastMove: [] });
    expect(view.region).toBeNull();
    expect(view.tunnel).toEqual({ up: false, status: null });
    expect(view.egress).toEqual({ country: null, city: null, ip: null });
    expect(view.activeClients).toBeNull();
    expect(view.lastMove).toBeNull();
    expect(viewFromStatus("spitfire", "not an object").availability).toEqual({ state: "unreachable" });
  });
});

describe("fetchView", () => {
  it("asks the agent's root /status", async () => {
    const { fetch, calls } = fakeFetch({ [`${SPITFIRE}/status`]: () => json(STATUS) });
    expect((await fetchView(config, "spitfire", fetch)).availability).toEqual({ state: "online" });
    expect(calls.map(c => c.url)).toEqual([`${SPITFIRE}/status`]);
  });

  it.each([
    ["does not answer", () => Promise.reject(new TypeError("fetch failed"))],
    ["answers 503", () => new Response("upstream connect error", { status: 503 })],
    ["answers something other than JSON", () => new Response("<html>")],
  ] as const)("is unreachable when the agent %s", async (_, route) => {
    const { fetch } = fakeFetch({ [`${SPITFIRE}/status`]: route });
    expect(await fetchView(config, "spitfire", fetch)).toEqual({ name: "spitfire", availability: { state: "unreachable" }, region: null, tunnel: null, egress: null, activeClients: null, lastMove: null });
  });

  it("asks nothing for a name that is not a region exit", async () => {
    const { fetch, calls } = fakeFetch({});
    expect((await fetchView(config, "nope", fetch)).availability).toEqual({ state: "unreachable" });
    expect(calls).toEqual([]);
  });
});

describe("collectOverview", () => {
  it("lists every region exit in order, asked at once, one that is down included", async () => {
    const order: string[] = [];
    const { fetch } = fakeFetch({
      [`${SPITFIRE}/status`]: async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push("spitfire");
        return json(STATUS);
      },
      "http://region-exits-soarin.netbird-system.svc:8080/status": () => {
        order.push("soarin");
        return json({ ...STATUS, name: "soarin", availability: { state: "degraded", offlineOn: "tailscale" } });
      },
    });
    const views = await collectOverview(config, fetch);
    expect(views.map(v => [v.name, v.availability.state])).toEqual([
      ["spitfire", "online"],
      ["soarin", "degraded"],
      ["misty-fly", "unreachable"],
    ]);
    // soarin answered first, so the three were asked together, not one by one.
    expect(order).toEqual(["soarin", "spitfire"]);
  });
});

describe("fetchRegions and fetchPage", () => {
  const REGIONS = [
    { country: "UK", cities: ["London"] },
    { country: "USA", cities: ["Dallas TX", "New York NY"] },
  ];

  it("drops entries that are not regions", async () => {
    const { fetch } = fakeFetch({ [`${SPITFIRE}/regions`]: () => json([...REGIONS, { cities: [] }, null, { country: "Peru", cities: "Lima" }]) });
    expect(await fetchRegions(config, "spitfire", fetch)).toEqual([...REGIONS, { country: "Peru", cities: [] }]);
  });

  it("gives the region in servers.json's spelling when the agent reports it lowercased", async () => {
    const { fetch } = fakeFetch({ [`${SPITFIRE}/status`]: () => json({ ...STATUS, region: { country: "usa", city: "new york ny" } }), [`${SPITFIRE}/regions`]: () => json(REGIONS) });
    const { view, regions } = await fetchPage(config, "spitfire", fetch);
    expect(view.region).toEqual({ country: "USA", city: "New York NY" });
    expect(regions).toEqual(REGIONS);
  });
});

describe("postMove", () => {
  it("POSTs the region, the confirmation and who is moving it to the agent's root /region", async () => {
    const { fetch, calls } = fakeFetch({ [`${SPITFIRE}/region`]: () => json({ region: { country: "Japan", city: null }, outcome: "running" }) });
    const reply = await postMove(config, "spitfire", { country: "Japan" }, "Jamie Doe", fetch);
    expect(reply).toEqual({ status: 200, body: { region: { country: "Japan", city: null }, outcome: "running" } });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ country: "Japan", city: null, confirm: false, movedBy: "Jamie Doe" });
  });

  it("passes the agent's 409 through, so the page can ask", async () => {
    const needs = { error: "2 people are using spitfire right now. Send it again with confirm: true to move them.", activeClients: 2, confirm: true };
    const { fetch } = fakeFetch({ [`${SPITFIRE}/region`]: () => json(needs, 409) });
    expect(await postMove(config, "spitfire", { country: "Japan" }, "Jamie", fetch)).toEqual({ status: 409, body: needs });
  });

  it("turns a body that is not JSON into an error", async () => {
    const { fetch } = fakeFetch({ [`${SPITFIRE}/region`]: () => new Response("Forbidden", { status: 403 }) });
    expect(await postMove(config, "spitfire", { country: "Japan" }, null, fetch)).toEqual({ status: 403, body: { error: "Forbidden" } });
  });

  it("answers 502 when the agent does not answer", async () => {
    const { fetch } = fakeFetch({});
    const reply = await postMove(config, "spitfire", { country: "Japan" }, null, fetch);
    expect(reply.status).toBe(502);
    expect((reply.body as { error: string }).error).toMatch(/^spitfire did not answer/);
  });

  it("asks nothing for a name that is not a region exit", async () => {
    const { fetch, calls } = fakeFetch({});
    expect((await postMove(config, "high-winds", { country: "Japan" }, null, fetch)).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

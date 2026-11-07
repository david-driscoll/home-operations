// biome-ignore-all lint/style/useTemplate: as overview.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/netbird-system/region-exits/overview.test.ts
 *
 * The overview at `/` (docs/plans/region-exits.md §D4): every region exit's
 * availability, region and the people on it, read from each one's GET /status
 * over its Service. The Services are faked at fetch.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectOverview, type OverviewEntry, peerStatusUrl, renderOverview } from "./overview.ts";

const WONDERBOLTS = ["spitfire", "soarin", "fleetfoot", "misty-fly", "high-winds"];
const url = (name: string) => "http://" + name + ".svc:8080/status";

const status = (name: string, country: string, extra: Record<string, unknown> = {}) => ({
  name,
  region: { country, city: null },
  tunnel: { up: true, status: "running" },
  egress: { country, city: null, ip: "203.0.113.1" },
  overlays: { tailscale: true, netbird: true },
  availability: { state: "online" },
  ...extra,
});

/** A fetch answering each region exit's /status from `answers`; a missing one refuses the connection. */
function fakeFetch(answers: Record<string, () => Response>) {
  return async (input: string | URL | Request): Promise<Response> => {
    const answer = answers[String(input)];
    if (!answer) throw new TypeError("fetch failed: ECONNREFUSED");
    return answer();
  };
}
const json = (body: unknown) => () => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("collectOverview", () => {
  it("lists every region exit, in order, with its availability, region and the people on it", async () => {
    const fetch = fakeFetch({
      [url("spitfire")]: json(status("spitfire", "USA", { activeClients: 2 })),
      [url("soarin")]: json(status("soarin", "Canada", { activeClients: 0, overlays: { tailscale: true, netbird: false }, availability: { state: "degraded", offlineOn: "netbird" } })),
      [url("fleetfoot")]: json(status("fleetfoot", "UK", { activeClients: 1 })),
      [url("misty-fly")]: json({ ...status("misty-fly", "Germany"), region: { country: "Germany", city: "Berlin" }, activeClients: 3 }),
      [url("high-winds")]: json(status("high-winds", "Japan", { tunnel: { up: false, status: "stopped" }, availability: { state: "offline", reason: "tunnel" } })),
    });
    const entries = await collectOverview(WONDERBOLTS, url, fetch);
    assert.deepEqual(entries, [
      { name: "spitfire", availability: { state: "online" }, region: { country: "USA", city: null }, activeClients: 2 },
      { name: "soarin", availability: { state: "degraded", offlineOn: "netbird" }, region: { country: "Canada", city: null }, activeClients: 0 },
      { name: "fleetfoot", availability: { state: "online" }, region: { country: "UK", city: null }, activeClients: 1 },
      { name: "misty-fly", availability: { state: "online" }, region: { country: "Germany", city: "Berlin" }, activeClients: 3 },
      { name: "high-winds", availability: { state: "offline", reason: "tunnel" }, region: { country: "Japan", city: null }, activeClients: null },
    ]);
  });

  it("works out the availability itself from a /status without one, as from a picker not yet rolled", async () => {
    const { availability: _, ...old } = status("soarin", "Canada", { overlays: { tailscale: false, netbird: true } });
    const [entry] = await collectOverview(["soarin"], url, fakeFetch({ [url("soarin")]: json(old) }));
    assert.deepEqual(entry.availability, { state: "degraded", offlineOn: "tailscale" });
  });

  it("does not trust an availability it does not recognise, and works it out instead", async () => {
    const odd = status("soarin", "Canada", { tunnel: { up: false, status: "stopped" }, availability: { state: "<b>fine</b>" } });
    const [entry] = await collectOverview(["soarin"], url, fakeFetch({ [url("soarin")]: json(odd) }));
    assert.deepEqual(entry.availability, { state: "offline", reason: "tunnel" });
  });

  it("shows a region exit that does not answer as unreachable, and still lists the others", async () => {
    const fetch = fakeFetch({
      [url("spitfire")]: json(status("spitfire", "USA")),
      [url("soarin")]: () => new Response("upstream connect error", { status: 503 }),
      [url("fleetfoot")]: () => new Response("not json"),
    });
    const entries = await collectOverview(["spitfire", "soarin", "fleetfoot", "misty-fly"], url, fetch);
    assert.deepEqual(
      entries.map(e => [e.name, e.availability.state]),
      [
        ["spitfire", "online"],
        ["soarin", "unreachable"],
        ["fleetfoot", "unreachable"],
        ["misty-fly", "unreachable"],
      ],
    );
    assert.deepEqual(entries[3], { name: "misty-fly", availability: { state: "unreachable" }, region: null, activeClients: null });
  });

  it("gives up on a region exit that hangs, without holding up the page", async () => {
    const hang = (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const started = Date.now();
    const [entry] = await collectOverview(["spitfire"], url, hang, 50);
    assert.deepEqual(entry.availability, { state: "unreachable" });
    assert.ok(Date.now() - started < 2000);
  });

  it("shows a region exit with no Service address as unreachable", async () => {
    const entries = await collectOverview(["soarin"], () => null, fakeFetch({}));
    assert.deepEqual(entries[0].availability, { state: "unreachable" });
  });
});

describe("peerStatusUrl", () => {
  it("builds the /status URL from the Service's environment variables, as Kubernetes names them", () => {
    const env = { REGION_EXITS_MISTY_FLY_SERVICE_HOST: "10.196.4.5", REGION_EXITS_MISTY_FLY_SERVICE_PORT: "8080" };
    assert.equal(peerStatusUrl("region-exits-", env)("misty-fly"), "http://10.196.4.5:8080/status");
  });

  it("is null for a region exit whose Service the pod has no variables for", () => {
    assert.equal(peerStatusUrl("region-exits-", {})("soarin"), null);
  });
});

describe("renderOverview", () => {
  const entries: OverviewEntry[] = [
    { name: "spitfire", availability: { state: "online" }, region: { country: "USA", city: "Dallas TX" }, activeClients: 2 },
    { name: "soarin", availability: { state: "unreachable" }, region: null, activeClients: null },
    { name: "fleetfoot", availability: { state: "offline", reason: "tunnel" }, region: { country: "<UK>", city: null }, activeClients: 0 },
    { name: "misty-fly", availability: { state: "degraded", offlineOn: "netbird" }, region: { country: "Germany", city: null }, activeClients: 1 },
    { name: "high-winds", availability: { state: "degraded", offlineOn: "tailscale" }, region: { country: "Japan", city: null }, activeClients: 0 },
  ];
  // 10:42:05 Eastern, after the clocks went back.
  const html = renderOverview(entries, new Date("2026-11-07T15:42:05Z"));
  /** The row of one region exit. */
  const row = (name: string) => html.match(new RegExp('<tr[^>]*><th scope="row"><a href="/' + name + '">[\\s\\S]*?</tr>'))?.[0] ?? "";

  it("links each region exit to its picker", () => {
    for (const name of ["spitfire", "soarin", "fleetfoot", "misty-fly", "high-winds"]) assert.ok(html.includes('href="/' + name + '"'), name);
  });

  it("keeps the region and the people on it", () => {
    assert.match(row("spitfire"), /Dallas TX, USA/);
    assert.match(row("spitfire"), /2 people/);
  });

  it("gives every region exit a status badge in plain words", () => {
    assert.match(row("spitfire"), /class="availability online">Online</);
    assert.match(row("soarin"), /class="availability unreachable">Not responding</);
    assert.match(row("fleetfoot"), /class="availability offline">Offline: not connected to Mullvad</);
    assert.match(row("misty-fly"), /class="availability degraded">Offline on NetBird, Tailscale works</);
    assert.match(row("high-winds"), /class="availability degraded">Offline on Tailscale, NetBird works</);
  });

  it("says when it last checked, in Eastern time", () => {
    assert.match(html, /Last checked <time datetime="2026-11-07T15:42:05.000Z">10:42:05 AM EST<\/time>/);
  });

  it("escapes what the region exits report", () => {
    assert.ok(html.includes("&lt;UK&gt;"));
    assert.ok(!html.includes("<UK>"));
  });

  it("offers no form: the overview only reads", () => {
    assert.ok(!/<form/i.test(html));
  });
});

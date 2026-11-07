// biome-ignore-all lint/style/useTemplate: as overview.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/region-exits/app/overview.test.ts
 *
 * The overview at `/` (docs/plans/region-exits.md §D4): every region exit's
 * region, tunnel state and the people on it, read from each one's GET /status
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
  it("lists every region exit, in order, with its region, tunnel state and the people on it", async () => {
    const fetch = fakeFetch({
      [url("spitfire")]: json(status("spitfire", "USA", { activeClients: 2 })),
      [url("soarin")]: json(status("soarin", "Canada", { activeClients: 0 })),
      [url("fleetfoot")]: json(status("fleetfoot", "UK", { activeClients: 1 })),
      [url("misty-fly")]: json({ ...status("misty-fly", "Germany"), region: { country: "Germany", city: "Berlin" }, activeClients: 3 }),
      [url("high-winds")]: json(status("high-winds", "Japan", { tunnel: { up: false, status: "stopped" } })),
    });
    const entries = await collectOverview(WONDERBOLTS, url, fetch);
    assert.deepEqual(entries, [
      { name: "spitfire", reachable: true, region: { country: "USA", city: null }, tunnelUp: true, activeClients: 2 },
      { name: "soarin", reachable: true, region: { country: "Canada", city: null }, tunnelUp: true, activeClients: 0 },
      { name: "fleetfoot", reachable: true, region: { country: "UK", city: null }, tunnelUp: true, activeClients: 1 },
      { name: "misty-fly", reachable: true, region: { country: "Germany", city: "Berlin" }, tunnelUp: true, activeClients: 3 },
      { name: "high-winds", reachable: true, region: { country: "Japan", city: null }, tunnelUp: false, activeClients: null },
    ]);
  });

  it("shows a region exit that does not answer as down, and still lists the others", async () => {
    const fetch = fakeFetch({
      [url("spitfire")]: json(status("spitfire", "USA")),
      [url("soarin")]: () => new Response("upstream connect error", { status: 503 }),
      [url("fleetfoot")]: () => new Response("not json"),
    });
    const entries = await collectOverview(["spitfire", "soarin", "fleetfoot", "misty-fly"], url, fetch);
    assert.deepEqual(
      entries.map(e => [e.name, e.reachable]),
      [
        ["spitfire", true],
        ["soarin", false],
        ["fleetfoot", false],
        ["misty-fly", false],
      ],
    );
    assert.deepEqual(entries[3], { name: "misty-fly", reachable: false, region: null, tunnelUp: false, activeClients: null });
  });

  it("gives up on a region exit that hangs, without holding up the page", async () => {
    const hang = (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const started = Date.now();
    const [entry] = await collectOverview(["spitfire"], url, hang, 50);
    assert.equal(entry.reachable, false);
    assert.ok(Date.now() - started < 2000);
  });

  it("shows a region exit with no Service address as down", async () => {
    const entries = await collectOverview(["soarin"], () => null, fakeFetch({}));
    assert.equal(entries[0].reachable, false);
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
    { name: "spitfire", reachable: true, region: { country: "USA", city: "Dallas TX" }, tunnelUp: true, activeClients: 2 },
    { name: "soarin", reachable: false, region: null, tunnelUp: false, activeClients: null },
    { name: "fleetfoot", reachable: true, region: { country: "<UK>", city: null }, tunnelUp: false, activeClients: 0 },
  ];
  const html = renderOverview(entries);

  it("links each region exit to its picker", () => {
    for (const name of ["spitfire", "soarin", "fleetfoot"]) assert.ok(html.includes('href="/' + name + '"'), name);
  });

  it("shows region, tunnel state and the people on it", () => {
    assert.match(html, /Dallas TX, USA/);
    assert.match(html, /2 people/);
    assert.match(html, /spitfire[\s\S]*?tunnel up/);
  });

  it("marks a region exit that did not answer as down, and one whose tunnel is down as such", () => {
    assert.match(html, /soarin[\s\S]*?not answering/);
    assert.match(html, /fleetfoot[\s\S]*?tunnel down/);
  });

  it("escapes what the region exits report", () => {
    assert.ok(html.includes("&lt;UK&gt;"));
    assert.ok(!html.includes("<UK>"));
  });

  it("offers no form: the overview only reads", () => {
    assert.ok(!/<form/i.test(html));
  });
});

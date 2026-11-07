// biome-ignore-all lint/style/useTemplate: as picker.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/region-exits/app/picker.test.ts
 *
 * The region picker, through its HTTP handler: what /status reports, what the
 * page offers from gluetun's servers.json, and what a switch writes to the
 * state ConfigMap and asks of gluetun's control API. gluetun and the
 * Kubernetes API are faked at fetch; servers.json at readFile.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHandler, type PickerConfig } from "./picker.ts";

const config: PickerConfig = {
  name: "spitfire",
  namespace: "region-exits",
  stateConfigMap: "region-exit-spitfire-state",
  gluetunUrl: "http://127.0.0.1:8000",
  kubeUrl: "https://kubernetes.default.svc",
  serversPath: "/gluetun/servers.json",
  tokenPath: "/var/run/secrets/kubernetes.io/serviceaccount/token",
  regionExits: ["spitfire", "soarin"],
  statusUrl: name => "http://" + name + ".peer:8080/status",
};

/** A slice of gluetun's servers.json: Mullvad, plus servers the picker must skip. */
const SERVERS = JSON.stringify({
  version: 1,
  mullvad: {
    version: 4,
    timestamp: 1,
    servers: [
      { vpn: "wireguard", country: "USA", city: "New York NY", hostname: "us-nyc-wg-001" },
      { vpn: "wireguard", country: "USA", city: "Dallas TX", hostname: "us-dal-wg-001" },
      { vpn: "wireguard", country: "USA", city: "New York NY", hostname: "us-nyc-wg-002" },
      { vpn: "wireguard", country: "Japan", city: "Tokyo", hostname: "jp-tok-wg-001" },
      { vpn: "wireguard", country: "Japan", city: "Osaka", hostname: "jp-osa-wg-001" },
      { vpn: "openvpn", country: "Brazil", city: "Sao Paulo", hostname: "br-sao-ovpn-001" },
    ],
  },
  nordvpn: { version: 1, timestamp: 1, servers: [{ vpn: "wireguard", country: "Peru", city: "Lima" }] },
});

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Route = (call: Call) => Response;

/** A fetch that answers from `routes` ("METHOD url" -> handler) and records every call. */
function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const text = typeof init?.body === "string" ? init.body : undefined;
    const call: Call = { method, url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: text === undefined ? undefined : JSON.parse(text) };
    calls.push(call);
    const route = routes[method + " " + url];
    if (!route) return new Response("no route", { status: 599 });
    return route(call);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const files: Record<string, string> = { [config.serversPath]: SERVERS, [config.tokenPath]: "sa-token\n" };
const readFile = async (path: string) => {
  if (!(path in files)) throw new Error("ENOENT " + path);
  return files[path];
};

function picker(routes: Record<string, Route> = {}) {
  const fake = fakeFetch(routes);
  return { handle: createHandler(config, { fetch: fake.fetch, readFile }), calls: fake.calls };
}

const get = (path: string, accept = "application/json") => new Request("http://picker" + path, { headers: { Accept: accept } });

describe("GET /spitfire/regions", () => {
  it("offers Mullvad WireGuard countries, each with its cities, sorted and without repeats", async () => {
    const { handle } = picker();
    const response = await handle(get("/spitfire/regions"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      { country: "Japan", cities: ["Osaka", "Tokyo"] },
      { country: "USA", cities: ["Dallas TX", "New York NY"] },
    ]);
  });
});

const G = config.gluetunUrl;
/** gluetun's control API, connected in Japan/Tokyo. */
const gluetunUp: Record<string, Route> = {
  ["GET " + G + "/v1/vpn/status"]: () => json({ status: "running" }),
  ["GET " + G + "/v1/vpn/settings"]: () =>
    json({ type: "wireguard", provider: { name: "mullvad", server_selection: { vpn: "wireguard", countries: ["Japan"], cities: ["Tokyo"] } }, wireguard: { private_key: "[redacted]" } }),
  ["GET " + G + "/v1/publicip/ip"]: () => json({ public_ip: "198.51.100.7", country: "Japan", city: "Tokyo", organization: "M247" }),
};

describe("GET /status", () => {
  it("reports the region, the tunnel, and the egress country gluetun sees", async () => {
    const { handle } = picker(gluetunUp);
    const response = await handle(get("/status"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      name: "spitfire",
      region: { country: "Japan", city: "Tokyo" },
      tunnel: { up: true, status: "running" },
      egress: { country: "Japan", city: "Tokyo", ip: "198.51.100.7" },
    });
  });

  it("is also served under the region exit's own path, where the route sends it", async () => {
    const { handle } = picker(gluetunUp);
    assert.equal((await (await handle(get("/spitfire/status"))).json()).name, "spitfire");
  });

  it("reports a region with no city as city null", async () => {
    const { handle } = picker({ ...gluetunUp, ["GET " + G + "/v1/vpn/settings"]: () => json({ provider: { server_selection: { countries: ["USA"], cities: null } } }) });
    assert.deepEqual((await (await handle(get("/status"))).json()).region, { country: "USA", city: null });
  });

  it("reports the tunnel down, and no region or egress, when gluetun does not answer", async () => {
    const { handle } = picker({});
    const response = await handle(get("/status"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { name: "spitfire", region: null, tunnel: { up: false, status: null }, egress: null });
  });

  it("reports the tunnel down while gluetun is reconnecting, and no egress until it has a public IP", async () => {
    const { handle } = picker({ ...gluetunUp, ["GET " + G + "/v1/vpn/status"]: () => json({ status: "stopping" }), ["GET " + G + "/v1/publicip/ip"]: () => json({ public_ip: "" }) });
    const body = await (await handle(get("/status"))).json();
    assert.deepEqual(body.tunnel, { up: false, status: "stopping" });
    assert.equal(body.egress, null);
  });
});

describe("GET /spitfire", () => {
  it("shows the current region and tunnel, and a form offering every country", async () => {
    const { handle } = picker(gluetunUp);
    const response = await handle(get("/spitfire", "text/html"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /Tokyo, Japan/);
    assert.match(html, /connected/);
    assert.match(html, /<form method="post" action="\/spitfire\/region"/);
    assert.match(html, /<option value="Japan" selected>Japan<\/option>/);
    assert.match(html, /<option value="USA">USA<\/option>/);
    // The cities, for the page's script to narrow by country.
    assert.match(html, /"Dallas TX","New York NY"/);
  });

  it("escapes names from servers.json", async () => {
    const original = files[config.serversPath];
    files[config.serversPath] = JSON.stringify({ mullvad: { servers: [{ vpn: "wireguard", country: "<b>X</b>", city: "</script><script>alert(1)" }] } });
    try {
      const html = await (await picker(gluetunUp).handle(get("/spitfire", "text/html"))).text();
      assert.doesNotMatch(html, /<b>X<\/b>/);
      assert.doesNotMatch(html, /<\/script><script>alert/);
    } finally {
      files[config.serversPath] = original;
    }
  });

  it("says the tunnel is down when gluetun does not answer", async () => {
    const html = await (await picker({}).handle(get("/spitfire", "text/html"))).text();
    assert.match(html, /not connected/);
  });
});

describe("GET /healthz", () => {
  it("answers without asking gluetun", async () => {
    const { handle, calls } = picker({});
    assert.equal((await handle(get("/healthz"))).status, 200);
    assert.deepEqual(calls, []);
  });
});

const STATE_URL = config.kubeUrl + "/api/v1/namespaces/region-exits/configmaps/region-exit-spitfire-state";
const APPLY = "PUT " + G + "/v1/vpn/settings";
const switchRoutes: Record<string, Route> = {
  ["PATCH " + STATE_URL]: () => json({ metadata: { name: "region-exit-spitfire-state" } }),
  [APPLY]: () => new Response("running"),
};
const post = (body: unknown) => new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });

describe("POST /spitfire/region", () => {
  it("saves the region to the state ConfigMap, then has gluetun reconnect there", async () => {
    const { handle, calls } = picker(switchRoutes);
    const response = await handle(post({ country: "Japan", city: "Tokyo" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { region: { country: "Japan", city: "Tokyo" }, outcome: "running" });
    assert.deepEqual(
      calls.map(c => c.method + " " + c.url),
      ["PATCH " + STATE_URL, APPLY],
    );
    assert.equal(calls[0].headers.authorization, "Bearer sa-token");
    assert.equal(calls[0].headers["content-type"], "application/merge-patch+json");
    assert.deepEqual(calls[0].body, { data: { SERVER_COUNTRIES: "Japan", SERVER_CITIES: "Tokyo" } });
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["Japan"], cities: ["Tokyo"] } } });
  });

  it("clears any city when only a country is picked", async () => {
    const { handle, calls } = picker(switchRoutes);
    assert.equal((await handle(post({ country: "USA" }))).status, 200);
    // A merge-patch null removes the key, so gluetun reads no SERVER_CITIES after a restart.
    assert.deepEqual(calls[0].body, { data: { SERVER_COUNTRIES: "USA", SERVER_CITIES: null } });
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["USA"], cities: [] } } });
  });

  it("creates the state ConfigMap the first time", async () => {
    const { handle, calls } = picker({
      ...switchRoutes,
      ["PATCH " + STATE_URL]: () => json({ kind: "Status", code: 404 }, 404),
      ["POST " + config.kubeUrl + "/api/v1/namespaces/region-exits/configmaps"]: () => json({}, 201),
    });
    assert.equal((await handle(post({ country: "Japan", city: "Osaka" }))).status, 200);
    assert.deepEqual(calls[1].body, { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "region-exit-spitfire-state" }, data: { SERVER_COUNTRIES: "Japan", SERVER_CITIES: "Osaka" } });
    assert.equal(calls[2].method + " " + calls[2].url, APPLY);
  });

  it("accepts the page's form post and sends the browser back to the page", async () => {
    const { handle, calls } = picker(switchRoutes);
    const response = await handle(new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "country=Japan&city=" }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/spitfire");
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["Japan"], cities: [] } } });
  });

  for (const [what, body] of [
    ["a country Mullvad does not offer", { country: "Atlantis" }],
    ["a city in another country", { country: "USA", city: "Tokyo" }],
    ["no country", { city: "Tokyo" }],
  ] as const) {
    it("refuses " + what + " and changes nothing", async () => {
      const { handle, calls } = picker(switchRoutes);
      assert.equal((await handle(post(body))).status, 400);
      assert.deepEqual(calls, []);
    });
  }

  it("leaves gluetun alone when the region cannot be saved", async () => {
    const { handle, calls } = picker({ ...switchRoutes, ["PATCH " + STATE_URL]: () => json({ code: 403 }, 403) });
    const response = await handle(post({ country: "Japan" }));
    assert.equal(response.status, 502);
    assert.deepEqual(
      calls.map(c => c.method),
      ["PATCH"],
    );
  });

  it("reports gluetun refusing the region", async () => {
    const { handle } = picker({ ...switchRoutes, [APPLY]: () => new Response("server selection: no server found", { status: 400 }) });
    const response = await handle(post({ country: "Japan" }));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /no server found/);
  });
});

describe("GET /", () => {
  it("shows the overview, built from every region exit's /status, one that is down included", async () => {
    const { handle, calls } = picker({
      ["GET http://spitfire.peer:8080/status"]: () => json({ name: "spitfire", region: { country: "USA", city: null }, tunnel: { up: true, status: "running" }, egress: null }),
      ["GET http://soarin.peer:8080/status"]: () => new Response("upstream connect error", { status: 503 }),
    });
    const response = await handle(get("/", "text/html"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /href="\/spitfire"[\s\S]*USA[\s\S]*tunnel up/);
    assert.match(html, /href="\/soarin"[\s\S]*not answering/);
    assert.deepEqual(calls.map(c => c.url).sort(), ["http://soarin.peer:8080/status", "http://spitfire.peer:8080/status"]);
  });
});

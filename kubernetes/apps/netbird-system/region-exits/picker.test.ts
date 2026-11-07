// biome-ignore-all lint/style/useTemplate: as picker.ts, which ships as a ConfigMap read by Flux envsubst.
/**
 * node --test kubernetes/apps/netbird-system/region-exits/picker.test.ts
 *
 * The region picker, through its HTTP handler: what /status reports, what the
 * page offers from gluetun's servers.json, and what a switch writes to the
 * state ConfigMap and asks of gluetun's control API. gluetun and the
 * Kubernetes API are faked at fetch; servers.json at readFile.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONNTRACK_PATH, ESTABLISHED_TIMEOUT_PATH } from "./activeClients.ts";
import { createHandler, MOVED_AT_ANNOTATION, MOVED_BY_ANNOTATION, moverName, type PickerConfig } from "./picker.ts";

const config: PickerConfig = {
  name: "spitfire",
  namespace: "netbird-system",
  stateConfigMap: "region-exit-spitfire-state",
  gluetunUrl: "http://127.0.0.1:8000",
  kubeUrl: "https://kubernetes.default.svc",
  serversPath: "/gluetun/servers.json",
  tokenPath: "/var/run/secrets/kubernetes.io/serviceaccount/token",
  regionExits: ["spitfire", "soarin"],
  statusUrl: name => "http://" + name + ".peer:8080/status",
  tailscaleSocket: "/var/run/tailscale/tailscaled.sock",
  netbirdFlagsPath: "/sys/class/net/wt0/flags",
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
      { vpn: "wireguard", country: "Canada", city: "Toronto ON", hostname: "ca-tor-wg-001" },
      { vpn: "wireguard", country: "UK", city: "London", hostname: "gb-lon-wg-001" },
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
/** wt0 up (IFF_UP | IFF_POINTOPOINT | IFF_NOARP), as sysfs prints it. */
const WT0_UP = "0x91\n";
// Nobody on the region exit, unless a test says otherwise.
const files: Record<string, string> = {
  [config.serversPath]: SERVERS,
  [config.tokenPath]: "sa-token\n",
  [CONNTRACK_PATH]: "",
  [ESTABLISHED_TIMEOUT_PATH]: "432000\n",
  [config.netbirdFlagsPath]: WT0_UP,
};
/** One Tailscale and one NetBird client browsing through the tunnel. */
const TWO_PEOPLE = [
  "ipv4     2 tcp      6 431990 ESTABLISHED src=100.101.1.2 dst=93.184.216.34 sport=51234 dport=443 src=93.184.216.34 dst=10.64.12.34 sport=443 dport=51234 [ASSURED] mark=0 zone=0 use=2",
  "ipv4     2 udp      17 110 src=10.100.3.4 dst=9.9.9.9 sport=40000 dport=443 src=9.9.9.9 dst=10.64.12.34 sport=443 dport=40000 [ASSURED] mark=0 zone=0 use=2",
].join("\n");
/** Runs `body` with conntrack reading `table`, or unreadable when null. */
async function withConntrack(table: string | null, body: () => Promise<void>): Promise<void> {
  const original = files[CONNTRACK_PATH];
  if (table === null) delete files[CONNTRACK_PATH];
  else files[CONNTRACK_PATH] = table;
  try {
    await body();
  } finally {
    files[CONNTRACK_PATH] = original;
  }
}
const readFile = async (path: string) => {
  if (!(path in files)) throw new Error("ENOENT " + path);
  return files[path];
};

interface LocalApiCall {
  socketPath: string;
  path: string;
  headers: Record<string, string>;
}
const TAILSCALE_RUNNING = { BackendState: "Running", Self: { HostName: "spitfire", Online: true } };
/** tailscaled's LocalAPI on its socket, answering /localapi/v0/status with `status`; null is no socket. */
function fakeLocalApi(status: unknown) {
  const calls: LocalApiCall[] = [];
  const unixGet = async (socketPath: string, path: string, headers: Record<string, string>) => {
    calls.push({ socketPath, path, headers });
    if (status === null) throw new Error("connect ENOENT " + socketPath);
    return { status: 200, body: JSON.stringify(status) };
  };
  return { unixGet, calls };
}

/** The clock every move is made at. */
const NOW = new Date("2026-11-07T18:00:00.000Z");
const STATE_URL = config.kubeUrl + "/api/v1/namespaces/netbird-system/configmaps/region-exit-spitfire-state";
/** No state ConfigMap, so no last move, unless a test routes GET STATE_URL itself. */
const noState: Record<string, Route> = { ["GET " + STATE_URL]: () => json({ kind: "Status", code: 404 }, 404) };

function picker(routes: Record<string, Route> = {}, tailscale: unknown = TAILSCALE_RUNNING) {
  const fake = fakeFetch({ ...noState, ...routes });
  const localApi = fakeLocalApi(tailscale);
  return { handle: createHandler(config, { fetch: fake.fetch, readFile, unixGet: localApi.unixGet, now: () => NOW }), calls: fake.calls, localApiCalls: localApi.calls };
}

const get = (path: string, accept = "application/json") => new Request("http://picker" + path, { headers: { Accept: accept } });

describe("GET /spitfire/regions", () => {
  it("offers Mullvad WireGuard countries, each with its cities, sorted and without repeats", async () => {
    const { handle } = picker();
    const response = await handle(get("/spitfire/regions"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      { country: "Canada", cities: ["Toronto ON"] },
      { country: "Japan", cities: ["Osaka", "Tokyo"] },
      { country: "UK", cities: ["London"] },
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
      activeClients: 0,
      overlays: { tailscale: true, netbird: true },
      availability: { state: "online" },
      lastMove: null,
    });
  });

  it("reports who last moved it and when, from the state ConfigMap's annotations", async () => {
    const { handle, calls } = picker({
      ...gluetunUp,
      ["GET " + STATE_URL]: () => json({ metadata: { name: "region-exit-spitfire-state", annotations: { [MOVED_BY_ANNOTATION]: "Jamie", [MOVED_AT_ANNOTATION]: "2026-11-07T17:00:00.000Z" } } }),
    });
    assert.deepEqual((await (await handle(get("/status"))).json()).lastMove, { by: "Jamie", at: "2026-11-07T17:00:00.000Z" });
    const read = calls.find(c => c.url === STATE_URL);
    assert.equal(read?.method, "GET");
    assert.equal(read?.headers.authorization, "Bearer sa-token");
  });

  it("reports a move with no mover as by null", async () => {
    const { handle } = picker({ ...gluetunUp, ["GET " + STATE_URL]: () => json({ metadata: { annotations: { [MOVED_AT_ANNOTATION]: "2026-11-07T17:00:00.000Z" } } }) });
    assert.deepEqual((await (await handle(get("/status"))).json()).lastMove, { by: null, at: "2026-11-07T17:00:00.000Z" });
  });

  for (const [what, route] of [
    ["the state ConfigMap has no move recorded, as one saved before moves were", () => json({ metadata: { name: "region-exit-spitfire-state" }, data: { SERVER_COUNTRIES: "Japan" } })],
    ["the state ConfigMap cannot be read", () => json({ kind: "Status", code: 403 }, 403)],
    ["the Kubernetes API does not answer", () => new Response("no", { status: 599 })],
  ] as const) {
    it("reports lastMove null when " + what + ", and the rest as usual", async () => {
      const { handle } = picker({ ...gluetunUp, ["GET " + STATE_URL]: route });
      const body = await (await handle(get("/status"))).json();
      assert.equal(body.lastMove, null);
      assert.deepEqual(body.region, { country: "Japan", city: "Tokyo" });
    });
  }

  it("counts the people on the region exit", async () => {
    await withConntrack(TWO_PEOPLE, async () => {
      assert.equal((await (await picker(gluetunUp).handle(get("/status"))).json()).activeClients, 2);
    });
  });

  it("reports activeClients null when conntrack cannot be read", async () => {
    await withConntrack(null, async () => {
      assert.equal((await (await picker(gluetunUp).handle(get("/status"))).json()).activeClients, null);
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

  /** /status's region with gluetun's server_selection set to `countries`/`cities`. */
  const statusRegion = async (countries: string[], cities: string[] | null) =>
    (await (await picker({ ...gluetunUp, ["GET " + G + "/v1/vpn/settings"]: () => json({ provider: { server_selection: { countries, cities } } }) }).handle(get("/status"))).json()).region;

  it("reports the region in servers.json's spelling when gluetun lowercases it", async () => {
    assert.deepEqual(await statusRegion(["japan"], ["tokyo"]), { country: "Japan", city: "Tokyo" });
    assert.deepEqual(await statusRegion(["uk"], null), { country: "UK", city: null });
    assert.deepEqual(await statusRegion(["usa"], ["new york ny"]), { country: "USA", city: "New York NY" });
  });

  it("title-cases a lowercase region servers.json does not list", async () => {
    assert.deepEqual(await statusRegion(["atlantis"], ["lost city"]), { country: "Atlantis", city: "Lost City" });
  });

  it("title-cases a lowercase region when servers.json cannot be read", async () => {
    const original = files[config.serversPath];
    delete files[config.serversPath];
    try {
      assert.deepEqual(await statusRegion(["canada"], null), { country: "Canada", city: null });
    } finally {
      files[config.serversPath] = original;
    }
  });

  it("reports the tunnel down, and no region or egress, when gluetun does not answer", async () => {
    const { handle } = picker({});
    const response = await handle(get("/status"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      name: "spitfire",
      region: null,
      tunnel: { up: false, status: null },
      egress: null,
      activeClients: 0,
      overlays: { tailscale: true, netbird: true },
      availability: { state: "offline", reason: "tunnel" },
      lastMove: null,
    });
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

  /** The page with gluetun connected in `countries`/`cities`. */
  const pageIn = async (countries: string[], cities: string[] | null) =>
    (await picker({ ...gluetunUp, ["GET " + G + "/v1/vpn/settings"]: () => json({ provider: { server_selection: { countries, cities } } }) }).handle(get("/spitfire", "text/html"))).text();
  /** The city <select>'s options, as served. */
  const citySelect = (html: string) => html.match(/<select id="city"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? assert.fail("no city select");

  it("preselects the current city, among the current country's cities only", async () => {
    const cities = citySelect(await pageIn(["Japan"], ["Tokyo"]));
    assert.equal(cities, '<option value="">Any city</option><option value="Osaka">Osaka</option><option value="Tokyo" selected>Tokyo</option>');
  });

  it("preselects Any city when the region exit has no city", async () => {
    const html = await pageIn(["USA"], null);
    assert.match(html, /<option value="USA" selected>USA<\/option>/);
    assert.equal(citySelect(html), '<option value="" selected>Any city</option><option value="Dallas TX">Dallas TX</option><option value="New York NY">New York NY</option>');
  });

  it("offers the first country's cities when there is no current region", async () => {
    assert.equal(citySelect(await (await picker({}).handle(get("/spitfire", "text/html"))).text()), '<option value="" selected>Any city</option><option value="Toronto ON">Toronto ON</option>');
  });

  it("offers USA, Canada and UK as one-click moves, each posting a country with no city", async () => {
    const html = await pageIn(["Japan"], ["Tokyo"]);
    assert.match(html, /<form id="quick" method="post" action="\/spitfire\/region"><\/form>/);
    assert.match(html, /<button form="quick" name="country" value="USA">USA<\/button><button form="quick" name="country" value="Canada">Canada<\/button><button form="quick" name="country" value="UK">UK<\/button>/);
  });

  it("marks the current country's quick button and disables it", async () => {
    const html = await pageIn(["Canada"], ["Toronto ON"]);
    assert.match(html, /<button form="quick" name="country" value="Canada" disabled aria-current="true">Canada \(current\)<\/button>/);
    assert.match(html, /<button form="quick" name="country" value="USA">USA<\/button>/);
  });

  it("preselects and marks the current region when gluetun reports it lowercased", async () => {
    const html = await pageIn(["canada"], ["toronto on"]);
    assert.match(html, /Region: <strong>Toronto ON, Canada<\/strong>/);
    assert.match(html, /<option value="Canada" selected>Canada<\/option>/);
    assert.match(html, /<option value="Toronto ON" selected>Toronto ON<\/option>/);
    assert.match(html, /<button form="quick" name="country" value="Canada" disabled aria-current="true">Canada \(current\)<\/button>/);
    // The page's script compares against the same spelling as the options.
    assert.match(html, /const current = \{"country":"Canada","city":"Toronto ON"\};/);
  });

  it("leaves out a quick country Mullvad does not offer", async () => {
    const original = files[config.serversPath];
    files[config.serversPath] = JSON.stringify({ mullvad: { servers: [{ vpn: "wireguard", country: "USA", city: "Dallas TX" }] } });
    try {
      const html = await pageIn(["USA"], null);
      assert.doesNotMatch(html, /value="Canada"/);
      assert.match(html, /value="USA" disabled/);
    } finally {
      files[config.serversPath] = original;
    }
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

  it("says how many people are on it", async () => {
    await withConntrack(TWO_PEOPLE, async () => {
      assert.match(await (await picker(gluetunUp).handle(get("/spitfire", "text/html"))).text(), /2 people are using spitfire right now/);
    });
  });

  it("says the tunnel is down when gluetun does not answer", async () => {
    const html = await (await picker({}).handle(get("/spitfire", "text/html"))).text();
    assert.match(html, /not connected/);
  });

  /** Where `text` sits on the page, which must be before the form. */
  const beforeForm = (html: string, text: RegExp) => {
    const at = html.search(text);
    assert.ok(at >= 0, "missing " + text);
    assert.ok(at < html.indexOf("<form"), text + " should come before the form");
  };

  it("says it is online, above the form, when the tunnel and both overlays are up", async () => {
    const html = await (await picker(gluetunUp).handle(get("/spitfire", "text/html"))).text();
    beforeForm(html, />Online</);
  });

  it("says it is offline on NetBird, what still works, and still offers the form", async () => {
    const original = files[config.netbirdFlagsPath];
    delete files[config.netbirdFlagsPath];
    try {
      const html = await (await picker(gluetunUp).handle(get("/spitfire", "text/html"))).text();
      beforeForm(html, /Offline on NetBird, Tailscale works/);
      assert.match(html, /People on Tailscale can still use spitfire/);
      assert.match(html, /<form method="post" action="\/spitfire\/region"/);
    } finally {
      files[config.netbirdFlagsPath] = original;
    }
  });

  it("says it is offline on Tailscale, and that NetBird still works", async () => {
    const html = await (await picker(gluetunUp, { BackendState: "NeedsLogin", Self: { Online: false } }).handle(get("/spitfire", "text/html"))).text();
    beforeForm(html, /Offline on Tailscale, NetBird works/);
    assert.match(html, /People on NetBird can still use spitfire/);
  });

  it("says it is offline when the tunnel is down, that nothing gets out, and suggests moving it", async () => {
    const html = await (await picker({ ...gluetunUp, ["GET " + G + "/v1/vpn/status"]: () => json({ status: "stopped" }) }).handle(get("/spitfire", "text/html"))).text();
    beforeForm(html, /Offline: not connected to Mullvad/);
    assert.match(html, /Nothing gets out through spitfire/);
    assert.match(html, /Picking a region below reconnects/);
    assert.match(html, /<form method="post" action="\/spitfire\/region"/);
  });

  it("says it is offline when neither overlay is connected", async () => {
    const original = files[config.netbirdFlagsPath];
    delete files[config.netbirdFlagsPath];
    try {
      const html = await (await picker(gluetunUp, null).handle(get("/spitfire", "text/html"))).text();
      beforeForm(html, /Offline: not connected to NetBird or Tailscale/);
    } finally {
      files[config.netbirdFlagsPath] = original;
    }
  });
});

describe("GET /healthz", () => {
  it("answers without asking gluetun", async () => {
    const { handle, calls } = picker({});
    assert.equal((await handle(get("/healthz"))).status, 200);
    assert.deepEqual(calls, []);
  });
});

describe("the overlays on /status", () => {
  it("asks tailscaled's LocalAPI on its socket, by the host name the LocalAPI requires", async () => {
    const { handle, localApiCalls } = picker(gluetunUp);
    await handle(get("/status"));
    assert.deepEqual(localApiCalls, [{ socketPath: config.tailscaleSocket, path: "/localapi/v0/status", headers: { Host: "local-tailscaled.sock" } }]);
  });

  for (const [what, status] of [
    ["tailscaled is not running (no socket)", null],
    ["tailscaled needs a login", { BackendState: "NeedsLogin", Self: { Online: false } }],
    ["tailscaled has lost the control plane", { BackendState: "Running", Self: { Online: false } }],
  ] as const) {
    it("reports Tailscale offline when " + what + ", and NetBird still connected", async () => {
      const { handle } = picker(gluetunUp, status);
      const body = await (await handle(get("/status"))).json();
      assert.deepEqual(body.overlays, { tailscale: false, netbird: true });
      assert.deepEqual(body.availability, { state: "degraded", offlineOn: "tailscale" });
    });
  }

  for (const [what, flags] of [
    ["wt0 is gone (NetBird stopped, or gave up on management)", undefined],
    ["wt0 is down", "0x90\n"],
  ] as const) {
    it("reports NetBird offline when " + what, async () => {
      const original = files[config.netbirdFlagsPath];
      if (flags === undefined) delete files[config.netbirdFlagsPath];
      else files[config.netbirdFlagsPath] = flags;
      try {
        const { handle } = picker(gluetunUp);
        const body = await (await handle(get("/status"))).json();
        assert.deepEqual(body.overlays, { tailscale: true, netbird: false });
        assert.deepEqual(body.availability, { state: "degraded", offlineOn: "netbird" });
      } finally {
        files[config.netbirdFlagsPath] = original;
      }
    });
  }
});

describe("GET /metrics", () => {
  it("serves the status as Prometheus text", async () => {
    const { handle } = picker(gluetunUp, { BackendState: "Stopped", Self: { Online: false } });
    const response = await handle(new Request("http://picker/metrics"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/plain; version=0\.0\.4/);
    const text = await response.text();
    assert.match(text, /^region_exit_tunnel_up\{region_exit="spitfire"\} 1$/m);
    assert.match(text, /^region_exit_egress_country_match\{region_exit="spitfire"\} 1$/m);
    assert.match(text, /^region_exit_overlay_connected\{region_exit="spitfire",overlay="tailscale"\} 0$/m);
    assert.match(text, /^region_exit_overlay_connected\{region_exit="spitfire",overlay="netbird"\} 1$/m);
  });

  it("is not served under the route's path, so the HTTPRoute never publishes it", async () => {
    const { handle } = picker(gluetunUp);
    assert.equal((await handle(new Request("http://picker/spitfire/metrics"))).status, 404);
  });
});

const APPLY = "PUT " + G + "/v1/vpn/settings";
const switchRoutes: Record<string, Route> = {
  ["PATCH " + STATE_URL]: () => json({ metadata: { name: "region-exit-spitfire-state" } }),
  [APPLY]: () => new Response("running"),
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body) });
/** The state ConfigMap's merge patch for a move to `data`, made at NOW by `by`. */
const statePatch = (data: Record<string, string | null>, by: string | null = null) => ({ metadata: { annotations: { [MOVED_BY_ANNOTATION]: by, [MOVED_AT_ANNOTATION]: NOW.toISOString() } }, data });

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
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: "Tokyo" }));
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["Japan"], cities: ["Tokyo"] } } });
  });

  it("records who moved it from forward auth's display name, else the username", async () => {
    const named = picker(switchRoutes);
    await named.handle(post({ country: "Japan" }, { "X-authentik-name": "Jamie Doe", "X-authentik-username": "jamie" }));
    assert.deepEqual(named.calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: null }, "Jamie Doe"));
    const unnamed = picker(switchRoutes);
    await unnamed.handle(post({ country: "Japan" }, { "X-authentik-username": "jamie" }));
    assert.deepEqual(unnamed.calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: null }, "jamie"));
  });

  it("ignores a movedBy in the body: on this path the mover is forward auth's", async () => {
    const { handle, calls } = picker(switchRoutes);
    await handle(post({ country: "Japan", movedBy: "Someone Else" }, { "X-authentik-username": "jamie" }));
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: null }, "jamie"));
  });

  it("clears any city when only a country is picked", async () => {
    const { handle, calls } = picker(switchRoutes);
    assert.equal((await handle(post({ country: "USA" }))).status, 200);
    // A merge-patch null removes the key, so gluetun reads no SERVER_CITIES after a restart.
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "USA", SERVER_CITIES: null }));
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["USA"], cities: [] } } });
  });

  it("creates the state ConfigMap the first time", async () => {
    const { handle, calls } = picker({
      ...switchRoutes,
      ["PATCH " + STATE_URL]: () => json({ kind: "Status", code: 404 }, 404),
      ["POST " + config.kubeUrl + "/api/v1/namespaces/netbird-system/configmaps"]: () => json({}, 201),
    });
    assert.equal((await handle(post({ country: "Japan", city: "Osaka" }))).status, 200);
    assert.deepEqual(calls[1].body, {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "region-exit-spitfire-state", annotations: { [MOVED_AT_ANNOTATION]: NOW.toISOString() } },
      data: { SERVER_COUNTRIES: "Japan", SERVER_CITIES: "Osaka" },
    });
    assert.equal(calls[2].method + " " + calls[2].url, APPLY);
  });

  it("accepts the page's form post and sends the browser back to the page", async () => {
    const { handle, calls } = picker(switchRoutes);
    const response = await handle(new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "country=Japan&city=" }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/spitfire");
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["Japan"], cities: [] } } });
  });

  it("moves to a quick button's country with no city, as the form does", async () => {
    const { handle, calls } = picker(switchRoutes);
    // A quick button sends its country and no city field at all.
    const response = await handle(new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "country=Canada" }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/spitfire");
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Canada", SERVER_CITIES: null }));
    assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["Canada"], cities: [] } } });
  });

  it("saves a region typed in another case in servers.json's spelling", async () => {
    const { handle, calls } = picker(switchRoutes);
    assert.equal((await handle(post({ country: "japan", city: "tokyo" }))).status, 200);
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: "Tokyo" }));
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

  describe("with people on the region exit", () => {
    it("asks for confirmation, and moves nothing, until the switch is confirmed", async () => {
      await withConntrack(TWO_PEOPLE, async () => {
        const { handle, calls } = picker(switchRoutes);
        const response = await handle(post({ country: "Japan" }));
        assert.equal(response.status, 409);
        const body = await response.json();
        assert.equal(body.activeClients, 2);
        assert.equal(body.confirm, true);
        assert.deepEqual(calls, []);
      });
    });

    it("moves once confirmed", async () => {
      await withConntrack(TWO_PEOPLE, async () => {
        const { handle, calls } = picker(switchRoutes);
        assert.equal((await handle(post({ country: "Japan", confirm: true }))).status, 200);
        assert.deepEqual(
          calls.map(c => c.method + " " + c.url),
          ["PATCH " + STATE_URL, APPLY],
        );
      });
    });

    it("asks too when it cannot tell who is on it", async () => {
      await withConntrack(null, async () => {
        const { handle, calls } = picker(switchRoutes);
        const response = await handle(post({ country: "Japan" }));
        assert.equal(response.status, 409);
        assert.equal((await response.json()).activeClients, null);
        assert.deepEqual(calls, []);
      });
    });

    it("asks before a quick button moves anyone, then moves to that country with no city", async () => {
      await withConntrack(TWO_PEOPLE, async () => {
        const { handle, calls } = picker(switchRoutes);
        const form = (body: string) => new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const html = await (await handle(form("country=UK"))).text();
        assert.match(html, /Move spitfire to UK\?/);
        assert.match(html, /<input type="hidden" name="country" value="UK"><input type="hidden" name="city" value="">/);
        assert.equal(calls.length, 0);
        assert.equal((await handle(form("country=UK&city=&confirm=yes"))).status, 303);
        assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["UK"], cities: [] } } });
      });
    });

    it("answers the page's form with a confirmation page that resubmits the same region", async () => {
      await withConntrack(TWO_PEOPLE, async () => {
        const { handle, calls } = picker(switchRoutes);
        const form = (body: string) => new Request("http://picker/spitfire/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const response = await handle(form("country=Japan&city=Tokyo"));
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") ?? "", /text\/html/);
        const html = await response.text();
        assert.match(html, /2 people are using spitfire right now/);
        assert.match(html, /<form method="post" action="\/spitfire\/region"/);
        assert.match(html, /<input type="hidden" name="country" value="Japan">/);
        assert.match(html, /<input type="hidden" name="city" value="Tokyo">/);
        assert.match(html, /<input type="hidden" name="confirm" value="yes">/);
        assert.equal(calls.length, 0);

        const confirmed = await handle(form("country=Japan&city=Tokyo&confirm=yes"));
        assert.equal(confirmed.status, 303);
        assert.deepEqual(calls[1].body, { provider: { server_selection: { countries: ["Japan"], cities: ["Tokyo"] } } });
      });
    });
  });
});

/** The region picker app's move: JSON, on the root path. */
const appPost = (body: unknown) => new Request("http://picker/region", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });

describe("the region picker app's endpoints", () => {
  it("GET /regions offers the same countries and cities as /spitfire/regions", async () => {
    const { handle } = picker();
    const root = await handle(get("/regions"));
    assert.equal(root.status, 200);
    assert.deepEqual(await root.json(), await (await handle(get("/spitfire/regions"))).json());
  });

  it("POST /region moves it, recording the mover the app names", async () => {
    const { handle, calls } = picker(switchRoutes);
    const response = await handle(appPost({ country: "Japan", city: "Tokyo", movedBy: "Jamie Doe" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { region: { country: "Japan", city: "Tokyo" }, outcome: "running" });
    assert.deepEqual(
      calls.map(c => c.method + " " + c.url),
      ["PATCH " + STATE_URL, APPLY],
    );
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: "Tokyo" }, "Jamie Doe"));
  });

  it("POST /region takes the mover from the body only, never forward auth's headers", async () => {
    const { handle, calls } = picker(switchRoutes);
    const request = new Request("http://picker/region", { method: "POST", headers: { "Content-Type": "application/json", "X-authentik-username": "jamie" }, body: JSON.stringify({ country: "Japan" }) });
    assert.equal((await handle(request)).status, 200);
    assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: null }));
  });

  it("POST /region refuses a form post and changes nothing", async () => {
    const { handle, calls } = picker(switchRoutes);
    const response = await handle(new Request("http://picker/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "country=Japan" }));
    assert.equal(response.status, 415);
    assert.deepEqual(calls, []);
  });

  it("POST /region refuses a region Mullvad does not offer", async () => {
    const { handle, calls } = picker(switchRoutes);
    assert.equal((await handle(appPost({ country: "Atlantis", movedBy: "Jamie" }))).status, 400);
    assert.deepEqual(calls, []);
  });

  it("POST /region asks for confirmation with people on it, and moves once confirmed", async () => {
    await withConntrack(TWO_PEOPLE, async () => {
      const { handle, calls } = picker(switchRoutes);
      const asked = await handle(appPost({ country: "Japan", movedBy: "Jamie" }));
      assert.equal(asked.status, 409);
      assert.deepEqual(await asked.json(), { error: "2 people are using spitfire right now. Send it again with confirm: true to move them.", activeClients: 2, confirm: true });
      assert.equal(calls.length, 0);
      assert.equal((await handle(appPost({ country: "Japan", movedBy: "Jamie", confirm: true }))).status, 200);
      assert.deepEqual(calls[0].body, statePatch({ SERVER_COUNTRIES: "Japan", SERVER_CITIES: null }, "Jamie"));
    });
  });
});

describe("moverName", () => {
  for (const [given, expected] of [
    ["Jamie Doe", "Jamie Doe"],
    ["  Zoë  ", "Zoë"],
    ["Ja\nmie\u0000", "Jamie"],
    ["", null],
    ["   ", null],
    [42, null],
    [undefined, null],
  ] as const) {
    it("makes " + JSON.stringify(given) + " " + JSON.stringify(expected), () => {
      assert.equal(moverName(given), expected);
    });
  }

  it("keeps at most 256 characters", () => {
    assert.equal(moverName("x".repeat(300))?.length, 256);
  });

  it("never cuts a character in half at the limit", () => {
    const name = moverName("x".repeat(255) + "🦄🦄") ?? "";
    assert.equal([...name].length, 256);
    assert.ok(name.endsWith("🦄"));
  });
});

describe("GET /", () => {
  it("shows the overview, built from every region exit's /status, one that is down included", async () => {
    const { handle, calls } = picker({
      "GET http://spitfire.peer:8080/status": () =>
        json({
          name: "spitfire",
          region: { country: "USA", city: null },
          tunnel: { up: true, status: "running" },
          egress: null,
          overlays: { tailscale: true, netbird: false },
          availability: { state: "degraded", offlineOn: "netbird" },
        }),
      "GET http://soarin.peer:8080/status": () => new Response("upstream connect error", { status: 503 }),
    });
    const response = await handle(get("/", "text/html"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    const html = await response.text();
    assert.match(html, /href="\/spitfire"[\s\S]*Offline on NetBird, Tailscale works[\s\S]*USA/);
    assert.match(html, /href="\/soarin"[\s\S]*Not responding/);
    assert.match(html, /Last checked <time/);
    assert.deepEqual(calls.map(c => c.url).sort(), ["http://soarin.peer:8080/status", "http://spitfire.peer:8080/status"]);
  });

  it("shows a region a peer reports lowercased in servers.json's spelling", async () => {
    const peer = (country: string, city: string | null) => () =>
      json({ region: { country, city }, tunnel: { up: true, status: "running" }, overlays: { tailscale: true, netbird: true }, availability: { state: "online" } });
    const { handle } = picker({ "GET http://spitfire.peer:8080/status": peer("uk", null), "GET http://soarin.peer:8080/status": peer("usa", "dallas tx") });
    const html = await (await handle(get("/", "text/html"))).text();
    assert.match(html, /<td>UK<\/td>/);
    assert.match(html, /<td>Dallas TX, USA<\/td>/);
    assert.doesNotMatch(html, />uk</);
  });
});

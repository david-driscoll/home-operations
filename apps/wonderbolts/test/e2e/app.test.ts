/**
 * The built app against dev/mock-agent.ts: what the server routes answer, who
 * may move a region exit, and what the pages render for family and for
 * friends. The forward-auth headers are sent by hand, as Traefik would.
 */
import { fileURLToPath } from "node:url";
import { $fetch, fetch, setup } from "@nuxt/test-utils/e2e";
import { afterAll, describe, expect, it } from "vitest";
import { startMockAgent } from "../../dev/mock-agent";

const agent = await startMockAgent();
await setup({
  rootDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: true,
  build: true,
  nuxtConfig: { runtimeConfig: { agentUrlTemplate: agent.template } },
});
afterAll(() => agent.close());

const FAMILY = { "x-authentik-username": "jamie", "x-authentik-name": "Jamie Doe", "x-authentik-groups": "family|users" };
const ADMIN = { "x-authentik-username": "david", "x-authentik-groups": "admins" };
const FRIEND = { "x-authentik-username": "pat", "x-authentik-name": "Pat", "x-authentik-groups": "friends|users" };

const post = (name: string, body: unknown, headers: Record<string, string>) =>
  fetch(`/api/region-exits/${name}/region`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const movesTo = (name: string) => agent.moves.filter(m => m.name === name);

describe("server routes", () => {
  it("answers /healthz without asking a region exit", async () => {
    expect(await $fetch("/healthz")).toBe("ok");
  });

  it("lists every region exit in order, one that does not answer included", async () => {
    const { regionExits, checkedAt } = await $fetch<{ checkedAt: string; regionExits: { name: string; availability: { state: string }; lastMove: unknown }[] }>("/api/region-exits", { headers: FRIEND });
    expect(regionExits.map(e => [e.name, e.availability.state])).toEqual([
      ["spitfire", "online"],
      ["soarin", "online"],
      ["fleetfoot", "degraded"],
      ["misty-fly", "online"],
      ["high-winds", "unreachable"],
    ]);
    expect(regionExits[0]?.lastMove).toMatchObject({ by: "Jamie" });
    expect(regionExits[2]?.lastMove).toMatchObject({ by: null });
    expect(Number.isNaN(Date.parse(checkedAt))).toBe(false);
  });

  it("404s a name that is not a region exit", async () => {
    expect((await fetch("/api/region-exits/twilight")).status).toBe(404);
    expect((await fetch("/api/region-exits/twilight/regions")).status).toBe(404);
  });

  it.each([
    ["family", FAMILY, { username: "jamie", name: "Jamie Doe", canMove: true }],
    ["an admin", ADMIN, { username: "david", name: "david", canMove: true }],
    ["a friend", FRIEND, { username: "pat", name: "Pat", canMove: false }],
    ["nobody", {}, { username: null, name: null, canMove: false }],
  ] as const)("tells %s whether they may move one", async (_, headers, viewer) => {
    expect(await $fetch("/api/viewer", { headers })).toEqual(viewer);
  });
});

describe("moving a region exit", () => {
  it("refuses a friend, and the agent never hears of it", async () => {
    const response = await post("soarin", { country: "Japan" }, FRIEND);
    expect(response.status).toBe(403);
    expect(movesTo("soarin")).toEqual([]);
  });

  it("refuses a request with no forward-auth headers", async () => {
    expect((await post("soarin", { country: "Japan" }, {})).status).toBe(403);
  });

  it("refuses a form post, and a request from another site", async () => {
    const form = await fetch("/api/region-exits/soarin/region", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...FAMILY }, body: "country=Japan" });
    expect(form.status).toBe(415);
    expect((await post("soarin", { country: "Japan" }, { ...FAMILY, "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect(movesTo("soarin")).toEqual([]);
  });

  it("refuses a body with no country before asking the agent", async () => {
    expect((await post("soarin", { city: "Tokyo" }, FAMILY)).status).toBe(400);
    expect(movesTo("soarin")).toEqual([]);
  });

  it("passes the agent's refusal of a region Mullvad does not offer through", async () => {
    const response = await post("soarin", { country: "Atlantis" }, FAMILY);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Mullvad has no WireGuard servers in Atlantis" });
  });

  it("moves it for family, telling the agent the display name", async () => {
    const response = await post("soarin", { country: "Japan", city: "Tokyo" }, FAMILY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ region: { country: "Japan", city: "Tokyo" }, outcome: "running" });
    expect(movesTo("soarin").at(-1)?.body).toEqual({ country: "Japan", city: "Tokyo", confirm: false, movedBy: "Jamie Doe" });
    const { view } = await $fetch<{ view: { lastMove: { by: string } } }>("/api/region-exits/soarin", { headers: FRIEND });
    expect(view.lastMove.by).toBe("Jamie Doe");
  });

  it("passes the agent's 409 through with people on it, and moves once confirmed", async () => {
    const asked = await post("misty-fly", { country: "UK" }, ADMIN);
    expect(asked.status).toBe(409);
    expect(await asked.json()).toEqual({ error: "2 people are using misty-fly right now. Send it again with confirm: true to move them.", activeClients: 2, confirm: true });
    const confirmed = await post("misty-fly", { country: "UK", confirm: true }, ADMIN);
    expect(confirmed.status).toBe(200);
    expect(movesTo("misty-fly").at(-1)?.body).toMatchObject({ confirm: true, movedBy: "david" });
  });

  it("records a UTF-8 display name as written, though it reaches Node as latin1", async () => {
    const name = "Zoë 🦄";
    // What arrives when Traefik forwards the outpost's UTF-8 bytes: undici sends each char as one byte.
    const response = await post("spitfire", { country: "Canada", confirm: true }, { ...FAMILY, "x-authentik-name": Buffer.from(name, "utf8").toString("latin1") });
    expect(response.status).toBe(200);
    expect(movesTo("spitfire").at(-1)?.body.movedBy).toBe(name);
  });

  it("answers 502 when the region exit does not answer", async () => {
    expect((await post("high-winds", { country: "USA" }, FAMILY)).status).toBe(502);
  });
});

describe("pages", () => {
  it("renders the overview on the server, every region exit and its state", async () => {
    const html = await $fetch<string>("/", { headers: FRIEND });
    for (const name of ["spitfire", "soarin", "fleetfoot", "misty-fly", "high-winds"]) expect(html).toContain(`href="/${name}"`);
    expect(html).toContain("Not responding");
    expect(html).toContain("Offline on NetBird, Tailscale works");
    expect(html).toContain("Moved by unknown");
    expect(html).toContain("Last checked");
  });

  it("shows a friend a region exit with no controls, and says who to ask", async () => {
    const html = await $fetch<string>("/fleetfoot", { headers: FRIEND });
    expect(html).toContain("Offline on NetBird, Tailscale works");
    expect(html).toContain("Only family can move region exits.");
    expect(html).toContain("Ask David or family to move this one.");
    expect(html).not.toContain("Move fleetfoot");
  });

  it("shows family the controls, and no friend note", async () => {
    const html = await $fetch<string>("/fleetfoot", { headers: FAMILY });
    expect(html).toContain("Move fleetfoot");
    expect(html).toContain("USA");
    expect(html).not.toContain("Only family can move region exits.");
  });

  it("404s a page for a name that is not a region exit", async () => {
    expect((await fetch("/twilight", { headers: FAMILY })).status).toBe(404);
  });
});

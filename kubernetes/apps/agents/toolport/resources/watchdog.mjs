// toolport session watchdog -- the sidecar behind toolport's liveness probe
// (../helmrelease.yaml). Why it exists: docs/kubernetes/agentboard-mcp.md,
// "toolport never re-initializes".
//
// toolport holds ONE MCP session per backend for the life of its process, and
// when a backend answers `404 Session not found` it treats that as fatal and
// never re-initializes (btsouth/toolport src-tauri/src/downstream.rs: the 404
// becomes TransportError::Fatal, which is not a health failure, so its
// reconnect path is never reached). A ToolHive proxy forgets a session when it
// restarts, and after 2h idle. From then on every call toolport forwards to
// that backend fails until toolport itself restarts.
//
// Every CHECK_INTERVAL this calls one read-only canary tool per backend
// THROUGH toolport, as the profile that owns it, which does two jobs:
//
//   keepalive  a call every 10 minutes means no backend session ever reaches
//              the 2h idle expiry;
//   detection  it finds the two states only a toolport restart fixes --
//     stale    a canary comes back "Session not found";
//     missing  toolport lists the server with 0 tools (it failed while
//              toolport started and is never retried) AND the backend itself
//              now answers.
//
// A backend that is simply DOWN -- equestria's nightly shed takes arr-*, ecm,
// tdarr and teamarr's apps with it -- is neither: a restart cannot fix it, so
// it never fails the check. A canary that answers with a tool-level error
// (bad arguments, a 403 from GitHub) still proves the session is alive.
//
// GET /healthz is what the kubelet probes. It answers 503 for FAIL_WINDOW
// after a check finds stale/missing servers, long enough for the probe's
// failureThreshold, and then no new verdict is issued for COOLDOWN -- so a
// fault a restart does not cure costs at most one restart per COOLDOWN.
//
// Plain node:http + fetch so it runs under Bun in the pod and under Node for
// a local test. No dependencies.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const env = (key, fallback) => process.env[key] ?? fallback;
const seconds = (key, fallback) => Number(env(key, fallback)) * 1000;

const TOOLPORT_URL = env("TOOLPORT_URL", "http://127.0.0.1:8765/mcp");
const REGISTRY_PATH = env("REGISTRY_PATH", "/data/registry.json");
const CANARIES_PATH = env("CANARIES_PATH", "/watchdog/canaries.json");
const PORT = Number(env("PORT", "8766"));
const CHECK_INTERVAL = seconds("CHECK_INTERVAL_SECONDS", "600");
const FIRST_CHECK = seconds("FIRST_CHECK_SECONDS", "180");
const FAIL_WINDOW = seconds("FAIL_WINDOW_SECONDS", "240");
const COOLDOWN = seconds("COOLDOWN_SECONDS", "1800");
const RETRY = seconds("RETRY_SECONDS", "60");
// This probe replaced a tcpSocket one, so it keeps that job too: toolport not
// accepting connections at all for this long is also a restart.
const UNREACHABLE_GRACE = seconds("UNREACHABLE_GRACE_SECONDS", "300");
const CALL_TIMEOUT = seconds("CALL_TIMEOUT_SECONDS", "60");
const UP_TIMEOUT = seconds("UP_TIMEOUT_SECONDS", "10");

// What toolport says when a backend forgot our session. The -32001 body is
// ToolHive's (transparent_proxy.go / streamable_proxy.go); toolport prefixes
// the transport error with "HTTP 404:".
const STALE = /session not found|no valid session|invalid session id|^HTTP 404:/im;
// toolport's answer for a tool it has no route to: the canary name is wrong.
const NO_ROUTE = /no route for tool/i;
// Transport failures a restart would not fix.
const DOWN = /HTTP 5\d\d|ECONNREFUSED|connection (refused|reset|error)|timed? ?out|unavailable|is .* running\?/i;

const log = (event, fields = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let failUntil = 0;
let cooldownUntil = 0;
let unreachableSince = 0;
let cycle = 0;
let last = { verdict: "starting" };

// --- a minimal streamable-HTTP MCP client ----------------------------------

// A response is either plain JSON or an SSE stream; take the last data frame.
function parseMessage(text) {
  const body = text.trim().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim())
        .pop();
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

async function post(url, headers, message, timeout) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    // No HTTP answer at all -- refused, reset, timed out. Tagged so a toolport
    // that is down is told apart from one that answered 401.
    throw Object.assign(new Error(`${url}: ${error.cause?.code ?? error.name}: ${error.message}`), { network: true });
  }
  const text = await response.text();
  return { status: response.status, sessionId: response.headers.get("mcp-session-id"), message: parseMessage(text), text };
}

async function openToolport(token) {
  const auth = { authorization: `Bearer ${token}` };
  const init = await post(
    TOOLPORT_URL,
    auth,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "toolport-watchdog", version: "1" } },
    },
    CALL_TIMEOUT,
  );
  if (init.status !== 200 || !init.message?.result) {
    throw new Error(`initialize answered ${init.status}: ${init.text.slice(0, 200)}`);
  }
  const headers = init.sessionId ? { ...auth, "mcp-session-id": init.sessionId } : auth;
  await post(TOOLPORT_URL, headers, { jsonrpc: "2.0", method: "notifications/initialized" }, CALL_TIMEOUT);
  let id = 1;
  return {
    async tool(name, args) {
      const reply = await post(TOOLPORT_URL, headers, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, CALL_TIMEOUT);
      if (reply.message?.error) return { error: true, text: reply.message.error.message ?? JSON.stringify(reply.message.error) };
      const content = reply.message?.result?.content ?? [];
      const text = content.map(part => part.text ?? "").join("\n") || reply.text;
      return { error: reply.status !== 200 || reply.message?.result?.isError === true, text };
    },
    async close() {
      if (!init.sessionId) return;
      await fetch(TOOLPORT_URL, { method: "DELETE", headers, signal: AbortSignal.timeout(5000) }).catch(() => {});
    },
  };
}

// Any HTTP answer below 500 -- a 401 included -- means the backend is up.
async function backendUp(url) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "toolport-watchdog-probe", version: "1" } },
      }),
      signal: AbortSignal.timeout(UP_TIMEOUT),
    });
    await response.body?.cancel();
    return response.status < 500;
  } catch {
    return false;
  }
}

// toolport_status lists servers that are "Enabled but exposing 0 tools" by
// display name, one "- Name" line each, under that heading.
function zeroToolServers(statusText) {
  const names = new Set();
  let inSection = false;
  for (const line of statusText.split("\n")) {
    if (/exposing 0 tools/i.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (match) names.add(match[1].replace(/\s+\[.*$/, ""));
    else if (line.trim()) inSection = false;
  }
  return names;
}

// --- one check -------------------------------------------------------------

async function checkProfile(profile, servers, canaries, result) {
  const token = process.env[`TOKEN_${profile.id.toUpperCase()}`];
  if (!token) {
    result.warnings.push(`no TOKEN_${profile.id.toUpperCase()} for profile ${profile.id}`);
    return false;
  }
  let toolport;
  try {
    toolport = await openToolport(token);
  } catch (error) {
    result.warnings.push(`profile ${profile.id}: ${error.message}`);
    // An HTTP refusal (a bad token, say) still proves toolport is listening.
    return !error.network;
  }
  try {
    const status = await toolport.tool("toolport_status", {});
    const zero = zeroToolServers(status.text);
    for (const id of profile.enabledServerIds) {
      const server = servers.get(id) ?? { id };
      if (zero.has(server.name ?? id)) {
        if (server.url && (await backendUp(server.url))) result.missing.push(id);
        else result.down.push(id);
        continue;
      }
      const canary = canaries[id];
      if (!canary) {
        result.warnings.push(`no canary for ${id}`);
        continue;
      }
      if (canary.everyChecks > 1 && (cycle - 1) % canary.everyChecks !== 0) {
        result.skipped.push(id);
        continue;
      }
      const reply = await toolport.tool("toolport_call_tool", { name: canary.tool, arguments: canary.args ?? {} });
      if (!reply.error) result.ok.push(id);
      else if (STALE.test(reply.text)) result.stale.push(id);
      else if (NO_ROUTE.test(reply.text)) result.warnings.push(`canary ${canary.tool} for ${id} has no route -- fix watchdog-canaries.json`);
      else if (DOWN.test(reply.text)) result.down.push(id);
      // The backend answered, if only with a tool error: the session is alive.
      else result.ok.push(id);
    }
    return true;
  } finally {
    await toolport.close();
  }
}

async function check() {
  cycle += 1;
  const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
  const canaries = JSON.parse(await readFile(CANARIES_PATH, "utf8"));
  const servers = new Map(registry.servers.map(server => [server.id, server]));
  const result = { stale: [], missing: [], down: [], ok: [], skipped: [], warnings: [] };
  const reached = await Promise.all(registry.profiles.map(profile => checkProfile(profile, servers, canaries, result)));
  result.toolportReachable = reached.some(Boolean);
  return result;
}

async function loop() {
  let delay = FIRST_CHECK;
  for (;;) {
    await sleep(delay);
    let result;
    try {
      result = await check();
    } catch (error) {
      log("check-error", { error: String(error) });
      delay = RETRY;
      continue;
    }
    if (!result.toolportReachable) {
      // Usually a restart in progress; only a long outage is ours to act on.
      unreachableSince ||= Date.now();
      const down = Date.now() - unreachableSince;
      let verdict = "toolport-unreachable";
      if (down > UNREACHABLE_GRACE && Date.now() >= cooldownUntil) {
        verdict = "restart";
        failUntil = Date.now() + FAIL_WINDOW;
        cooldownUntil = Date.now() + COOLDOWN;
      }
      last = { verdict, unreachableSeconds: Math.round(down / 1000), checkedAt: new Date().toISOString(), ...result };
      log("check", last);
      delay = verdict === "restart" ? FAIL_WINDOW + FIRST_CHECK : RETRY;
      continue;
    }
    unreachableSince = 0;
    const broken = [...result.stale, ...result.missing];
    let verdict = "healthy";
    if (broken.length > 0) {
      if (Date.now() < cooldownUntil) {
        verdict = "restart-suppressed-cooldown";
      } else {
        verdict = "restart";
        failUntil = Date.now() + FAIL_WINDOW;
        cooldownUntil = Date.now() + COOLDOWN;
      }
    }
    last = { verdict, checkedAt: new Date().toISOString(), ...result };
    log("check", last);
    delay = verdict === "restart" ? FAIL_WINDOW + FIRST_CHECK : CHECK_INTERVAL;
  }
}

createServer((request, response) => {
  const failing = Date.now() < failUntil;
  const status = request.url === "/healthz" && failing ? 503 : 200;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ failing, ...last }));
}).listen(PORT, () => log("listening", { port: PORT, toolport: TOOLPORT_URL, checkIntervalSeconds: CHECK_INTERVAL / 1000 }));

loop();

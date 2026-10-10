// forgejo-github-sync: turns "Flux saw a new commit on GitHub" into "run the
// sync workflow on Forgejo".
//
// Flux already hears about every push to GitHub's main: GitHub's webhook hits
// the `github-webhook` Receiver (kubernetes/apps/flux-system/flux-instance),
// source-controller fetches, and a `NewArtifact` event comes out the other
// end. ./notification.yaml forwards that event here. This is the one hop Flux
// cannot make itself -- its `generic` provider POSTs a fixed Event body, and
// Forgejo's workflow dispatch wants `{"ref": "..."}` -- so this reads the
// event and makes the call:
//
//   POST /flux     a Flux Event; a GitRepository `NewArtifact` dispatches
//                  .forgejo/workflows/github-sync.yml, anything else is ignored
//   GET  /healthz  probes
//
// The workflow does the actual syncing and is safe to run at any time, so this
// carries no state and deduplicates nothing. A missed event is caught by the
// workflow's own hourly schedule.
//
// Nothing authenticates the caller. ./ciliumnetworkpolicy.yaml makes Flux's
// notification-controller the only pod that can reach the port, and the worst
// a forged request could do is start a sync early.
//
// Plain Bun, no dependencies: mounted from a ConfigMap and run by the stock
// oven/bun image (./helmrelease.yaml), the same shape as ../setup-status.

const env = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const PORT = Number(process.env.PORT ?? 8080);
const FORGEJO_URL = env("FORGEJO_URL").replace(/\/$/, "");
// owner/name of the mirror on Forgejo, written to OpenBao by stacks/system.
const FORGEJO_REPOSITORY = env("FORGEJO_REPOSITORY");
const FORGEJO_TOKEN = env("FORGEJO_TOKEN");
const WORKFLOW = process.env.FORGEJO_WORKFLOW ?? "github-sync.yml";
const REF = process.env.FORGEJO_REF ?? "main";

const DISPATCH_URL = `${FORGEJO_URL}/api/v1/repos/${FORGEJO_REPOSITORY}/actions/workflows/${encodeURIComponent(WORKFLOW)}/dispatches`;

const log = (message, fields = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), message, ...fields }));

// Forgejo answers 204 with no body. The status is returned and never the body:
// an error page is not something to hand back to the caller.
async function dispatch() {
  const response = await fetch(DISPATCH_URL, {
    method: "POST",
    headers: { Authorization: `token ${FORGEJO_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: REF }),
    signal: AbortSignal.timeout(15_000),
  });
  return response.status;
}

async function flux(request) {
  let event;
  try {
    event = await request.json();
  } catch {
    return new Response("not JSON\n", { status: 400 });
  }

  const kind = event?.involvedObject?.kind;
  const reason = event?.reason;
  // source-controller also reports failed fetches and garbage collection on the
  // same object. Only a new artifact means main moved.
  if (kind !== "GitRepository" || reason !== "NewArtifact") {
    log("ignored", { kind, reason });
    return new Response("ignored\n", { status: 200 });
  }

  const revision = event?.metadata?.revision;
  let status;
  try {
    status = await dispatch();
  } catch (error) {
    log("dispatch failed", { revision, error: String(error) });
    // Not 2xx on purpose: notification-controller retries a failed delivery.
    return new Response("forgejo unreachable\n", { status: 502 });
  }
  if (status < 200 || status >= 300) {
    // 404 is the usual one: the repository or the workflow file is not there
    // yet, or the token has lost access to it.
    log("dispatch refused", { revision, status });
    return new Response(`forgejo answered ${status}\n`, { status: 502 });
  }
  log("dispatched", { revision, workflow: WORKFLOW, ref: REF });
  return new Response("dispatched\n", { status: 202 });
}

Bun.serve({
  port: PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/healthz") return new Response("ok\n");
    if (request.method === "POST" && pathname === "/flux") return flux(request);
    return new Response("not found\n", { status: 404 });
  },
});

log("listening", { port: PORT, repository: FORGEJO_REPOSITORY, workflow: WORKFLOW, ref: REF });

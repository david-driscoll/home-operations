// setup-status: the API behind the family setup guide's "My apps" page, the
// guide's landing page (https://setup.<root domain>/setup/, from Forgejo
// docs/setup).
//
// It answers one question for whoever is looking: which home apps have you
// already signed in to (so your account exists), and is the fiddly part of
// each one set up? It only ever reports on, or acts for, the visitor.
//
//   GET  /setup/api/me              JSON, see `me()` below
//   GET  /setup/api/login           302 back to the page; reached by a top-level
//                                   navigation so forward auth can run the sign-in
//   POST /setup/api/music/password  make the visitor a new Navidrome password,
//                                   see `musicPassword()` below
//   GET  /healthz                   probes (direct to the pod, not through the route)
//
// WHO the visitor is comes from authentik forward auth: the route's
// `setup-status-auth` middleware runs the outpost, which overwrites the
// X-authentik-* headers. ./ciliumnetworkpolicy.yaml makes Traefik the only
// way in, so they cannot be forged.
//
// WHAT they have done comes from:
//   - authentik (superuser token): `authorize_application` events, i.e. every
//     SSO sign-in to an app, plus check_access for "you can't use this yet".
//   - Jellyfin (admin API key): its accounts are local, not SSO.
//   - Seerr (its API key): Movie & TV requests sign in with the Jellyfin login,
//     not authentik, so Seerr itself says whether the visitor has an account.
//   - SuperSync's database: whether the visitor has a sync token and which of
//     their devices have synced (the Tasks page's Super Productivity).
//   - Nextcloud's database: oc_authtoken, which names each connected device
//     (phone app, calendar app password, DAVx5, desktop client).
//   - Tailscale's API: the visitor's devices on the tailnet.
//   - Navidrome's native API: the account, and which music apps have played.
// Each source fails on its own; the page shows "couldn't check" for that app.
//
// The one thing it writes is the music password: Navidrome's Subsonic apps
// need a password of their own, which used to mean typing one into Navidrome's
// settings and messaging David when it was forgotten. Instead this sets a
// generated one (as the Navidrome admin) and keeps it in the visitor's
// authentik attributes, so the guide can show it again whenever they need it.
//
// Plain Bun, no dependencies: it is mounted from a ConfigMap and run by the
// stock oven/bun image (./helmrelease.yaml).

import { readFileSync } from "node:fs";
import { SQL } from "bun";

const env = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const PORT = Number(process.env.PORT ?? 8080);
const ROOT_DOMAIN = env("ROOT_DOMAIN");
const AUTHENTIK_URL = env("AUTHENTIK_URL").replace(/\/$/, "");
const AUTHENTIK_TOKEN = env("AUTHENTIK_TOKEN");
const JELLYFIN_URL = env("JELLYFIN_URL").replace(/\/$/, "");
const JELLYFIN_TOKEN = env("JELLYFIN_TOKEN");
const SEERR_URL = env("SEERR_URL").replace(/\/$/, "");
const SEERR_TOKEN = env("SEERR_TOKEN");
// A file, not an env var: the token is re-minted every few minutes and the
// kubelet refreshes the mounted Secret in place, with no restart.
const TAILSCALE_API_KEY_FILE = env("TAILSCALE_API_KEY_FILE");
const TAILSCALE_API_URL = (process.env.TAILSCALE_API_URL ?? "https://api.tailscale.com").replace(/\/$/, "");
const NAVIDROME_URL = env("NAVIDROME_URL").replace(/\/$/, "");
// Optional. Unset, the admin is found among authentik's `admins` group.
const NAVIDROME_ADMIN_USERNAME = process.env.NAVIDROME_ADMIN_USERNAME ?? "";
// Where the generated music password is kept, in the authentik user's attributes.
const ATTRIBUTES_KEY = "setup_guide";
// The only page allowed to POST (see `fetch` at the bottom).
const SETUP_ORIGIN = `https://setup.${ROOT_DOMAIN}`;

// The guide pages (slugs) whose app signs in through authentik, keyed by the
// host of the authentik application's launch URL. authentik slugs are random
// (stacks/system), so the launch URL is the stable way to find each one.
const AUTHENTIK_APPS = {
  photos: `photos.${ROOT_DOMAIN}`,
  cloud: `cloud.${ROOT_DOMAIN}`,
  recipes: `mealie.${ROOT_DOMAIN}`,
  music: `navidrome.${ROOT_DOMAIN}`,
  podcasts: `pinepods.${ROOT_DOMAIN}`,
  news: `freshrss.${ROOT_DOMAIN}`,
  games: `romm.${ROOT_DOMAIN}`,
  home: `home.${ROOT_DOMAIN}`,
  location: `dawarich.${ROOT_DOMAIN}`,
  wiki: `outline.${ROOT_DOMAIN}`,
  tasks: `super-productivity.${ROOT_DOMAIN}`,
  // Not a page of its own: the Tasks page's sync password comes from here.
  supersync: `supersync.${ROOT_DOMAIN}`,
  "request-music": `aurral.${ROOT_DOMAIN}`,
};

// --- small helpers -----------------------------------------------------------

const log = (msg, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** Memoizes `fn` for `ttlMs`; a rejected promise is not kept. */
function cached(ttlMs, fn) {
  const entries = new Map();
  return (key, ...args) => {
    const hit = entries.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = fn(key, ...args);
    entries.set(key, { value, expires: Date.now() + ttlMs });
    value.catch(() => entries.delete(key));
    return value;
  };
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${new URL(url).pathname} answered ${res.status}`);
  return res.json();
}

/** Runs `fn`; on failure logs it and returns `undefined`, so one source never sinks the answer. */
async function attempt(source, fn) {
  try {
    return await fn();
  } catch (err) {
    log("source failed", { source, error: String(err?.message ?? err) });
    return undefined;
  }
}

// --- authentik ---------------------------------------------------------------

const authentik = path => getJson(`${AUTHENTIK_URL}/api/v3${path}`, { authorization: `Bearer ${AUTHENTIK_TOKEN}`, accept: "application/json" });

/** guide slug -> authentik application, from the launch URLs. */
const authentikApps = cached(10 * 60_000, async () => {
  const { results } = await authentik("/core/applications/?superuser_full_list=true&page_size=500");
  const bySlug = {};
  for (const [slug, host] of Object.entries(AUTHENTIK_APPS)) {
    const app = results.find(a => {
      try {
        return new URL(a.meta_launch_url || a.launch_url).host === host;
      } catch {
        return false;
      }
    });
    if (app) bySlug[slug] = app;
  }
  return bySlug;
});

/** The authentik user, or null unless it matches the uid the outpost vouched for. */
async function authentikUser(username, uid) {
  const { results } = await authentik(`/core/users/?username=${encodeURIComponent(username)}`);
  const user = results.find(u => u.username === username);
  return user && user.uid === uid ? user : null;
}

/** Merges `values` into the user's ATTRIBUTES_KEY attributes. A PATCH replaces the whole attributes object, hence the merge. */
async function saveAttributes(user, values) {
  const attributes = { ...user.attributes, [ATTRIBUTES_KEY]: { ...user.attributes?.[ATTRIBUTES_KEY], ...values } };
  const res = await fetch(`${AUTHENTIK_URL}/api/v3/core/users/${user.pk}/`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${AUTHENTIK_TOKEN}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ attributes }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`saving attributes answered ${res.status}`);
}

/**
 * The visitor's newest sign-in to `app`, from authorize_application events,
 * or null. One query per app, filtered to it: walking the visitor's whole
 * history newest-first does not work, because authentik caps a page at 100
 * events and someone who uses many apps (David: 2,000+ events across ~25 apps)
 * can go weeks between sign-ins to any one of them.
 */
async function lastSignIn(username, app) {
  // Events keep the application pk WITHOUT dashes, and context_authorized_app
  // only matches that form (the dashed one finds nothing).
  const pk = String(app.pk).replaceAll("-", "");
  const { results } = await authentik(`/events/events/?action=authorize_application&username=${encodeURIComponent(username)}&context_authorized_app=${pk}&ordering=-created&page_size=1`);
  return results[0]?.created ?? null;
}

/** Whether policy lets the user into `app` (e.g. not in the family group yet). */
const canAccess = cached(5 * 60_000, async (_key, appSlug, userPk) => {
  const { passing } = await authentik(`/core/applications/${encodeURIComponent(appSlug)}/check_access/?for_user=${userPk}`);
  return Boolean(passing);
});

// --- Jellyfin ----------------------------------------------------------------

const jellyfinUsers = cached(60_000, () => getJson(`${JELLYFIN_URL}/Users`, { authorization: `MediaBrowser Token="${JELLYFIN_TOKEN}"` }));

/** Jellyfin accounts are made by hand, so match the likely names. */
async function jellyfinAccount({ username, email, name }) {
  const users = await jellyfinUsers("all");
  const candidates = new Set([username, email?.split("@")[0], name?.split(/\s+/)[0]].filter(Boolean).map(s => s.toLowerCase()));
  const account = users.find(u => candidates.has(String(u.Name).toLowerCase()));
  if (!account) return { account: false };
  return { account: true, id: account.Id, lastSignIn: account.LastLoginDate ?? account.LastActivityDate ?? null };
}

// --- Seerr ---------------------------------------------------------------------
//
// Movie & TV requests. Seerr signs people in with their Jellyfin login and
// makes their Seerr account the first time they do, so the question is whether
// a Seerr user exists for their Jellyfin account: an exact lookup by Jellyfin
// user id. The API key acts as Seerr's admin, so this only ever GETs.

async function seerrAccount(jellyfinId) {
  const res = await fetch(`${SEERR_URL}/api/v1/user/jellyfin/${encodeURIComponent(jellyfinId)}`, {
    headers: { "x-api-key": SEERR_TOKEN, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return { account: false };
  if (!res.ok) throw new Error(`seerr answered ${res.status}`);
  const user = await res.json();
  return { account: true, requests: user.requestCount ?? 0 };
}

// --- Nextcloud -----------------------------------------------------------------

let nextcloudDb;
const nextcloud = () =>
  (nextcloudDb ??= new SQL({
    hostname: env("NEXTCLOUD_DB_HOST"),
    port: Number(process.env.NEXTCLOUD_DB_PORT ?? 5432),
    database: env("NEXTCLOUD_DB_NAME"),
    username: env("NEXTCLOUD_DB_USER"),
    password: env("NEXTCLOUD_DB_PASSWORD"),
    max: 2,
    idleTimeout: 60,
    connectionTimeout: 5,
  }));

// What each connected device is, from the name Nextcloud gave its token: Login
// Flow clients are named after their User-Agent; app passwords made by hand
// get whatever the person typed; the guide's "Make my app password" button is
// named "Calendar & Contacts" by the cloud.<root domain> route.
const DEVICE_KINDS = [
  ["phoneApp", /nextcloud-(ios|android)/i],
  ["calendar", /calendar|contacts|davx|caldav|carddav/i],
  ["desktop", /mirall|desktop client/i],
];

/** kind -> newest use, for the visitor's connected devices. Browser sessions are left out. */
async function nextcloudDevices(uid) {
  const rows = await nextcloud()`SELECT name, last_activity FROM oc_authtoken WHERE uid = ${uid}`;
  const devices = {};
  for (const row of rows) {
    const kind = DEVICE_KINDS.find(([, re]) => re.test(row.name))?.[0];
    if (!kind) continue;
    const lastUsed = new Date(Number(row.last_activity) * 1000).toISOString();
    if (!devices[kind] || devices[kind] < lastUsed) devices[kind] = lastUsed;
  }
  return devices;
}

// --- Navidrome -------------------------------------------------------------------
//
// Navidrome logs in whoever its ExtAuth header names, when the request comes
// from its trusted sources (the pod CIDR). That is how Traefik signs people in
// after the outpost, and how this server acts: as the visitor to read their
// own players, and as the Navidrome admin to set a password -- only an admin
// can set someone else's without knowing the current one (validatePasswordChange
// in navidrome's persistence/user_repository.go). Navidrome's
// ciliumnetworkpolicy.yaml admits this pod for exactly that.

function navidrome(path, asUser, init = {}) {
  return fetch(`${NAVIDROME_URL}${path}`, {
    ...init,
    headers: { "x-authentik-username": asUser, accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
}

async function navidromeJson(path, asUser, init) {
  const res = await navidrome(path, asUser, init);
  if (!res.ok) throw new Error(`navidrome ${init?.method ?? "GET"} ${path} answered ${res.status}`);
  return res.json();
}

/** The Navidrome admin's username: NAVIDROME_ADMIN_USERNAME, else whichever of authentik's `admins` Navidrome accepts as one. */
const navidromeAdmin = cached(60 * 60_000, async () => {
  const candidates = NAVIDROME_ADMIN_USERNAME ? [NAVIDROME_ADMIN_USERNAME] : (await authentik("/core/users/?groups_by_name=admins&page_size=50")).results.map(u => u.username);
  for (const name of candidates) {
    // The user list is admin-only: 200 for the admin, 403 for anyone else.
    if ((await navidrome("/api/user?_end=1", name)).ok) return name;
  }
  throw new Error("no Navidrome admin found among authentik admins");
});

async function navidromeUser(username) {
  const users = await navidromeJson("/api/user", await navidromeAdmin("admin"));
  return users.find(u => String(u.userName).toLowerCase() === username.toLowerCase()) ?? null;
}

/** The visitor's account, and the music apps (not the web player) that have played as them. */
async function navidromeStatus(username) {
  const user = await navidromeUser(username);
  if (!user) return { account: false, apps: [] };
  const players = await navidromeJson("/api/player", username);
  const apps = {};
  for (const p of players) {
    if (p.client === "NavidromeUI" || !p.client) continue;
    if (!apps[p.client] || apps[p.client] < p.lastSeen) apps[p.client] = p.lastSeen;
  }
  return {
    account: true,
    lastSignIn: user.lastLoginAt ?? null,
    apps: Object.entries(apps).map(([client, lastSeen]) => ({ client, lastSeen })),
  };
}

// No 0/O, 1/l/I: it may be read off one screen and typed into another.
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** e.g. "k7mq-3xpa-9ftw-h2rn": 16 characters, about 80 bits. */
function newPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map(b => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
  return chars.match(/.{4}/g).join("-");
}

/**
 * Gives the visitor a new music password: creates their Navidrome account if
 * they have never opened Navidrome (the same thing its web UI does on first
 * sight), sets the password as the admin, and keeps it in authentik for the
 * guide to show again. The old password stops working in their music app.
 */
async function musicPassword(visitor) {
  const user = await authentikUser(visitor.username, visitor.uid);
  if (!user) return json({ error: "unknown user" }, 403);
  const admin = await navidromeAdmin("admin");
  // The admin's own password can't be set this way without the current one.
  if (admin.toLowerCase() === visitor.username.toLowerCase()) return json({ error: "admin", message: "You're the Navidrome admin: change your password in Navidrome itself." }, 409);

  let account = await navidromeUser(visitor.username);
  if (!account) {
    // Navidrome's index page creates an ExtAuth user it hasn't seen (handleLoginFromHeaders).
    await navidrome("/app/", visitor.username, { headers: { accept: "text/html" } });
    account = await navidromeUser(visitor.username);
    if (!account) throw new Error("navidrome did not create the account");
  }

  // A PUT writes every column, so send the whole record back with the password.
  const full = await navidromeJson(`/api/user/${account.id}`, admin);
  const password = newPassword();
  await navidromeJson(`/api/user/${account.id}`, admin, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...full, password }),
  });

  // Set in Navidrome already, so a failure here still hands it over, just unsaved.
  const saved = await attempt("authentik attributes", async () => {
    await saveAttributes(user, { navidrome_password: password, navidrome_password_set: new Date().toISOString() });
    return true;
  });
  log("music password set", { username: visitor.username, saved: Boolean(saved) });
  return json({ username: account.userName, password, saved: Boolean(saved) });
}

// --- SuperSync ------------------------------------------------------------------
//
// Super Productivity's sync server. Its token page (behind authentik) makes a
// `users` row, keyed by the lowercased authentik email, the first time someone
// asks for a token; every app install that syncs gets a `sync_devices` row,
// refreshed as it syncs. Table and column names: the server's Prisma schema
// (packages/super-sync-server/prisma/schema.prisma upstream).

let superSyncDb;
const superSync = () =>
  (superSyncDb ??= new SQL({
    hostname: env("SUPERSYNC_DB_HOST"),
    port: Number(process.env.SUPERSYNC_DB_PORT ?? 5432),
    database: env("SUPERSYNC_DB_NAME"),
    username: env("SUPERSYNC_DB_USER"),
    password: env("SUPERSYNC_DB_PASSWORD"),
    max: 2,
    idleTimeout: 60,
    connectionTimeout: 5,
  }));

// The first letter of a client id says what kind of install it is (the app's
// own "Connected Devices" list reads it the same way).
const SYNC_CLIENT_KINDS = { E: "computer", A: "android", I: "iphone", B: "browser" };

/** Whether they have a sync token, and kind -> newest sync for each kind of device. */
async function superSyncStatus(email) {
  if (!email) return { token: false, devices: {} };
  const rows = await superSync()`
    SELECT d.client_id, d.last_seen_at
    FROM users u LEFT JOIN sync_devices d ON d.user_id = u.id
    WHERE u.email = ${email.toLowerCase()}`;
  const devices = {};
  for (const row of rows) {
    if (!row.client_id) continue;
    const kind = SYNC_CLIENT_KINDS[String(row.client_id)[0]] ?? "other";
    const lastSeen = new Date(Number(row.last_seen_at)).toISOString();
    if (!devices[kind] || devices[kind] < lastSeen) devices[kind] = lastSeen;
  }
  return { token: rows.length > 0, devices };
}

// --- Tailscale -----------------------------------------------------------------

const tailnetDevices = cached(60_000, async () => {
  const key = readFileSync(TAILSCALE_API_KEY_FILE, "utf8").trim();
  const { devices } = await getJson(`${TAILSCALE_API_URL}/api/v2/tailnet/-/devices?fields=all`, { authorization: `Bearer ${key}` });
  return devices;
});

const ONLINE_MS = 5 * 60_000;

async function tailscaleDevices(email) {
  if (!email) return [];
  const devices = await tailnetDevices("all");
  return devices
    .filter(d => String(d.user).toLowerCase() === email.toLowerCase())
    .map(d => ({
      name: d.hostname || d.name?.split(".")[0],
      os: d.os,
      online: d.connectedToControl ?? Date.now() - Date.parse(d.lastSeen) < ONLINE_MS,
      lastSeen: d.lastSeen ?? null,
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
}

/** True when this request came over the tailnet (100.64.0.0/10); null when we can't tell. */
function viaTailscale(req) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const m = ip.match(/^100\.(\d+)\./);
  return m && Number(m[1]) >= 64 && Number(m[1]) <= 127 ? true : null;
}

// --- the answer ----------------------------------------------------------------

/** Who the outpost says is asking, from the X-authentik-* headers it sets. */
function visitorFrom(req) {
  const h = name => req.headers.get(`x-authentik-${name}`) ?? "";
  if (!h("username")) return null;
  return { username: h("username"), uid: h("uid"), email: h("email"), name: h("name"), groups: h("groups").split("|").filter(Boolean) };
}

async function me(req, visitor) {
  const { username } = visitor;
  const user = await authentikUser(username, visitor.uid);
  if (!user) return json({ error: "unknown user" }, 403);
  const [apps, jellyfin, devices, tailnet, music, sync] = await Promise.all([
    attempt("authentik apps", () => authentikApps("all")),
    attempt("jellyfin", () => jellyfinAccount(visitor)),
    attempt("nextcloud", () => nextcloudDevices(username)),
    attempt("tailscale", () => tailscaleDevices(visitor.email)),
    attempt("navidrome", () => navidromeStatus(username)),
    attempt("supersync", () => superSyncStatus(visitor.email)),
  ]);
  // Seerr is looked up by Jellyfin account, so it waits for that one.
  const seerr = jellyfin?.id ? await attempt("seerr", () => seerrAccount(jellyfin.id)) : undefined;

  const result = {
    user: { name: visitor.name || username, username, family: visitor.groups.includes("family") },
    apps: {},
  };

  await Promise.all(
    Object.keys(AUTHENTIK_APPS).map(async slug => {
      const app = apps?.[slug];
      const signedIn = app ? await attempt("authentik events", () => lastSignIn(username, app)) : undefined;
      if (signedIn === undefined) {
        result.apps[slug] = { checked: false };
        return;
      }
      // Only worth asking when they haven't got in: it explains why.
      const access = signedIn ? true : await attempt("authentik access", () => canAccess(`${app.slug}:${user.pk}`, app.slug, user.pk));
      result.apps[slug] = { checked: true, lastSignIn: signedIn, access: access ?? null };
    }),
  );

  result.apps["movies-tv"] = jellyfin ? { checked: true, account: jellyfin.account, lastSignIn: jellyfin.lastSignIn ?? null } : { checked: false };
  // Requests need the Movies & TV login first: say so rather than "not set up".
  result.apps["request-movies"] = !jellyfin ? { checked: false } : !jellyfin.account ? { checked: true, jellyfin: false, account: false } : seerr ? { checked: true, jellyfin: true, ...seerr } : { checked: false };
  // Tasks: the app's sync matters, not the web app's sign-in, so SuperSync's
  // view rides along (null when it couldn't be checked).
  if (result.apps.tasks) result.apps.tasks.sync = sync ?? null;
  if (result.apps.cloud.checked) result.apps.cloud.devices = devices ?? null;
  // Music: Navidrome's own view beats authentik's (it also sees the apps), and
  // the stored password is shown back to its owner.
  result.apps.music = {
    ...result.apps.music,
    checked: Boolean(result.apps.music.checked || music),
    navidrome: music ?? null,
    lastSignIn: result.apps.music.lastSignIn ?? music?.lastSignIn ?? null,
    password: user.attributes?.[ATTRIBUTES_KEY]?.navidrome_password ?? null,
  };
  result.apps.tailscale = { checked: tailnet !== undefined, devices: tailnet ?? [], viaTailscale: viaTailscale(req) };
  return json(result);
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname, searchParams } = new URL(req.url);
    if (pathname === "/setup/api/music/password" && req.method === "POST") {
      // Only the guide's own page may ask: a cross-site form can't reset someone's password.
      if (req.headers.get("origin") !== SETUP_ORIGIN) return json({ error: "forbidden" }, 403);
      const visitor = visitorFrom(req);
      if (!visitor) return json({ error: "not signed in" }, 401);
      try {
        return await musicPassword(visitor);
      } catch (err) {
        log("music password failed", { username: visitor.username, error: String(err?.message ?? err) });
        return json({ error: "music password unavailable" }, 502);
      }
    }
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (pathname === "/healthz") return new Response("ok");
    if (pathname === "/setup/api/login") {
      // Only back into the guide: never an open redirect.
      const next = searchParams.get("next") ?? "";
      const target = /^\/setup\/[\w/-]*$/.test(next) ? next : "/setup/";
      return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
    }
    if (pathname === "/setup/api/me") {
      const visitor = visitorFrom(req);
      if (!visitor) return json({ error: "not signed in" }, 401);
      try {
        return await me(req, visitor);
      } catch (err) {
        log("me failed", { error: String(err?.message ?? err) });
        return json({ error: "status unavailable" }, 502);
      }
    }
    return json({ error: "not found" }, 404);
  },
});

log("listening", { port: PORT });

// ghcr release dates for Renovate: one image's tags, each with the day it was
// pushed and its digest.
//
// Renovate's `docker` datasource reads a release date from Docker Hub only.
// For ghcr.io it returns none, so `minimumReleaseAge` has nothing to count and
// (with `timestamp-optional`) lets the update straight through. GitHub does
// have the answer, in the Packages API rather than in the registry: every
// pushed image is a "package version" carrying its tags, its digest and
// `created_at`.
//
//   GET /ghcr/<owner>/<image>   ->   {"releases": [{version, releaseTimestamp,
//                                     digest}, ...], "sourceUrl": "..."}
//
// which is the shape Renovate's custom datasource wants as it stands -- no
// transform on its side. `customDatasources.ghcr` in .github/renovate.json5
// points here, and the digest is what lets a `tag@sha256:...` pin keep its
// digest through a datasource that is not `docker`.
//
// Why a service and not the API called from Renovate directly: a custom
// datasource reads ONE page. The API answers newest first, 100 a page, and a
// repository that pushes a tag per commit (`sha-...`, `cache-...`) buries a
// week-old release several pages down. This pages, and throws the noise away.
//
// No dependencies, and nothing Bun-specific: only `fetch` and `Response`, so
// the same file runs under Node in a test.

const API = "https://api.github.com";
const PER_PAGE = 100;
// How far back to read. Renovate needs the versions NEWER than the pin, with
// their dates; it does not need the pin itself to be in the list. So this
// stops at whichever comes first: pushes older than MAX_AGE_DAYS, or MAX_PAGES
// pages. A quiet image is one or two pages. A busy one is deep: on 2026-10-13
// immich-server's newest 2000 pushes reached back eleven days, five version
// tags among them.
const MAX_AGE_MS = Number(process.env.GHCR_MAX_AGE_DAYS ?? 90) * 86_400_000;
const MAX_PAGES = Number(process.env.GHCR_MAX_PAGES ?? 50);
const WAVE = 10;
// Renovate asks once per dependency per run, the same image is often pinned
// in several files, and runs come more than once an hour. An hour, because the
// token's budget is shared with Renovate itself: measured on 2026-10-13, one
// uncached pass over the 84 images this estate pins cost 1,351 API calls of
// the 12,500 an hour the token has. A date that is an hour late does not
// matter to a wait counted in days.
const CACHE_MS = Number(process.env.GHCR_CACHE_SECONDS ?? 3600) * 1000;

// A tag that names a version: `1.2.3`, `v1.2`, `2026.10.1-alpine`, `5`.
// Not a commit (`sha-...`, or bare hex with no dot), a build cache, a branch
// or `latest`/`stable` -- those move, and Renovate follows them by digest
// through the `docker` datasource as before.
const VERSION_TAG = /^v?\d+(\.\d+)*([-+.][0-9A-Za-z][0-9A-Za-z.+-]*)?$/;
const BARE_HEX = /^[0-9a-f]{7,64}$/;
const isVersionTag = tag => VERSION_TAG.test(tag) && !(BARE_HEX.test(tag) && !/^\d{1,6}$/.test(tag));

// GitHub's names: an owner is letters, digits and hyphens; an image is path
// segments of lowercase letters, digits, `.`, `_` and `-`.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const IMAGE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;

const cache = new Map();

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function github(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "forgejo-github-sync",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

async function lookup(owner, image, token) {
  // `/users/` answers for organizations too.
  const base = `/users/${owner}/packages/container/${encodeURIComponent(image)}`;
  const releases = [];
  const seen = new Set();
  let pages = 0;
  const cutoff = Date.now() - MAX_AGE_MS;
  // In waves, not one page at a time: twenty pages in a row took twelve
  // seconds, and the caller is waiting.
  waves: for (let first = 1; first <= MAX_PAGES; first += WAVE) {
    const numbers = Array.from({ length: Math.min(WAVE, MAX_PAGES - first + 1) }, (_, i) => first + i);
    const answers = await Promise.all(numbers.map(page => github(`${base}/versions?per_page=${PER_PAGE}&page=${page}`, token)));
    for (const { status, body } of answers) {
      if (status !== 200) return { status, pages };
      pages++;
      for (const version of body) {
        for (const tag of version.metadata?.container?.tags ?? []) {
          // Newest first, so the first sight of a tag is where it points now.
          if (seen.has(tag) || !isVersionTag(tag)) continue;
          seen.add(tag);
          releases.push({ version: tag, releaseTimestamp: version.created_at, digest: version.name });
        }
      }
      if (body.length < PER_PAGE) break waves;
      const oldest = body[body.length - 1]?.created_at;
      if (oldest && Date.parse(oldest) < cutoff) break waves;
    }
  }
  // The repository the image is built from, for the changelog in the pull
  // request -- what the `docker` datasource would have read from a label.
  const pkg = await github(base, token);
  const sourceUrl = pkg.status === 200 ? pkg.body?.repository?.html_url : undefined;
  return { status: 200, pages, result: { releases, ...(sourceUrl ? { sourceUrl } : {}) } };
}

// `path` is what follows `/ghcr/`. `readToken` is called per lookup: the
// token is an hourly GitHub App one, re-read from its mounted file each time.
export async function ghcr(path, readToken, log = () => {}) {
  const slash = path.indexOf("/");
  const owner = slash > 0 ? path.slice(0, slash) : "";
  const image = slash > 0 ? path.slice(slash + 1) : "";
  if (!OWNER.test(owner) || !IMAGE.test(image)) return json({ error: "expected /ghcr/<owner>/<image>" }, 400);

  const key = `${owner}/${image}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.result);

  let found;
  try {
    found = await lookup(owner, image, await readToken());
  } catch (error) {
    log("ghcr lookup failed", { image: key, error: String(error) });
    return json({ error: "github unreachable" }, 502);
  }
  if (found.status !== 200) {
    // 404: no such image, or it is private to someone else. 401/403: the
    // token. Passed on as it is, so Renovate reports a failed lookup for this
    // one dependency rather than "no updates".
    log("ghcr lookup refused", { image: key, status: found.status });
    return json({ error: `github answered ${found.status}` }, found.status === 404 ? 404 : 502);
  }
  cache.set(key, { at: Date.now(), result: found.result });
  log("ghcr lookup", { image: key, pages: found.pages, releases: found.result.releases.length });
  return json(found.result);
}

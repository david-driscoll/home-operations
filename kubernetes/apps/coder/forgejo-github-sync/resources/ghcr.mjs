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
// ONE DEPENDENCY, AND NO BUILD: GitHub is called through Octokit
// (`@octokit/rest`), which Bun fetches from npm the first time the import is
// reached -- there is no node_modules beside this file, and with none Bun
// installs on demand into its cache (BUN_INSTALL_CACHE_DIR, under the pod's
// writable /tmp). The version is pinned by OCTOKIT_VERSION in
// ../helmrelease.yaml, where Renovate can see it. Its own dependencies are
// NOT pinned: there is no lockfile, so they are whatever is current when the
// pod starts.
//
// Loaded on the first lookup, not at start, and tried again after a failure:
// the relay's own job (POST /flux in server.mjs) must not depend on npm
// being reachable.

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

let loading;
function loadOctokit() {
  loading ??= import(`@octokit/rest@${process.env.OCTOKIT_VERSION ?? "22.0.1"}`).then(
    module => module.Octokit,
    error => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

async function lookup(owner, image, token) {
  const Octokit = await loadOctokit();
  // A client per lookup: the token is an hourly one.
  // Its logger is silenced: Octokit prints a line of its own for every
  // refused request, ten at a time here, and the one JSON line this file
  // logs per lookup says the same thing.
  const quiet = () => {};
  const octokit = new Octokit({ auth: token, userAgent: "forgejo-github-sync", log: { debug: quiet, info: quiet, warn: quiet, error: quiet } });
  // The `...ForUser` routes answer for organizations too. Octokit encodes the
  // `/` in an image name such as `owner/app/server`.
  const pkg = { package_type: "container", package_name: image, username: owner };
  const request = () => ({ signal: AbortSignal.timeout(20_000) });

  const releases = [];
  const seen = new Set();
  let pages = 0;
  const cutoff = Date.now() - MAX_AGE_MS;
  // Octokit's own paginator reads one page after another, and twenty pages in
  // a row took twelve seconds with the caller waiting. So the pages are asked
  // for by number, a wave at a time.
  waves: for (let first = 1; first <= MAX_PAGES; first += WAVE) {
    const numbers = Array.from({ length: Math.min(WAVE, MAX_PAGES - first + 1) }, (_, i) => first + i);
    const answers = await Promise.all(
      numbers.map(page => octokit.rest.packages.getAllPackageVersionsForPackageOwnedByUser({ ...pkg, per_page: PER_PAGE, page, request: request() })),
    );
    for (const { data: body } of answers) {
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
  // Not worth failing the lookup over.
  const sourceUrl = await octokit.rest.packages.getPackageForUser({ ...pkg, request: request() }).then(
    ({ data }) => data.repository?.html_url,
    () => undefined,
  );
  return { pages, result: { releases, ...(sourceUrl ? { sourceUrl } : {}) } };
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
    // Octokit throws on anything but 2xx, with the HTTP status on the error.
    // 404: no such image, or it is private to someone else. 401/403: the
    // token. Either way Renovate is told the lookup failed, so it reports
    // that for this one dependency rather than "no updates". No status at
    // all is GitHub, or npm on the first lookup, being unreachable.
    const status = typeof error?.status === "number" ? error.status : undefined;
    log(status ? "ghcr lookup refused" : "ghcr lookup failed", { image: key, ...(status ? { status } : { error: String(error).slice(0, 200) }) });
    return json({ error: status ? `github answered ${status}` : "lookup failed" }, status === 404 ? 404 : 502);
  }
  cache.set(key, { at: Date.now(), result: found.result });
  log("ghcr lookup", { image: key, pages: found.pages, releases: found.result.releases.length });
  return json(found.result);
}

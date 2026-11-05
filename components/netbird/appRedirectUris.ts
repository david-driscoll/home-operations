/**
 * OAuth redirect URIs for the NetBird app names (docs/plans/netbird-mirror.md
 * §N). Every tailnet app is also at `<host>.app.<root domain>`, the same <host>
 * as `<host>.<tailnet>`, and an app with native OIDC that lists its tailnet
 * name's redirect URI builds the redirect from the request's host, so a login
 * started on the NetBird name comes back to it. Rather than add a third URI to
 * every definition.yaml, stacks/system derives it here: for each strict URI on
 * a `<host>.<tailnet>` name, the same URI on `<host>.app.<root domain>`.
 *
 * `app` must match stacks/netbird/apps.ts APP_SUBDOMAIN.
 */

/** The label under the root domain that holds every NetBird app name. */
export const NETBIRD_APP_SUBDOMAIN = "app";

export interface RedirectUri {
  matching_mode?: string;
  url: string;
}

/** scheme://, host, and everything after it (port, path, query), of an absolute http(s) URL. */
const ABSOLUTE_URL = /^(https?:\/\/)([^/:?#]+)(.*)$/i;

/**
 * The NetBird twin of an absolute http(s) URL on a `<host>.<tailnet>` name:
 * the same scheme, port, path and query on `<host>.app.<root domain>`. Only a
 * host that is a single label under the tailnet has one (`a.b.<tailnet>` does
 * not); anything else, including a non-URL, gives `undefined`.
 *
 * Shared by the OAuth redirect URIs below and the forward-auth proxy twins
 * (components/authentik/proxyHostTwins.ts), so both derive the same name.
 */
export function netbirdAppUrl(url: string, tailnet: string, root: string): string | undefined {
  const match = ABSOLUTE_URL.exec(url);
  if (!match) return undefined;
  const [, scheme, host, rest] = match;
  const suffix = `.${tailnet.toLowerCase()}`;
  if (!host.toLowerCase().endsWith(suffix)) return undefined;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) return undefined;
  return `${scheme}${label}.${NETBIRD_APP_SUBDOMAIN}.${root}${rest}`;
}

/**
 * `uris` plus, after each strict one whose host is a single label under the
 * tailnet, its NetBird twin. Regex URIs are left alone (rewriting a pattern
 * is not safe), as are names that are not one label deep (`a.b.<tailnet>`),
 * which have no NetBird twin. A twin already listed is not repeated.
 */
export function withNetbirdRedirectUris<T extends RedirectUri>(uris: T[], tailnet: string, root: string): T[] {
  const seen = new Set(uris.map(uri => uri.url));
  const out: T[] = [];
  for (const uri of uris) {
    out.push(uri);
    if ((uri.matching_mode ?? "strict") !== "strict") continue;
    const url = netbirdAppUrl(uri.url, tailnet, root);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...uri, url });
  }
  return out;
}

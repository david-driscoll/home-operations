/**
 * The extra hostnames a forward-auth (proxy) app answers on, besides its
 * primary `spec.authentik.proxy.externalHost` (docs/plans/netbird-mirror.md D45).
 *
 * authentik's ProxyProvider.external_host is ONE string, and the outpost only
 * serves a provider that an Application is bound to
 * (`ProxyProvider.objects.filter(application__isnull=False)`). So every extra
 * name needs its own provider AND its own application, or it answers
 * 400 "no app for hostname". components/authentik.ts builds that pair for each
 * twin returned here, from the same definition and the same access_policy, and
 * hides the application from the Library (`meta_hide`), so a person sees one
 * entry per app and the policy cannot drift between names.
 *
 * - `tailnet`: `spec.tailnetUrl`, `<app>.<tailnet>`.
 * - `app`: the NetBird name `<app>.app.<root domain>`, derived from the tailnet
 *   one the same way the OAuth redirect URIs are (../netbird/appRedirectUris.ts),
 *   only where the manager is given `netbirdApps` (stacks/system).
 *
 * Pure: no Pulumi, so `node --test` can load it.
 */

import { netbirdAppUrl } from "../netbird/appRedirectUris.ts";

/** Which extra name a twin is for. It suffixes the Pulumi resource names and the slug. */
export type ProxyHostVariant = "tailnet" | "app";

export interface ProxyHostTwin {
  variant: ProxyHostVariant;
  externalHost: string;
}

/** The Library-invisible label each twin's application carries, for an admin reading the list. */
export const PROXY_TWIN_LABEL: Record<ProxyHostVariant, string> = {
  tailnet: "Tailnet",
  app: "NetBird",
};

/**
 * The twins for one proxy app. `tailnetUrl` is the definition's, already
 * substituted; `netbird` is the tailnet name and root domain when the stack
 * publishes NetBird app names. A twin whose host equals the primary's is
 * dropped: two providers on one external_host would make the outpost's choice
 * between them arbitrary.
 */
export function proxyHostTwins(primaryHost: string, tailnetUrl: string | undefined, netbird?: { tailnet: string; root: string }): ProxyHostTwin[] {
  if (!tailnetUrl) return [];
  const twins: ProxyHostTwin[] = [{ variant: "tailnet", externalHost: tailnetUrl }];
  const app = netbird ? netbirdAppUrl(tailnetUrl, netbird.tailnet, netbird.root) : undefined;
  if (app) twins.push({ variant: "app", externalHost: app });
  const primary = hostOf(primaryHost);
  return twins.filter(twin => hostOf(twin.externalHost) !== primary);
}

/** The twin application's slug: the primary's, suffixed, so the pair sorts together and never collides with another app's random-pet slug. */
export function twinSlug(primarySlug: string, variant: ProxyHostVariant): string {
  return `${primarySlug}-${variant}`;
}

function hostOf(url: string): string {
  return url
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/[/:?#].*$/, "")
    .toLowerCase();
}

/**
 * Every provider an outpost has to carry for these apps: each proxy app's
 * primary provider and all its twins. A twin missing here is a hostname the
 * outpost will not answer, which is the 400 the twins exist to fix -- so both
 * outposts (stacks/system, DockgeLxc) collect them through this one function.
 */
export function outpostProxyProviders<P>(apps: readonly ({ isProxy: true; provider: P; twins: readonly { provider: P }[] } | { isProxy: false })[]): P[] {
  return apps.flatMap(app => (app.isProxy ? [app.provider, ...app.twins.map(twin => twin.provider)] : []));
}

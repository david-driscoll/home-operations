/**
 * nbidp: passwordless "log in with NetBird" in Authentik (#2891,
 * docs/plans/netbird-mirror.md §K). The pure half, shared by the two stacks
 * that build it and tested in nbidp.test.ts.
 *
 *   NetBird client ──WireGuard──▶ private reverse proxy (netbird-system)
 *                                   │ X-NetBird-User / X-NetBird-Groups,
 *                                   │ client copies deleted first
 *                                   ▼
 *                                 Dex, authproxy connector ──OIDC──▶ Authentik source "NetBird"
 *
 * - stacks/netbird mints the proxy's token and declares the private service
 *   (stacks/netbird/nbidp.ts);
 * - stacks/authentik owns the OAuth client on BOTH ends: it creates the
 *   source and renders Dex's config (renderDexConfig) into OpenBao, where
 *   kubernetes/apps/netbird-system/nbidp reads it;
 * - kubernetes/apps/netbird-system/nbidp runs the proxy and Dex, and its
 *   CiliumNetworkPolicy is what makes the headers trustworthy: only the proxy
 *   reaches Dex's login path.
 */
import { rootDomain } from "components/domains.ts";

/**
 * The two headers the NetBird proxy controls. Its stampNetBirdIdentity
 * (proxy/internal/proxy/reverseproxy.go, v0.82.0) deletes both from every
 * outbound request and then sets them from the tunnel peer's identity: the
 * owner's email (the peer name for a peer with no user), and the peer's group
 * names joined with commas. Nothing else in a request reaching Dex is
 * trustworthy.
 */
export const NETBIRD_IDENTITY_HEADERS = { user: "X-NetBird-User", groups: "X-NetBird-Groups" } as const;

/** Dex's connector id: the `/callback/<id>` path the login lands on. */
export const DEX_CONNECTOR_ID = "netbird";
/** Where kubernetes/apps/netbird-system/nbidp runs Dex. */
export const DEX_NAMESPACE = "netbird-system";
export const DEX_SERVICE = "nbidp-dex";
export const DEX_PORT = 5556;
export const DEX_TELEMETRY_PORT = 5558;
/** In-cluster Dex, for the proxy's upstream and Authentik's server-to-server calls. Plain HTTP: it never leaves the pod network. */
export const DEX_BACKCHANNEL_URL = `http://${DEX_SERVICE}.${DEX_NAMESPACE}.svc.cluster.local:${DEX_PORT}`;

/** OpenBao (`secrets` mount) paths. */
export const NBIDP_BAO = {
  /** Dex's whole config, client secret included. Written by stacks/authentik. */
  dexConfig: "apps/nbidp/dex",
  /** The proxy's account-scoped token. Written by stacks/netbird. */
  proxyToken: "third-party-tokens/netbird/nbidp-proxy",
} as const;

/** `nbidp.<root domain>`: Dex's issuer host, the proxy's cluster address, and the private service's domain. */
export function nbidpHost(root: string = rootDomain()): string {
  return `nbidp.${root}`;
}

export function nbidpIssuer(root: string = rootDomain()): string {
  return `https://${nbidpHost(root)}`;
}

export interface DexConfigArgs {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Authentik's `/source/oauth/callback/netbird/` on every name it answers to. */
  redirectUris: string[];
}

/**
 * Dex's config.yaml, as JSON (which Dex's YAML loader reads as-is).
 *
 * The authproxy connector reads five headers, and four default to names the
 * NetBird proxy passes straight through (X-Remote-User-Id, -Name, -Email and
 * X-Remote-Group). Each is pinned to a header the proxy deletes and re-stamps,
 * or a NetBird user could send `X-Remote-User-Email: <someone else>` and
 * Authentik's email_link would log them in as that person.
 */
export function renderDexConfig(args: DexConfigArgs): string {
  if (!args.issuer.startsWith("https://")) throw new Error(`Dex issuer must be https, got ${args.issuer}`);
  if (!args.clientId || !args.clientSecret) throw new Error("Dex needs Authentik's client id and secret");
  if (args.redirectUris.length === 0) throw new Error("Dex needs at least one Authentik redirect URI");

  const config = {
    issuer: args.issuer,
    // Nothing worth keeping: an auth request lives for one login, and a
    // restart's fresh signing keys only matter to a relying party that
    // validates id_tokens, which Authentik does not here (it reads /userinfo).
    // One replica, because memory storage is per pod.
    storage: { type: "memory" },
    web: { http: `0.0.0.0:${DEX_PORT}` },
    // /healthz/live and /healthz/ready for the kubelet, off the login port.
    telemetry: { http: `0.0.0.0:${DEX_TELEMETRY_PORT}` },
    logger: { level: "info", format: "json" },
    expiry: { authRequests: "10m", idTokens: "10m" },
    oauth2: {
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      skipApprovalScreen: true,
      alwaysShowLoginScreen: false,
    },
    enablePasswordDB: false,
    connectors: [
      {
        type: "authproxy",
        id: DEX_CONNECTOR_ID,
        name: "NetBird",
        config: {
          userIDHeader: NETBIRD_IDENTITY_HEADERS.user,
          userHeader: NETBIRD_IDENTITY_HEADERS.user,
          userNameHeader: NETBIRD_IDENTITY_HEADERS.user,
          emailHeader: NETBIRD_IDENTITY_HEADERS.user,
          groupHeader: NETBIRD_IDENTITY_HEADERS.groups,
          groupHeaderSeparator: ",",
        },
      },
    ],
    staticClients: [{ id: args.clientId, secret: args.clientSecret, name: "Authentik", redirectURIs: args.redirectUris }],
  };
  return JSON.stringify(config, null, 2);
}

/**
 * Where Authentik's NetBird source sends the browser, and where its server
 * calls Dex itself.
 *
 * The browser goes to the issuer: `nbidp.<root domain>` resolves only for
 * NetBird peers in the private service's access groups (management
 * synthesizes the record), so with NetBird off the login cannot start.
 * Authentik's own pods are not NetBird peers, so the token exchange and
 * userinfo go to Dex's Service, on the two paths the CiliumNetworkPolicy lets
 * them use. No well-known or JWKS URL: Authentik would fetch both when the
 * source is saved, and reads the profile from /userinfo anyway.
 */
export function sourceEndpoints(issuer: string): { authorizationUrl: string; accessTokenUrl: string; profileUrl: string } {
  return {
    authorizationUrl: `${issuer}/auth`,
    accessTokenUrl: `${DEX_BACKCHANNEL_URL}/token`,
    profileUrl: `${DEX_BACKCHANNEL_URL}/userinfo`,
  };
}

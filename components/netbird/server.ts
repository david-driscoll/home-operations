/**
 * The NetBird combined server's files, rendered for the netbird-edge VM (#3000).
 *
 * Pure functions with no Pulumi imports, so `node --test` covers them. The
 * shapes follow upstream's getting-started.sh (v0.82.0) for a built-in Traefik
 * install: management, signal, relay and STUN in one `netbird-server`
 * container behind Traefik on 443, with the embedded Dex IdP at `/oauth2`.
 * `compose.yaml` beside it is the static half (Renovate keeps its images current);
 * this module renders the half that carries the domain and the secrets.
 */

/** Traefik's fixed address on the compose network (compose.yaml). The only proxy trusted for client IPs. */
export const TRAEFIK_IP = "172.30.0.10";
export const STUN_PORT = 3478;

export interface ServerSecrets {
  /** Shared with every relay; signs relay credentials. */
  relayAuthSecret: string;
  /** Encrypts the SQLite store. Base64 WITH padding: Go reads it with StdEncoding. Losing it loses the user data. */
  datastoreEncryptionKey: string;
  sessionCookieEncryptionKey: string;
}

export interface ServerConfigArgs extends ServerSecrets {
  /** The public management name, `netbird.<root domain>`. */
  domain: string;
}

/** A YAML double-quoted scalar. JSON's escaping is a subset of YAML's, so this is always valid. */
const q = (value: string) => JSON.stringify(value);

/** `/etc/netbird/config.yaml` for the combined server. */
export function renderServerConfig(args: ServerConfigArgs): string {
  const origin = `https://${args.domain}`;
  return `# Rendered by stacks/netbird-edge (Pulumi). Edits on the VM are overwritten.
server:
  listenAddress: ":80"
  exposedAddress: ${q(`${origin}:443`)}
  stunPorts:
    - ${STUN_PORT}
  metricsPort: 9090
  healthcheckAddress: ":9000"
  logLevel: "info"
  logFile: "console"

  authSecret: ${q(args.relayAuthSecret)}
  dataDir: "/var/lib/netbird"

  auth:
    issuer: ${q(`${origin}/oauth2`)}
    signKeyRefreshEnabled: true
    sessionCookieEncryptionKey: ${q(args.sessionCookieEncryptionKey)}
    dashboardRedirectURIs:
      - ${q(`${origin}/nb-auth`)}
      - ${q(`${origin}/nb-silent-auth`)}
    cliRedirectURIs:
      - "http://localhost:53000/"

  reverseProxy:
    trustedHTTPProxies:
      - ${q(`${TRAEFIK_IP}/32`)}
    # The address Traefik reaches management from. Without it NetBird
    # accepts forwarded client-IP headers from any source.
    trustedPeers:
      - ${q(`${TRAEFIK_IP}/32`)}

  store:
    engine: "sqlite"
    encryptionKey: ${q(args.datastoreEncryptionKey)}
`;
}

/** `dashboard.env`: the dashboard's endpoints and its client of the embedded IdP. No secrets. */
export function renderDashboardEnv(args: { domain: string }): string {
  const origin = `https://${args.domain}`;
  return `# Rendered by stacks/netbird-edge (Pulumi). Edits on the VM are overwritten.
NETBIRD_MGMT_API_ENDPOINT=${origin}
NETBIRD_MGMT_GRPC_API_ENDPOINT=${origin}
AUTH_AUDIENCE=netbird-dashboard
AUTH_CLIENT_ID=netbird-dashboard
AUTH_CLIENT_SECRET=
AUTH_AUTHORITY=${origin}/oauth2
USE_AUTH0=false
AUTH_SUPPORTED_SCOPES=openid profile email groups
AUTH_REDIRECT_URI=/nb-auth
AUTH_SILENT_REDIRECT_URI=/nb-silent-auth
NGINX_SSL_PORT=443
LETSENCRYPT_DOMAIN=none
`;
}

export interface SetupResult {
  userId: string;
  email: string;
  /** The owner's bootstrap PAT. Secret: never log it. */
  personalAccessToken: string;
}

/**
 * Read `POST /api/setup`'s body. The server only returns a PAT when it runs
 * with NB_SETUP_PAT_ENABLED=true and the request asked for one; without it the
 * owner exists but nothing can drive the API, so this refuses rather than
 * storing an empty token. Errors never quote the body: it may carry the token.
 */
export function parseSetupResponse(body: string): SetupResult {
  let parsed: { user_id?: string; email?: string; personal_access_token?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`NetBird /api/setup answered with something that is not JSON (${body.length} bytes)`);
  }
  if (!parsed.personal_access_token) {
    throw new Error("NetBird /api/setup returned no personal_access_token: the server must run with NB_SETUP_PAT_ENABLED=true");
  }
  if (!parsed.user_id || !parsed.email) {
    throw new Error("NetBird /api/setup returned no user_id or email");
  }
  return { userId: parsed.user_id, email: parsed.email, personalAccessToken: parsed.personal_access_token };
}

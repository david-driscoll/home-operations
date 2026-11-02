/**
 * Jellyfin sign-in through authentik: the SSO-Auth plugin's provider, the
 * login-page button, and the JavaScript Injector script that sends Moonfin's
 * Quick Connect QR through SSO. Runbook: docs/kubernetes/jellyfin-sso.md.
 *
 * Called from applications.ts once Jellyfin's authentik application exists, so
 * the OIDC client id, secret and issuer come straight from that resource rather
 * than round-tripping through OpenBao (which would not exist yet on the first
 * run).
 *
 * The two plugins (SSO-Auth from MaxRink/jellyfin-plugin-sso, and JavaScript
 * Injector) are installed by hand, through Jellyfin's plugin UI, and are NOT
 * managed here. A missing plugin fails this stack's run on purpose -- see
 * dynamic/jellyfin/JellyfinConfiguration.ts.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import type { GlobalResources } from "components/globals.ts";
import { JellyfinConfiguration } from "dynamic/jellyfin/JellyfinConfiguration.ts";

const JELLYFIN_APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../kubernetes/apps/equestria/media/jellyfin");

/** In-cluster, so the run never depends on Traefik or DNS. */
const JELLYFIN_URL = "http://jellyfin.equestria.svc.cluster.local:8096";

/** Admin-scoped Jellyfin API key; also read by the dashboard and setup-status. */
const JELLYFIN_API_KEY_PATH = "clusters/equestria/apps/jellyfin/api-key";

const SSO_AUTH_PLUGIN_ID = "505ce9d1d91642fa86ca673ef241d7df";
const JAVASCRIPT_INJECTOR_PLUGIN_ID = "f5a34f7b2e8a4e6aa7223a216a81b374";

/**
 * The plugin's provider name, case-sensitive. It is also the last segment of
 * the redirect URIs in definition.yaml, the form action in
 * resources/login-disclaimer.html and START_PATH in resources/sso-return.js.
 */
const SSO_PROVIDER_NAME = "authentik";

/** The JavaScript Injector entry this stack owns, matched by name. */
const SSO_SCRIPT_NAME = "SSO return (managed by Pulumi)";

export interface JellyfinSsoArgs {
  clientId: pulumi.Input<string>;
  clientSecret: pulumi.Input<string>;
  /** authentik's issuer URL for the jellyfin application, trailing slash included. */
  issuer: pulumi.Input<string>;
}

const readResource = (file: string) => readFileSync(path.join(JELLYFIN_APP_DIR, "resources", file), "utf8");

export function configureJellyfinSso(globals: GlobalResources, args: JellyfinSsoArgs, opts: pulumi.CustomResourceOptions) {
  const apiKey = vault.kv.getSecretV2Output({ mount: "secrets", name: JELLYFIN_API_KEY_PATH }, { provider: globals.baoProvider }).data.apply(data => data.token);
  const connection = { baseUrl: JELLYFIN_URL, apiKey: pulumi.secret(apiKey) };

  const ssoAuth = new JellyfinConfiguration(
    "jellyfin-sso-auth",
    {
      ...connection,
      endpoint: `/Plugins/${SSO_AUTH_PLUGIN_ID}/Configuration`,
      merge: pulumi.secret(
        pulumi.all([args.clientId, args.clientSecret, args.issuer]).apply(([clientId, clientSecret, issuer]) => ({
          // Plugin-wide. Off for now, so a linked account keeps its password
          // and password-only apps (Infuse) keep working. The exemption is
          // already in place for when this is turned on.
          EnforceSsoOnly: false,
          SsoOnlyExemptUsernames: ["david"],
          OidConfigs: {
            // Merged into the live provider, so the plugin's own state --
            // CanonicalLinks, written at every first login -- is carried
            // through. UsernameMappings is not named for the same reason: an
            // entry added in the settings page survives.
            [SSO_PROVIDER_NAME]: {
              OidEndpoint: issuer,
              OidClientId: clientId,
              OidSecret: clientSecret,
              Enabled: true,
              // `groups` and `preferred_username` both come from authentik's
              // default `profile` mapping, which the plugin always requests.
              RoleClaim: "groups",
              OidScopes: [],
              DefaultUsernameClaim: "preferred_username",
              // TLS ends at Traefik, and Jellyfin only trusts X-Forwarded-Proto
              // from Known Proxies; without this the redirect URI is http://.
              SchemeOverride: "https",
              // Empty: who may sign in is decided by authentik's access policy
              // in definition.yaml, not here.
              Roles: [],
              // Rewrites the permissions below on EVERY SSO login.
              EnableAuthorization: true,
              // Must stay true while EnabledFolders and FolderRoleMapping are
              // empty, or every SSO user loses every library.
              EnableAllFolders: true,
              EnabledFolders: [],
              EnableFolderRoles: false,
              FolderRoleMapping: [],
              AdminRoles: ["admins"],
              // Off: leaving `admins` in authentik removes Jellyfin admin.
              PreserveAdminPermissions: false,
              DisableUsernameAccountAdoption: false,
              // Written on every SSO login even with EnableAuthorization off,
              // and false by default -- leave these out and the first SSO
              // login removes Live TV.
              EnableLiveTv: true,
              EnableLiveTvManagement: false,
              EnableLiveTvRoles: true,
              LiveTvRoles: [],
              LiveTvManagementRoles: ["media-managers"],
            },
          },
        })),
      ),
    },
    opts,
  );

  const branding = new JellyfinConfiguration(
    "jellyfin-sso-branding",
    {
      ...connection,
      endpoint: "/System/Configuration/branding",
      merge: {
        LoginDisclaimer: readResource("login-disclaimer.html"),
        CustomCss: readResource("custom.css"),
      },
    },
    opts,
  );

  const script = new JellyfinConfiguration(
    "jellyfin-sso-return-script",
    {
      ...connection,
      endpoint: `/Plugins/${JAVASCRIPT_INJECTOR_PLUGIN_ID}/Configuration`,
      upserts: [
        {
          property: "CustomJavaScripts",
          key: "Name",
          items: [
            {
              Name: SSO_SCRIPT_NAME,
              Script: readResource("sso-return.js"),
              Src: "",
              Module: false,
              Enabled: true,
              // Served from public.js, so it also runs before login -- the
              // only time it does anything.
              RequiresAuthentication: false,
            },
          ],
        },
      ],
    },
    opts,
  );

  return { ssoAuth, branding, script };
}

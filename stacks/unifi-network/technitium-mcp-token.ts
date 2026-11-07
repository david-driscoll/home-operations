/**
 * The read-only Technitium MCP server's own account and API token, written to
 * OpenBao at `secrets/apps/technitium/mcp` for toolport to read.
 *
 * Its own user, never the admin key the provider uses, so the MCP can be
 * revoked on its own and can only do what this user can. Technitium tokens
 * carry exactly the privileges of their user (APIDOCS.md, "Create API Token").
 *
 * WHAT THE USER CAN SEE. Section permissions are granted to groups, and the
 * user is in `Everyone` only -- every account is, the server adds it on create
 * and on every membership change. `Everyone` has View on Dashboard, Zones,
 * Cache, Allowed, Blocked, Apps, DnsClient, DhcpServer and Logs out of the box
 * (DnsServerCore/Auth/AuthManager.cs, the default config), and nothing on
 * Settings or Administration. That is the point: `settings/get` returns the
 * TSIG key secrets, so the MCP must not get Settings, and must not be put in
 * `DNS Administrators` (which has it) to get anything else. Membership is
 * declared, so a hand promotion shows up as drift and the next run reverts it.
 *
 * Section-level View on Zones is not enough to read a zone: each zone carries
 * its own permission list, and a new zone gets only its creator and the admin
 * groups. dynamic/technitium/TechnitiumUserZoneView.ts adds the user View-only
 * to EVERY zone on the primary -- this stack's, hand-made ones, the cluster
 * catalog -- not just those declared in code. Its diff walks the live zone
 * list, so a zone created anywhere is picked up by the next run (every 5
 * minutes, the stack's resync). It skips only the root zone and the built-in
 * `internal` zones; see its header.
 *
 * Everything is written to the cluster primary (globals.technitiumProvider);
 * the secondaries take the account, its token and the zone permissions from
 * the primary by cluster sync.
 *
 * ROTATION. The token never expires. To rotate, replace it
 * (`pulumi up --replace <the ApiToken's URN>`); the OpenBao secret follows.
 * The old token is deleted first: token names are unique per user, so a new
 * `toolport` token cannot exist beside the old one, and the MCP is without a
 * valid token until its ExternalSecret refreshes.
 */

import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as technitium from "@pulumi/technitium";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import type { GlobalResources } from "components/globals.ts";
import { TechnitiumUserZoneView } from "dynamic/technitium/TechnitiumUserZoneView.ts";

export const TECHNITIUM_MCP_BAO_PATH = "apps/technitium/mcp";
const MCP_USERNAME = "mcp";
const MCP_TOKEN_NAME = "toolport";

export function configureTechnitiumMcpToken(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:technitium:McpToken", "technitium-mcp", {});
  const cro = { parent, provider: globals.technitiumProvider };

  // Nothing logs in with it: the MCP uses the token. Technitium still requires
  // one, and it lives in Pulumi state only.
  const password = new random.RandomPassword("technitium-mcp-password", { length: 40, special: false }, { parent });

  const user = new technitium.User(
    "mcp",
    {
      username: MCP_USERNAME,
      displayName: "Toolport MCP (read-only)",
      password: password.result,
      memberOfGroups: ["Everyone"],
    },
    cro,
  );

  const token = new technitium.ApiToken("mcp-toolport", { user: user.username, tokenName: MCP_TOKEN_NAME }, { ...cro, additionalSecretOutputs: ["token"], deleteBeforeReplace: true });

  // A dynamic resource takes no provider; it calls the admin API directly
  // with the provider's own URL, TLS name and key.
  const zoneView = new TechnitiumUserZoneView(
    "mcp-zone-view",
    {
      serverUrl: globals.technitiumServerUrl,
      tlsServerName: globals.technitiumTlsServerName,
      apiToken: globals.technitiumCredential.credential,
      // The constant, not `user.username`: a known value keeps the diff's
      // live read usable in preview; dependsOn orders it after the user.
      username: MCP_USERNAME,
    },
    { parent, dependsOn: [user] },
  );

  const secret = baoKvSecret(
    "technitium-mcp",
    {
      mount: "secrets",
      path: TECHNITIUM_MCP_BAO_PATH,
      data: { user: user.username, token_name: token.tokenName, token: token.token },
      concealedFields: ["token"],
      customMetadata: baoProvenance({ source: "stacks/unifi-network" }),
    },
    { provider: globals.baoProvider },
  );

  return { user, token, zoneView, secret };
}

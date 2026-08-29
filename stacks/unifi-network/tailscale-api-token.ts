/**
 * Mints a fresh Tailscale API token every run and writes it into OpenBao at
 * `third-party-tokens/tailscale/api-key` -- the path
 * kubernetes/apps/agents/agent-tools-servers/tailscale.yaml's ExternalSecret
 * already reads from for the tailscale-mcp-server MCP server.
 *
 * That server wants a static-looking `TAILSCALE_API_KEY` it can put
 * straight into a Bearer header, with no OAuth exchange logic of its own
 * (confirmed against its own README). This stack's existing OAuth client
 * credential (`Tailscale Terraform OAuth Client`, the same one
 * components/tailscale.ts's getTailscaleClient/getTailscaleAccessToken use
 * for the ACL manager above) is a DIFFERENT credential type -- but
 * Tailscale's own API accepts an OAuth-exchanged access token as a Bearer
 * credential the exact same way, so minting one here and handing it over
 * as if it were a static key works.
 *
 * Why THIS stack: the token is short-lived (standard OAuth2 access-token
 * TTL, on the order of an hour) and the only thing that mints a fresh one
 * is a Pulumi run of this file -- so the refresh cadence is bounded by
 * however often the Stack resource itself resyncs, not by anything in code.
 * stacks/system's Stack resyncs once a day (kubernetes/apps/pulumi/system/stack.yaml,
 * resyncFrequencySeconds: 86400) -- nowhere near often enough, and exactly
 * the mistake this repo already made once and fixed for the GitHub App
 * installation token (see stacks/vault/index.ts's own comment on that).
 * stacks/unifi-network resyncs every 5 minutes
 * (kubernetes/apps/pulumi/unifi-network/stack.yaml, resyncFrequencySeconds: 300)
 * -- comfortably inside the token's lifetime, with margin, which is why
 * David picked this stack for it over stacks/vault (30 min) or
 * stacks/system (24h).
 *
 * A NEW token value on every run is not a special case to engineer for --
 * it falls out naturally. baoKvSecret's `data` is a plain diffed input:
 * OAuth mints a different access_token each call, Pulumi sees that as a
 * changed input, and writes it. No forced-update trick needed.
 */

import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import { getTailscaleAccessToken } from "@components/tailscale.ts";

export async function configureTailscaleApiToken(globals: GlobalResources) {
  const token = await getTailscaleAccessToken(globals);

  return baoKvSecret(
    "tailscale-api-token",
    {
      mount: "secrets",
      path: "third-party-tokens/tailscale/api-key",
      // `key` matches tailscale.yaml's ExternalSecret
      // (remoteRef.property: key) exactly -- do not rename one without the
      // other.
      data: { key: token.access_token },
      concealedFields: ["key"],
      customMetadata: baoProvenance({
        source_title: "Tailscale API Token (auto-minted)",
        source_tags: "tailscale-mcp",
      }),
    },
    { provider: globals.baoProvider },
  );
}

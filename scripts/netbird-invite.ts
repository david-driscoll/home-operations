#!/usr/bin/env node
/**
 * Invite someone to the self-hosted NetBird and print their invite link
 * (docs/runbooks/netbird-client-onboarding.md).
 *
 *   mise run netbird:invite <email> "<name>" <admins|family|friends|media-managers>
 *   mise run netbird:invite --dry-run <email> "<name>" <group>
 *
 * Use the person's Authentik email: nbidp's passwordless "NetBird" button on
 * Authentik matches people by it (stacks/netbird/nbidp.ts).
 *
 * The task runs this under `fnox exec -P netbird`, which puts the NetBird URL
 * and the three PATs in the environment (.config/fnox.toml, profile
 * `netbird`). It uses the first usable one in globals.netbirdApi's order:
 * automation, owner-pat, owner. It looks the group up by name, then
 * `POST /api/users/invites` with that group as the user's only auto group;
 * `admins` invites are NetBird admins, the rest regular users.
 * `--dry-run` does the lookup and shows the request, and sends nothing.
 *
 * No secret is printed: not the PAT, and the invite link is printed only
 * because handing it over is the point.
 */
import { chooseToken } from "../components/netbird/tokens.ts";
import { candidatesFromEnv, findGroupId, inviteRequest, inviteUrl, type NamedGroup, parseInviteArgs } from "../stacks/netbird/invite.ts";

async function main(): Promise<void> {
  const args = parseInviteArgs(process.argv.slice(2));

  const managementUrl = process.env.NETBIRD_URL?.trim().replace(/\/+$/, "");
  if (!managementUrl) throw new Error("NETBIRD_URL is not set. Run through `mise run netbird:invite`, which resolves it with `fnox exec -P netbird`.");
  const choice = chooseToken(candidatesFromEnv(process.env), new Date());
  for (const skip of choice.skipped) if (skip.reason !== "absent") console.error(`netbird-invite: skipping the ${skip.source} PAT (${skip.detail})`);
  console.error(`netbird-invite: ${managementUrl}, with the ${choice.source} PAT`);

  const call = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${managementUrl}${path}`, {
      method,
      headers: { Authorization: `Token ${choice.token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const hint = response.status === 409 ? " (a user or invite for that email already exists: see Team → Users in the dashboard)" : response.status === 412 ? " (the embedded IdP is not enabled on this server)" : "";
      throw new Error(`NetBird ${method} ${path}: HTTP ${response.status}${hint}${detail ? `\n${detail}` : ""}`);
    }
    return (await response.json()) as T;
  };

  const groupId = findGroupId(await call<NamedGroup[]>("GET", "/api/groups"), args.group);
  const request = inviteRequest({ email: args.email, name: args.name, group: args.group, groupId });
  if (args.dryRun) {
    console.log(`dry run: would POST /api/users/invites\n${JSON.stringify(request, null, 2)}`);
    return;
  }

  const invite = await call<{ id: string; expires_at: string; invite_token?: string }>("POST", "/api/users/invites", request);
  console.error(`netbird-invite: invited ${args.name} <${args.email}> to ${args.group} as ${request.role}; the link expires ${invite.expires_at}`);
  console.log(inviteUrl(managementUrl, invite.invite_token));
}

main().catch((error: unknown) => {
  console.error(`netbird-invite: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

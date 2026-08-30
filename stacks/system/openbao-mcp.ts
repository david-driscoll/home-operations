/**
 * OpenBao access for the `toolhive-openbao` MCP server
 * (kubernetes/apps/agents/agent-tools-servers/openbao.yaml) -- David's own scope answer for
 * it was "Secrets only, read+write", and "Pulumi code in stack/system" for
 * where the auth setup lives (an explicit correction over an earlier draft
 * that proposed `stacks/vault` instead).
 *
 * ## What this creates
 *
 * A Kubernetes-auth Role (`agent-openbao-mcp`) and a Policy of the same
 * name, so `toolhive-openbao`'s ExternalSecret can mint a live OpenBao
 * token via ESO's `VaultDynamicSecret` generator instead of holding one
 * static, never-rotated token forever (the openbao-mcp package itself has
 * no built-in re-auth -- it just reads `OPENBAO_TOKEN` once at start-up).
 *
 * The role is bound to the SAME identity every OpenBao-consuming
 * ClusterSecretStore/generator in this cluster already authenticates as --
 * `external-secrets`/`kube-system` (see
 * kubernetes/apps/kube-system/external-secrets/stores/openbao-store.yaml's
 * own `eso-equestria` role) -- because a `VaultDynamicSecret` generator
 * always executes inside the ESO controller itself, in `kube-system`,
 * regardless of which namespace the resulting Secret lands in. There is no
 * separate `toolhive-openbao` ServiceAccount to bind to; one would be
 * theater, since ESO would never actually present its token.
 *
 * Two-token design, not one: the Kubernetes-auth login itself only proves
 * "this is really ESO", then the generator makes ONE MORE call --
 * `auth/token/create` -- to mint a short-lived CHILD token that actually
 * carries the `agent-openbao-mcp` policy. This is deliberately more
 * layered than most roles in this file (contrast `eso-equestria`, which
 * just logs in and gets a directly-usable token): OpenBao's token-create
 * only lets a token grant a subset of its OWN policies (or hold `sudo`),
 * so the login role's `tokenPolicies` has to include `agent-openbao-mcp`
 * anyway for the child-mint to succeed -- there is no way to make the
 * login token itself narrower than what it hands out here. Matches
 * OpenBao/Vault's own documented "issue a token for a workload with no
 * native Vault auth" pattern.
 *
 * NOT live-verified end to end (no live `auth/token/create` call has been
 * made against this exact role/policy pair) -- verify the full
 * login-then-mint flow once ENABLED flips and reconciles, before trusting
 * it in front of a real secrets estate.
 */

import type { GlobalResources } from "@components/globals.ts";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

/**
 * ON since the `pulumi` OpenBao policy was widened by hand via the OIDC
 * `admin` login (bootstrap/openbao/equestria-init.sh's `admins` group ->
 * `admin` policy path -- no root ceremony needed for this one, it's a
 * normal admin-group action, not break-glass) rather than the root
 * ceremony this file originally called for. Both named-path grants below
 * were added to `pulumi`'s live policy:
 *
 *   path "sys/policies/acl/agent-openbao-mcp" {
 *     capabilities = ["create", "read", "update", "delete"]
 *   }
 *   path "auth/kubernetes/role/agent-openbao-mcp" {
 *     capabilities = ["create", "read", "update", "delete"]
 *   }
 *
 * Turning this on creates the Policy and the Kubernetes auth Role below,
 * neither of which existed before -- both resource types are upsert-shaped
 * at the OpenBao API level (a `create` is just a write), so this converges
 * cleanly even though nothing here was previously under Pulumi's state.
 */
const ENABLED = true;

/** Vault/OpenBao Kubernetes auth backend mount path -- see openbao-store.yaml. */
const KUBERNETES_AUTH_MOUNT = "kubernetes";

export interface OpenBaoMcpArgs {
  globals: GlobalResources;
}

export class OpenBaoMcpComponent extends ComponentResource {
  constructor(args: OpenBaoMcpArgs, opts?: ComponentResourceOptions) {
    super("custom:agents:openbao-mcp", "openbao-mcp", args, opts);

    if (!ENABLED) return;

    // Broad on purpose: David's scope answer was unqualified "secrets
    // only, read+write" with no narrower prefix requested, so this covers
    // the ENTIRE `secrets/` KV mount -- the same breadth
    // kubernetes/apps/agents/agent-tools-servers/agent-debug-rbac.yaml's own header
    // documents for its highest-risk grants, same tone here. Explicitly
    // NOT `sys/*`, NOT `auth/*`, NOT `delete`/`sudo` on anything -- an
    // agent that can read/write any app's stored credential still cannot
    // touch OpenBao's own auth methods, policies, or mounts.
    const policy = new vault.Policy(
      "agent-openbao-mcp",
      {
        name: "agent-openbao-mcp",
        policy: `
path "secrets/data/*" {
  capabilities = ["create", "read", "update", "list"]
}
path "secrets/metadata/*" {
  capabilities = ["read", "list"]
}
# Confirmed live 2026-08-30: without this, the login token minted by the
# Kubernetes-auth role below (which carries exactly this policy) gets a
# 403 calling openbao.yaml's own auth/token/create -- holding a policy
# and having the CAPABILITY to call token/create to hand that policy to a
# child token are two different grants. Vault/OpenBao's built-in
# \`default\` policy (auto-attached to every token unless
# token_no_default_policy is set, which this role does not set) covers
# lookup-self/renew-self/revoke-self, NOT token/create -- this is the
# missing piece the file header's "NOT live-verified end to end" caveat
# was waiting to catch.
path "auth/token/create" {
  capabilities = ["create", "update"]
}
`,
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    const role = new vault.kubernetes.AuthBackendRole(
      "agent-openbao-mcp",
      {
        backend: KUBERNETES_AUTH_MOUNT,
        roleName: "agent-openbao-mcp",
        // Same identity as `eso-equestria` -- see this file's header for
        // why it is ESO's own controller SA, not a per-app one.
        boundServiceAccountNames: ["external-secrets"],
        boundServiceAccountNamespaces: ["kube-system"],
        // Must include `agent-openbao-mcp` itself: `auth/token/create`
        // cannot grant a child token a policy the parent doesn't hold
        // (short of `sudo`), so the login token needs it directly. See
        // this file's header.
        tokenPolicies: [policy.name],
        // Short-lived on purpose -- ESO's VaultDynamicSecret refresh
        // (kubernetes/apps/agents/agent-tools-servers/openbao.yaml,
        // refreshInterval) re-mints well before this expires.
        tokenTtl: 3600,
        tokenMaxTtl: 3600,
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    // Exported for the header comment's own benefit -- nothing outside
    // this file reads it (ENABLED stays false until it can be verified
    // live, so there is no live role name to hand anywhere yet).
    void role;
  }
}

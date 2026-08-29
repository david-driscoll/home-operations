/**
 * OpenBao access for the `toolhive-openbao` MCP server
 * (kubernetes/apps/agents/agent-mcp-tools/agent-tools-servers/openbao.yaml) -- David's own scope answer for
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
 * OFF until a root ceremony widens the `pulumi` OpenBao policy. Verified
 * against bootstrap/openbao/equestria-init.sh's current grants (~line
 * 151-245): `pulumi` only holds capabilities on explicitly NAMED paths
 * (`sys/auth/kubernetes-sgc`, `sys/mounts/database`,
 * `sys/policies/acl/viewer`, ...) -- never a wildcard `sys/policies/acl/*`
 * or `auth/kubernetes/role/*`. Creating `agent-openbao-mcp` as a brand-new
 * Policy + Kubernetes auth Role will 403 against the live `pulumi` policy
 * exactly as the `database/` mount did before ENGINE_ENABLED's own root
 * ceremony in postgres-rotation.ts.
 *
 * This is a SMALLER ask than that one -- the `kubernetes` auth mount
 * already exists and is already configured
 * (bao write auth/kubernetes/config, equestria-init.sh:773), so this needs
 * only two new named-path grants added to the `pulumi` policy, same shape
 * as the existing `sys/auth/kubernetes-sgc` block:
 *
 *   path "sys/policies/acl/agent-openbao-mcp" {
 *     capabilities = ["create", "read", "update", "delete"]
 *   }
 *   path "auth/kubernetes/role/agent-openbao-mcp" {
 *     capabilities = ["create", "read", "update", "delete"]
 *   }
 *
 * Apply those to the `pulumi` policy by hand (`bao policy read pulumi` +
 * append + `bao policy write pulumi -`), THEN flip this to `true`.
 */
const ENABLED = false;

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
    // kubernetes/apps/agents/agent-mcp-tools/agent-tools-servers/agent-debug-rbac.yaml's own header
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
        // (kubernetes/apps/agents/agent-mcp-tools/agent-tools-servers/openbao.yaml,
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

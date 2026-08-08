/**
 * OpenBao human login: OIDC against Authentik.
 *
 * This replaces the `oidc` subcommand of the vault repo's
 * `bootstrap/openbao/equestria-init.sh`. Everything here is barrier state —
 * auth methods, their config and their roles live *inside* OpenBao and are
 * written through its API, so unlike the seal and storage settings they can
 * never come from the HCL config file or an environment variable. That left
 * two options: a one-shot script, or a provider. A provider wins — the config
 * is then reviewable in git, drift is detected on every preview, and the
 * client credentials never have to be copied by hand, because the same Pulumi
 * run that creates the Authentik application produces them.
 *
 * What stays in the bootstrap script, and why it has to:
 *
 *   - `bao operator init` and the recovery shares. Pulumi authenticates to
 *     OpenBao with a token; init is what makes the first token exist. It
 *     cannot be expressed as a resource in the thing it is bootstrapping.
 *   - the `pulumi` AppRole itself, for the same reason — it is the credential
 *     this code authenticates with.
 *
 * Everything after that first token is a candidate for this file. See
 * `docs/openbao-pulumi-adoption.md` for the resources still held by the
 * script (KV mounts, the other policies, the kubernetes/approle backends) and
 * why adopting them needs `pulumi import` rather than a plain create.
 */

import * as pulumi from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";
import type { GlobalResources } from "../globals.ts";

/**
 * The Authentik OAuth2 client for OpenBao, as the `applications` stack writes
 * it to 1Password (`<cluster>-<app>-oidc-credentials`, created by
 * `AuthentikApplicationManager.createProvider`).
 *
 * `issuer` is the discovery URL and NOT `openid_configuration_url`: OpenBao
 * appends `/.well-known/openid-configuration` itself, so handing it the
 * already-suffixed form yields a 404 at login. The Authentik slug embedded in
 * it is a RandomPet, so this can never be hand-written either.
 */
interface OidcClientCredentials {
  client_id: string;
  client_secret: string;
  issuer: string;
}

export interface OpenBaoOidcArgs {
  globals: GlobalResources;
  /**
   * Title of the 1Password item holding the Authentik client credentials.
   * Defaults to the item the equestria `applications` stack generates.
   */
  credentialTitle?: string;
  /** Public URL of the OpenBao UI, used to build the login callback. */
  publicUrl?: string;
}

/**
 * Group → policy mapping. Deliberately small and explicit rather than derived:
 * these two bindings are the whole authorization model for human access, and
 * an accidental extra entry here is a privilege grant.
 */
const ROLE_BINDINGS = [
  { role: "admin", group: "admins", policy: "admin" },
  { role: "family", group: "family", policy: "viewer" },
] as const;

export class OpenBaoOidc extends pulumi.ComponentResource {
  public readonly backendPath: pulumi.Output<string>;

  constructor(name: string, args: OpenBaoOidcArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:openbao:oidc", name, args, opts);

    const { globals } = args;
    const credentialTitle = args.credentialTitle ?? "equestria-openbao-oidc-credentials";
    const publicUrl = args.publicUrl ?? "https://bao.equestria.driscoll.tech";

    // Resources here are provider-backed; without this they would target
    // whatever ambient Vault config happened to be in the environment.
    const cro = { parent: this, provider: globals.baoProvider };

    const credentials = globals.store.getSecretByTitle<OidcClientCredentials>(credentialTitle);

    // Read-only human access for the family group.
    //
    // SCOPE DECISION: `list` on secrets/metadata/* lets family browse the shape
    // of the tree; there is deliberately NO capability on secrets/data/*, so no
    // secret VALUE is readable. docs/ is fully readable because it holds
    // reference material rather than credentials. Widening this to real secret
    // reads should be a conscious, reviewed change — not a default.
    const viewer = new vault.Policy(
      "openbao-viewer",
      {
        name: "viewer",
        policy: `# Read-only human access (Authentik group: family). Managed by Pulumi.
# Browse the secret tree without reading any secret value.
path "secrets/metadata/*" {
  capabilities = ["list"]
}

# Reference documents are readable in full — docs/ carries no credentials.
path "docs/data/*" {
  capabilities = ["read"]
}
path "docs/metadata/*" {
  capabilities = ["read", "list"]
}
`,
      },
      cro,
    );

    // The OIDC auth method. `defaultRole` is the least-privileged of the two on
    // purpose: a login that does not match a more specific role gets `viewer`,
    // never `admin`.
    const backend = new vault.jwt.AuthBackend(
      "openbao-oidc",
      {
        path: "oidc",
        type: "oidc",
        description: "Authentik OIDC — human login. Managed by Pulumi.",
        oidcDiscoveryUrl: credentials.issuer,
        oidcClientId: credentials.client_id,
        oidcClientSecret: pulumi.secret(credentials.client_secret),
        defaultRole: "family",
      },
      cro,
    );

    // Must match the Authentik client's allowed redirect URIs EXACTLY or the
    // login fails with "unauthorized redirect_uri". Both are declared on the
    // openbao ApplicationDefinition in the equestria-cluster repo.
    //
    // The UI path contains "oidc" twice by design: /auth/<mount-path>/oidc/callback,
    // and the mount path here is itself "oidc". Port 8250 is the loopback
    // listener `bao login -method=oidc` spins up for the CLI flow.
    const allowedRedirectUris = [`${publicUrl}/ui/vault/auth/oidc/oidc/callback`, "http://localhost:8250/oidc/callback"];

    for (const { role, group, policy } of ROLE_BINDINGS) {
      new vault.jwt.AuthBackendRole(
        `openbao-oidc-${role}`,
        {
          backend: backend.path,
          roleName: role,
          roleType: "oidc",
          userClaim: "email",
          groupsClaim: "groups",
          // boundClaimsType defaults to "string" (exact match, no globbing).
          // Authentik sends `groups` as a list, and a list matches when any
          // element equals the bound value.
          boundClaims: { groups: group },
          tokenPolicies: [policy],
          oidcScopes: ["openid", "profile", "email"],
          allowedRedirectUris,
          // 8h: one working day, so a session does not outlive it, and short
          // enough that a group change in Authentik takes effect the same day.
          tokenTtl: 8 * 60 * 60,
        },
        { ...cro, dependsOn: policy === "viewer" ? [viewer] : [] },
      );
    }

    // The provider types `path` as optional because it defaults server-side;
    // we set it explicitly above, so the fallback is unreachable in practice.
    this.backendPath = backend.path.apply(p => p ?? "oidc");
    this.registerOutputs({ backendPath: this.backendPath });
  }
}

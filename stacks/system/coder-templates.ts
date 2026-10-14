/**
 * Coder's workspace templates, and the OpenBao login their workspaces use.
 *
 * The Terraform lives in `kubernetes/apps/coder/coder/templates`, next to the
 * deployment it belongs to. This file is what PUBLISHES it: it assembles each
 * template from the shared files it is built on (components/coderTemplates.ts
 * explains why a template cannot simply be uploaded as it sits), uploads the
 * result as a new template version whenever the content changes, and promotes
 * that version. Nobody runs `coder templates push`, and a template edited in
 * Coder's own editor is put back on the next run -- the repository is the
 * source.
 *
 * ## One directory, any number of templates
 *
 * `TEMPLATES` below is a list of (name, directory, variables). Two entries may
 * name the SAME directory with different variables, and that is the intended
 * way to get "a template for THIS repository": add an entry for `repository`
 * with its own `default_repository_url` rather than copying Terraform.
 *
 * ## Two kill switches, both off until a person has done their half
 *
 * Every other stack reads `clusters/<key>/details` from this one, so a new way
 * for it to go red has to be opt-in. Both of these read a credential or write
 * to a path that does not exist until somebody with more authority than this
 * stack has put it there, and a missing one fails the PREVIEW, not just the
 * resource.
 *
 * `TEMPLATES_ENABLED` needs a Coder API token at
 * `secrets/clusters/equestria/apps/coder/pulumi`, field `token`. Coder has no
 * way to mint one without a logged-in session, and password login is disabled
 * (CODER_DISABLE_PASSWORD_AUTH), so it is made by hand, once:
 *
 *     coder login https://code.<root domain>          # as an Owner
 *     coder tokens create --name pulumi --lifetime 8760h
 *     bao kv put secrets/clusters/equestria/apps/coder/pulumi token=<the token>
 *
 * The token carries its creator's permissions, and creating a template needs
 * Template Admin or Owner. It expires; `--lifetime` is capped by
 * CODER_MAX_TOKEN_LIFETIME, and when it lapses this module fails with a 401
 * and nothing else is affected until someone flips the switch off or renews it.
 *
 * `VAULT_JWT_ENABLED` needs the `pulumi` OpenBao policy widened to cover one
 * new auth mount and one new policy. The grants are in
 * bootstrap/openbao/equestria-init.sh write_policies(), under "Coder
 * workspaces"; applying them to the live policy is an `admin`-group action
 * through the OIDC login, the same way openbao-mcp.ts's grants were added.
 * Until then the templates install the Vault CLI and nothing logs in.
 *
 * ## Why a mount of its own
 *
 * A workspace logs in with the OIDC ACCESS TOKEN Coder holds for its owner --
 * no secret is stored in the template, and the login is the person's own. But
 * that token is issued by Coder's authentik application, and authentik gives
 * every application its own issuer URL. The existing `oidc` mount is bound to
 * OpenBao's application, so it rejects these tokens on `iss` before it looks
 * at anything else. Hence `auth/coder`, bound to Coder's issuer and audience.
 *
 * The access token lives for minutes. Coder refreshes it when a workspace is
 * built (the `offline_access` scope in the HelmRelease is what makes that
 * possible) and the login runs seconds later, so it is fresh when it is used;
 * the OpenBao token it buys lasts `VAULT_TOKEN_TTL_SECONDS`.
 */

import { oidcBaoPath } from "@components/bao.ts";
import { stageCoderTemplate } from "@components/coderTemplates.ts";
import { rootDomain } from "@components/domains.ts";
import type { GlobalResources } from "@components/globals.ts";
import * as coderd from "@pulumi/coderd";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
import * as vault from "@pulumi/vault";

/** Publish the templates. Needs the Coder API token -- see the header. */
const TEMPLATES_ENABLED = false;

/** Create the OpenBao auth mount and have workspaces log in. Needs the widened `pulumi` policy -- see the header. */
const VAULT_JWT_ENABLED = false;

/** Within the `secrets` mount. One field: `token`. */
const CODER_TOKEN_PATH = "clusters/equestria/apps/coder/pulumi";

/**
 * OpenBao as a workspace pod reaches it: the same in-cluster address the
 * ClusterSecretStore uses, so it does not depend on the gateway or on DNS for
 * the public name.
 */
const VAULT_ADDR = "http://openbao-active.kube-system.svc.cluster.local:8200";

/** `auth/<this>`. Must match the grants in bootstrap/openbao/equestria-init.sh. */
const VAULT_JWT_MOUNT = "coder";
const VAULT_JWT_ROLE = "workspace";
const VAULT_POLICY = "coder-workspace";

/** One working day, matching the human `oidc` roles in components/openbao/oidc.ts. */
const VAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

/**
 * A template variable's value. Coder hands every one to Terraform as a string,
 * so the templates declare list- and map-shaped variables as JSON strings and
 * `jsondecode` them; anything that is not already a string is encoded here.
 */
type TemplateVariable = string | string[] | Record<string, string[]>;

interface CoderTemplateDefinition {
  /** The template's name in Coder: lowercase, digits and hyphens. Renaming it REPLACES the template. */
  name: string;
  displayName: string;
  description: string;
  /** A path under Coder's own `/icon/`, or a URL. */
  icon: string;
  /** Directory under kubernetes/apps/coder/coder/templates. */
  directory: string;
  /** Template variables, on top of the ones every template gets. See that directory's main.tf for what it accepts. */
  variables?: Record<string, TemplateVariable>;
}

/**
 * The templates Coder offers.
 *
 * To offer a template that starts from a particular repository, or a
 * particular set, add an entry that reuses a directory:
 *
 *   {
 *     name: "docs",
 *     displayName: "Docs",
 *     description: "The documentation sites.",
 *     icon: "/icon/markdown.svg",
 *     directory: "repositories",
 *     variables: { default_repository_urls: ["git@host:owner/a.git", "git@host:owner/b.git"] },
 *   }
 */
const TEMPLATES: CoderTemplateDefinition[] = [
  {
    name: "repository",
    displayName: "Repository",
    description: "One repository, cloned and ready: editors, agents, its mise tools and its dev container.",
    icon: "/icon/git.svg",
    directory: "repository",
    variables: {
      default_repository_url: "",
    },
  },
  {
    name: "repositories",
    displayName: "Repositories",
    description: "Several repositories cloned side by side in one workspace.",
    icon: "/icon/folder.svg",
    directory: "repositories",
    variables: {
      default_repository_urls: [],
    },
  },
];

export interface CoderTemplatesArgs {
  globals: GlobalResources;
}

export class CoderTemplatesComponent extends ComponentResource {
  constructor(args: CoderTemplatesArgs, opts?: ComponentResourceOptions) {
    super("custom:coder:templates", "coder-templates", args, opts);

    // The mount first: when it is on, the templates are told the role to log
    // in with, and a workspace must not be handed a role that does not exist.
    const vaultLogin = VAULT_JWT_ENABLED ? this.configureVaultLogin(args.globals) : undefined;

    if (!TEMPLATES_ENABLED) return;

    const token = vault.kv.getSecretV2Output({ mount: "secrets", name: CODER_TOKEN_PATH }, { provider: args.globals.baoProvider });

    const provider = new coderd.Provider(
      "coder",
      {
        // The one URL Coder answers on -- see kubernetes/apps/coder/coder/ks.yaml
        // for why there is no second hostname.
        url: `https://code.${rootDomain()}`,
        token: token.data.apply(d => pulumi.secret(d.token)),
      },
      { parent: this },
    );

    // What every template is told, whatever it clones. Empty `vault_jwt_role`
    // means "install the CLI, do not log in" -- see tools.tf in the workspace
    // module for why a login that cannot succeed must not be attempted.
    const commonVariables: Record<string, TemplateVariable> = {
      namespace: "coder",
      vault_addr: VAULT_ADDR,
      vault_jwt_auth_path: VAULT_JWT_MOUNT,
      vault_jwt_role: vaultLogin ? VAULT_JWT_ROLE : "",
    };

    for (const template of TEMPLATES) {
      const variables = { ...commonVariables, ...template.variables };

      new coderd.Template(
        `coder-template-${template.name}`,
        {
          name: template.name,
          displayName: template.displayName,
          description: template.description,
          icon: template.icon,
          versions: [
            {
              // Staged at program start, so the directory exists by the time
              // the provider hashes it. A change to any file under it -- the
              // template's own, a shared one or a module -- is a new hash, and
              // a new hash is a new version. No `name`: Coder generates one,
              // and a fixed name would have to change with every edit.
              directory: stageCoderTemplate({ template: template.directory }),
              active: true,
              // Sorted so the list does not reorder itself between runs.
              tfVars: Object.keys(variables)
                .sort()
                .map(name => {
                  const value = variables[name];
                  return { name, value: typeof value === "string" ? value : JSON.stringify(value) };
                }),
            },
          ],
        },
        // The role has to exist before a workspace built from this version
        // tries to log in with it.
        { parent: this, provider, dependsOn: vaultLogin ? [vaultLogin] : [] },
      );
    }
  }

  /**
   * `auth/coder`: OpenBao trusting the OIDC access tokens authentik issues to
   * Coder, and what a workspace is allowed to do once it has logged in.
   */
  private configureVaultLogin(globals: GlobalResources): pulumi.Resource {
    const cro = { parent: this, provider: globals.baoProvider };

    // Written by stacks/system/applications.ts when it creates Coder's
    // authentik application; the same secret the HelmRelease's
    // CODER_OIDC_ISSUER_URL comes from.
    const oidc = vault.kv.getSecretV2Output({ mount: "secrets", name: oidcBaoPath("equestria", "coder") }, { provider: globals.baoProvider });
    const issuer = oidc.data.apply(d => d.issuer);
    const clientId = oidc.data.apply(d => d.client_id);

    const backend = new vault.jwt.AuthBackend(
      "coder-jwt",
      {
        path: VAULT_JWT_MOUNT,
        // `jwt`, not `oidc`: nothing is redirected anywhere. A workspace
        // presents a token it already has and OpenBao checks the signature
        // against the issuer's published keys.
        type: "jwt",
        description: "Coder workspaces: login with the owner's authentik access token. Managed by Pulumi.",
        // The issuer as authentik publishes it. OpenBao appends
        // `/.well-known/openid-configuration` itself -- see the same note in
        // components/openbao/oidc.ts.
        oidcDiscoveryUrl: issuer,
        boundIssuer: issuer,
      },
      cro,
    );

    // SCOPE DECISION: a workspace gets its owner a private corner of the KV
    // mount and NOTHING else -- no estate secret is readable from a workspace.
    // The path is templated on the login's alias name, which is the token's
    // `sub`; Coder's authentik provider uses `subMode: user_email`, so that is
    // the person's email address. Widening this is a conscious, reviewed
    // change, exactly like the `viewer` policy in components/openbao/oidc.ts.
    const policy = new vault.Policy(
      "coder-workspace",
      {
        name: VAULT_POLICY,
        policy: pulumi.interpolate`# Coder workspaces (auth/${VAULT_JWT_MOUNT}, role ${VAULT_JWT_ROLE}). Managed by Pulumi.
# A private subtree per person, keyed by the email address they sign in with.
path "secrets/data/coder/{{identity.entity.aliases.${backend.accessor}.name}}/*" {
  capabilities = ["create", "read", "update", "delete"]
}
path "secrets/metadata/coder/{{identity.entity.aliases.${backend.accessor}.name}}/*" {
  capabilities = ["read", "list", "delete"]
}
`,
      },
      cro,
    );

    return new vault.jwt.AuthBackendRole(
      "coder-jwt-workspace",
      {
        backend: backend.path,
        roleName: VAULT_JWT_ROLE,
        roleType: "jwt",
        userClaim: "sub",
        // The token must have been issued TO Coder. Without this, a token
        // authentik issued to any other application under the same signing
        // key and issuer shape would be one misconfiguration away from
        // working here.
        boundAudiences: [clientId],
        tokenPolicies: [policy.name],
        tokenTtl: VAULT_TOKEN_TTL_SECONDS,
        tokenMaxTtl: VAULT_TOKEN_TTL_SECONDS,
      },
      cro,
    );
  }
}

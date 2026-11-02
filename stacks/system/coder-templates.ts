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
 * ## Two kill switches
 *
 * Every other stack reads `clusters/<key>/details` from this one, so each new
 * way for it to go red has a switch that turns it off again.
 *
 * `TEMPLATES_ENABLED`: the token Pulumi publishes with, and the templates.
 * Nobody makes the token by hand. Coder can only mint one for a logged-in
 * session, and password login is off (CODER_DISABLE_PASSWORD_AUTH), so this
 * file does what `coder tokens create` would have done:
 *
 *   1. generates the token itself -- a 10-character id and a 22-character
 *      secret, the shape coderd/apikey/apikey.go makes -- and keeps it in
 *      OpenBao at `secrets/clusters/equestria/apps/coder/pulumi`;
 *   2. runs a Job in the `coder` namespace that creates a `pulumi` Owner and
 *      inserts the token's SHA-256 for it, straight into Coder's database
 *      (kubernetes/apps/coder/coder/resources/pulumi-token-job.yaml explains
 *      both steps, and why the second is the fragile one);
 *   3. waits for that Job, then publishes the templates with the token.
 *
 * To rotate it, `pulumi up --replace` the `coder-pulumi-token-secret`
 * resource: the Job re-runs, and revokes the old token as it adds the new one.
 * It also expires after `TOKEN_LIFETIME_DAYS`.
 *
 * `VAULT_JWT_ENABLED`: the OpenBao auth mount workspaces log in through. It
 * needs the `pulumi` OpenBao policy grants in bootstrap/openbao/equestria-init.sh
 * write_policies(), under "Coder workspaces" -- applied to the live policy on
 * 2026-10-14. With it off the templates install the Vault CLI and nothing
 * logs in.
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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as coderd from "@pulumi/coderd";
import * as pk8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";
import { baoKvSecret, baoProvenance, oidcBaoPath } from "components/bao.ts";
import { stageCoderTemplate } from "components/coderTemplates.ts";
import { rootDomain } from "components/domains.ts";
import type { GlobalResources } from "components/globals.ts";
import { generateTailscaleKubeConfig } from "components/store/index.ts";
import * as yaml from "yaml";

/** Mint the token and publish the templates -- see the header. */
const TEMPLATES_ENABLED = true;

/** Create the OpenBao auth mount and have workspaces log in -- see the header. */
const VAULT_JWT_ENABLED = true;

/** Within the `secrets` mount. Pulumi writes it; nothing else needs to read it. */
const CODER_TOKEN_PATH = "clusters/equestria/apps/coder/pulumi";

/**
 * How long the token lives. It is checked only when it is used, so a token
 * that lapses fails the next run with a 401; replacing the secret (see the
 * header) mints a fresh one.
 */
const TOKEN_LIFETIME_DAYS = 365;

/** Where Coder's own deployment lives in the repository. */
const CODER_APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../kubernetes/apps/coder/coder");

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

/**
 * The token Job, from its YAML, with the Coder image tag filled in from the
 * HelmRelease. `coder server create-admin-user` writes Coder's database, so it
 * must be the same release as the server -- reading the version from the one
 * place Renovate bumps it keeps the two from drifting apart.
 */
// `any` because it is a parsed manifest; it is spread into a typed Job below.
function loadTokenJob(): any {
  const chartVersion = yaml
    .parseAllDocuments(readFileSync(path.join(CODER_APP_DIR, "helmrelease.yaml"), "utf8"))
    .map(doc => doc.toJS())
    .find(doc => doc?.kind === "HelmRelease")?.spec?.chart?.spec?.version;
  if (typeof chartVersion !== "string") {
    throw new Error(`No HelmRelease chart version in ${CODER_APP_DIR}/helmrelease.yaml; the token Job's Coder image cannot be pinned.`);
  }

  const job = yaml.parse(readFileSync(path.join(CODER_APP_DIR, "resources/pulumi-token-job.yaml"), "utf8"));
  for (const container of job.spec.template.spec.initContainers) {
    if (container.image === "ghcr.io/coder/coder") container.image = `ghcr.io/coder/coder:v${chartVersion}`;
  }
  return job;
}

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

    const { token, registered } = this.mintToken(args.globals);

    const provider = new coderd.Provider(
      "coder",
      {
        // The one URL Coder answers on -- see kubernetes/apps/coder/coder/ks.yaml
        // for why there is no second hostname.
        url: `https://code.${rootDomain()}`,
        token,
      },
      // The provider calls Coder as soon as it is configured, so it has to
      // wait for the Job that makes the token valid -- not just the
      // templates.
      { parent: this, dependsOn: [registered] },
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
   * The Coder API token Pulumi publishes with: generated here, registered
   * with Coder by a Job -- see the header and
   * kubernetes/apps/coder/coder/resources/pulumi-token-job.yaml.
   *
   * `registered` is the Job. Anything that uses the token must depend on it:
   * until it has finished, Coder answers the token with a 401.
   */
  private mintToken(globals: GlobalResources): { token: pulumi.Output<string>; registered: pulumi.Resource } {
    // Coder's own alphabet (cryptorand.Default: A-Z, a-z, 0-9) and lengths.
    const keyId = new random.RandomString("coder-pulumi-token-id", { length: 10, special: false }, { parent: this });
    const keySecret = new random.RandomPassword("coder-pulumi-token-secret", { length: 22, special: false }, { parent: this });

    const token = pulumi.secret(pulumi.interpolate`${keyId.result}-${keySecret.result}`);

    // For a person, or another tool, that wants to call Coder as `pulumi`.
    // Nothing in this stack reads it back: the token above is used directly.
    baoKvSecret(
      "coder-pulumi-token",
      {
        mount: "secrets",
        path: CODER_TOKEN_PATH,
        data: { token, username: "pulumi" },
        concealedFields: ["token"],
        customMetadata: baoProvenance({ source_title: "Coder API token (pulumi)" }),
      },
      { parent: this, provider: globals.baoProvider },
    );

    const kubernetes = new pk8s.Provider("coder-equestria", { kubeconfig: generateTailscaleKubeConfig("equestria", globals.tailscaleDomain) }, { parent: this });

    // The Job only ever sees what Coder stores: the id, and the secret's
    // SHA-256. A copy of this Secret is not a working token.
    const keySecretRef = new pk8s.core.v1.Secret(
      "coder-pulumi-token",
      {
        metadata: { namespace: "coder", labels: { "app.kubernetes.io/name": "coder-pulumi-token", "app.kubernetes.io/part-of": "coder" } },
        stringData: {
          KEY_ID: keyId.result,
          KEY_HASH: keySecret.result.apply(s => createHash("sha256").update(s).digest("hex")),
          LIFETIME_DAYS: String(TOKEN_LIFETIME_DAYS),
        },
      },
      { parent: this, provider: kubernetes },
    );

    const job = loadTokenJob();
    const registered = new pk8s.batch.v1.Job(
      "coder-pulumi-token",
      {
        ...job,
        spec: {
          ...job.spec,
          template: {
            ...job.spec.template,
            metadata: {
              ...job.spec.template.metadata,
              // A Job cannot be changed in place, and the Secret it reads is
              // not part of its spec. The key id is, here: a new token is a new
              // pod template, which makes Pulumi replace the Job, which runs
              // it again.
              annotations: { "driscoll.dev/coder-token-id": keyId.result },
            },
            spec: {
              ...job.spec.template.spec,
              containers: job.spec.template.spec.containers.map((container: pk8s.types.input.core.v1.Container) => ({
                ...container,
                envFrom: [{ secretRef: { name: keySecretRef.metadata.name } }],
              })),
            },
          },
        },
      },
      // Waits for the Job to SUCCEED, which is the point: the provider that
      // depends on this must not be configured with a token Coder does not
      // know yet. deleteBeforeReplace because the old Job holds nothing worth
      // keeping and two would race.
      { parent: this, provider: kubernetes, deleteBeforeReplace: true },
    );

    return { token, registered };
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

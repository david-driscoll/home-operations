/**
 * The Forgejo identity Renovate runs as.
 *
 * `kubernetes/apps/coder/renovate` gives the cluster a RenovateJob and an
 * ExternalSecret that reads `clusters/equestria/apps/renovate/credentials`.
 * This file is what PUTS something at that path: it creates the bot account on
 * the forge, mints its personal access token, grants it access to the
 * repositories it should manage, and writes the token to OpenBao — so the
 * Kubernetes half has a credential to read and nobody has to click through
 * Forgejo's UI to produce one.
 *
 * It lives in this stack because the output is estate configuration written
 * INTO OpenBao, which is what this stack is for, and because the credential it
 * needs (the forge's break-glass admin) is already at a path the `pulumi`
 * policy can read.
 *
 * ## This stack is a dependency root, so read this before enabling anything
 *
 * Every other stack reads `clusters/<key>/details` from here. Nothing else in
 * this stack talks to anything but OpenBao — deliberately, see the header of
 * index.ts. This module breaks that: it configures a provider pointed at
 * Forgejo, and a data source that reads the admin credential at PREVIEW time.
 * A forge that is down, or an admin password that has been rotated without
 * updating OpenBao, therefore fails `stacks/system`.
 *
 * That is survivable and is not the same as breaking the estate — the details
 * paths are already written and a failed apply does not unwrite them; what
 * stops is publishing UPDATES to them. But it is a new way for this stack to
 * go red, so `BOT_ENABLED` below is the rollback: flip it off and this module
 * makes no call at all, exactly like `ENGINE_ENABLED` in postgres-rotation.ts.
 *
 * ## Basic auth, not a token, and that is upstream's constraint
 *
 * The provider is configured with the admin's USERNAME and PASSWORD rather
 * than an API token. `forgejo_personal_access_token` cannot be created by a
 * caller who authenticated with a token — Forgejo's `/users/{username}/tokens`
 * route is `reqBasicOrRevProxyAuth()`, so a token-authenticated request gets a
 * 401 that the provider surfaces as "Authentication method not allowed, use
 * basic-auth". The same route is `reqSelfOrAdmin()`, which is what lets the
 * admin mint a token belonging to somebody else.
 *
 * A consequence worth stating: this means the estate's break-glass admin
 * password is handed to a Terraform provider on every run. It is read from
 * OpenBao and never leaves the process, but if that stops being acceptable the
 * alternative is a hand-made admin token, which is the manual step this file
 * exists to delete.
 */

import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import { awaitOutput } from "@components/helpers.ts";
import { adminGetAllOrgs, repoSearch } from "@llamaduck/forgejo-ts";
import { createClient, createConfig } from "@llamaduck/forgejo-ts/client";
import * as forgejo from "@pulumi/forgejo";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as vault from "@pulumi/vault";

/**
 * The token's scopes, and what each one is for. Renovate's Forgejo platform
 * docs list the first four; `read:package` is here because a repository whose
 * config resolves packages from the forge's own registry needs it and the
 * failure without it is a confusing 404 rather than a 403.
 *
 * `write:repository` covers repository WEBHOOKS as well as code — which the
 * renovate-operator needs, because `spec.webhook.sync` has it create and
 * maintain the hook on every discovered repository using this same token.
 */
type TOKEN_SCOPES =
  | "read:activitypub"
  | "write:activitypub"
  | "read:admin"
  | "write:admin"
  | "read:issue"
  | "write:issue"
  | "read:misc"
  | "write:misc"
  | "read:notification"
  | "write:notification"
  | "read:organization"
  | "write:organization"
  | "read:package"
  | "write:package"
  | "read:repository"
  | "write:repository"
  | "read:user"
  | "write:user";

/**
 * Team access units. `write` on code, issues and pull requests is the whole
 * job: branch a repository, open a PR, and keep the Dependency Dashboard issue
 * up to date. Nothing else is granted — no wiki, no releases, no actions.
 *
 * Currently UNUSED: the org-walking block that consumed it (adminGetAllOrgs ->
 * one `forgejo.Team` per organization with `includesAllRepositories`, plus a
 * `TeamMember` for the bot) was removed, so nothing grants the bot access to
 * anything yet. Kept because it is the shape that block needs if it comes
 * back, and re-deriving it means re-reading the provider's `units_map` docs.
 *
 * Exported only to keep the linter honest about that — an unused `const` is a
 * lint error, and silencing it with a comment would hide the real point, which
 * is that REPOSITORY ACCESS IS NOT WIRED UP. Until it is, Renovate
 * authenticates fine and discovers nothing.
 */
export const TEAM_UNITS = {
  "repo.code": "write",
  "repo.issues": "write",
  "repo.pulls": "write",
};

/** The bot's login. Shared by the user resource and every grant that filters it out. */
const RENOVATE_LOGIN = "renovate";

/** One page of the Forgejo API, and the instance default for MAX_RESPONSE_ITEMS. */
const PAGE_SIZE = 50;

/** Refuses to page forever if the API stops honouring `page`. 2000 repositories. */
const MAX_PAGES = 40;

/** A repository the bot needs a collaborator grant on, from {@link discoverForgejoTargets}. */
export interface ForgejoRepositoryTarget {
  /** Numeric id -- what `forgejo_collaborator` takes, and stable across renames. */
  id: number;
  /** `owner/name`, used for the Pulumi resource name and for reading a diff. */
  fullName: string;
}

/** What Renovate should be granted access to, resolved before the graph is built. */
export interface ForgejoTargets {
  organizations: string[];
  userRepositories: ForgejoRepositoryTarget[];
}

/**
 * An admin-authenticated Forgejo API client.
 *
 * Basic auth, same constraint as the provider: the admin token this component
 * mints is a Pulumi Output and does not exist yet at this point, so the call
 * authenticates with the admin's username and password out of OpenBao.
 */
async function forgejoAdminClient(globals: GlobalResources) {
  const domain = await awaitOutput(globals.searchDomain);
  const credentials = await vault.kv.getSecretV2({ mount: "secrets", name: "clusters/equestria/apps/forgejo/credentials" }, { provider: globals.baoProvider });

  const username = credentials.data.username;
  const password = credentials.data.password;
  if (!username || !password) {
    throw new Error("clusters/equestria/apps/forgejo/credentials is missing `username` or `password` — the Forgejo admin API cannot be reached, so repository access cannot be reconciled.");
  }

  return createClient(
    createConfig({
      // `/api/v1` BELONGS IN THE baseURL. The generated operations contribute
      // only the tail (`/admin/orgs`, `/repos/search`), and the SDK's own
      // default client is `https://swagger.json/api/v1` -- so a baseURL without
      // it sends every call to Forgejo's WEB UI instead of its API.
      //
      // That failure is not a 404. `/admin/orgs` is a real web route, and an
      // Authorization header is not a web session, so Forgejo answers 200 with
      // the login page: `throwOnError` sees success, and the first thing to
      // touch the body dies with `.map is not a function` on a string of HTML.
      baseURL: `https://git.${domain}/api/v1`,
      headers: {
        // `token <...>` is what an API token would use; basic auth is what
        // Forgejo requires for the admin routes this reaches.
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
    }),
  );
}

/**
 * Everything Renovate should be granted access to, resolved BEFORE the Pulumi
 * graph is built.
 *
 * Two mechanisms, because Forgejo has two kinds of owner:
 *
 *   organizations    one `renovate` team per org, `includesAllRepositories`,
 *                    so repositories created later are covered with no change
 *                    here. One resource pair per ORG.
 *   userRepositories one collaborator grant per repository, because a
 *                    user-owned repository has no team to join. One resource
 *                    per REPO, and a repository created later needs another
 *                    `pulumi up` -- which is what the nightly resync is for.
 *
 * ## Why this is a plain async function and not an `.apply()`
 *
 * The obvious shape is to read these lists off an Output and create the
 * resources inside the callback. Do not: resources registered inside an
 * `.apply()` are invisible to `pulumi preview`, and this estate has already
 * paid for that lesson once -- `stacks/home` invents ~40 deletions on every
 * preview because components/tailscale.ts builds resources that way. Resolving
 * the lists first and looping over plain arrays keeps the graph static and the
 * preview honest.
 *
 * ## Empty lists are legitimate, and neither one is guarded on length
 *
 * There are no organizations on this forge today, so `organizations` comes
 * back empty on every run and every repository is user-owned. Zero
 * `userRepositories` is equally legitimate -- a forge with nothing in it, which
 * this one was at cutover.
 *
 * What protects both is `throwOnError` on the API calls: a forge that is
 * unreachable, an admin password rotated without updating OpenBao, or a 403
 * raises rather than resolving to a short list. An empty array therefore means
 * the API said "none", not "the lookup failed".
 *
 * The residual risk it does NOT cover is a 200 carrying fewer entries than
 * really exist -- a visibility change, say. Because these arrays ARE the
 * resource graph, that would silently delete the teams and grants for whatever
 * went missing. Nothing in the API distinguishes that from the truth, so it is
 * named here rather than guarded against with a length check that would just
 * as happily fail on the real, empty state.
 */
export async function discoverForgejoTargets(globals: GlobalResources): Promise<ForgejoTargets> {
  const client = await forgejoAdminClient(globals);

  const orgResponse = await adminGetAllOrgs({ client, query: { limit: PAGE_SIZE }, throwOnError: true });
  const organizations = (orgResponse.data ?? []).map(org => org.name).filter((name): name is string => !!name);

  if (organizations.length >= PAGE_SIZE) {
    throw new Error(`Forgejo returned ${organizations.length} organizations, which is the page limit — paginate this call before trusting the list, or teams for the unseen organizations will be deleted.`);
  }

  const organizationLogins = new Set(organizations);
  const userRepositories: ForgejoRepositoryTarget[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await repoSearch({
      client,
      query: {
        limit: PAGE_SIZE,
        page,
        // Non-archived only. A collaborator cannot be added to an archived
        // repository -- Forgejo refuses every modification to one -- so
        // including them would fail the apply rather than widen the grant.
        archived: false,
        // `source` excludes forks AND mirrors. Mirrors are read-only, so
        // Renovate could not open a PR against one; forks are excluded to
        // match `skipForks: true` on the RenovateJob, which drops them at
        // discovery anyway. Granting on either would be a resource that buys
        // nothing.
        mode: "source",
      },
      throwOnError: true,
    });

    const repositories = response.data?.data ?? [];
    for (const repository of repositories) {
      const owner = repository.owner?.login;
      if (!owner || !repository.id || !repository.full_name) continue;
      // Organization-owned repositories are covered by the team, which also
      // covers the ones that do not exist yet. A collaborator grant on top
      // would be a second, weaker source of truth for the same access.
      if (organizationLogins.has(owner)) continue;
      // Forgejo rejects adding a repository's own owner as its collaborator,
      // so the bot's own repositories would fail the apply.
      if (owner === RENOVATE_LOGIN) continue;
      userRepositories.push({ id: repository.id, fullName: repository.full_name });
    }

    // A short page is the last page. Checked on the raw response rather than
    // on the filtered list, which is almost always shorter and would end the
    // loop early.
    if (repositories.length < PAGE_SIZE) {
      return { organizations: organizations.sort(), userRepositories: userRepositories.sort((a, b) => a.fullName.localeCompare(b.fullName)) };
    }
  }

  throw new Error(`Forgejo repository search did not terminate within ${MAX_PAGES} pages (${MAX_PAGES * PAGE_SIZE} repositories). Refusing to build the grant list from a truncated search.`);
}

export interface ForgejoConfigurationArgs {
  globals: GlobalResources;
  /**
   * What the bot should be granted, from {@link discoverForgejoTargets}.
   *
   * Passed in rather than discovered in the constructor, and that is the whole
   * point -- see the note on that function.
   */
  targets: ForgejoTargets;
}
export class ForgejoConfigurationComponent extends ComponentResource {
  public forgejoProvider;
  public forgejoToken;
  public renovateBot;

  constructor(args: ForgejoConfigurationArgs, opts?: ComponentResourceOptions) {
    super("custom:forgejo:configuration", "forgejo-configuration", args, opts);

    const adminCredentials = vault.kv.getSecretV2Output({ mount: "secrets", name: "clusters/equestria/apps/forgejo/credentials" }, { provider: args.globals.baoProvider });

    this.forgejoProvider = new forgejo.Provider(
      "forgejo",
      {
        host: pulumi.interpolate`https://git.${args.globals.searchDomain}`,
        username: adminCredentials.data.apply(d => d.username),
        password: adminCredentials.data.apply(d => pulumi.secret(d.password)),
      },
      { parent: this },
    );

    this.forgejoToken = new forgejo.PersonalAccessToken(
      "forgejo-admin-token",
      {
        user: adminCredentials.data.apply(d => d.username),
        name: "Pulumi Admin Token",
        // WRITE ONLY, NO MATCHING `read:`. Forgejo collapses a scope pair on
        // create -- ask for `read:repository` AND `write:repository` and it
        // stores just `write:repository`. Since `scopes` is ForceNew, the
        // program's 6 vs the API's 3 is a diff that can never converge:
        // every run replaces the token, and a replaced PAT is a NEW token,
        // so the estate would churn its admin credential nightly.
        scopes: ["write:repository", "write:organization", "write:admin"] as TOKEN_SCOPES[],
      },
      { provider: this.forgejoProvider, parent: this },
    );

    // The admin token, filed where every other estate credential is filed.
    //
    // It was a Kubernetes Secret in namespace `forgejo-system`, which could
    // never have worked for two independent reasons: no such namespace exists
    // (the forge is in `coder`), and this stack's ServiceAccount holds exactly
    // one ClusterRoleBinding -- `system:auth-delegator`, for the operator's
    // TokenReview call -- so it cannot create a Secret in any namespace at all.
    // GlobalResources builds no Kubernetes provider either.
    //
    // OpenBao is where this stack already has write access, and anything that
    // wants the token in-cluster gets it the way everything else does: an
    // ExternalSecret. Nothing reads it today.
    const adminToken = baoKvSecret(
      "forgejo-admin-token",
      {
        mount: "secrets",
        path: "clusters/equestria/apps/forgejo/admin-token",
        data: { token: this.forgejoToken.token },
        concealedFields: ["token"],
        customMetadata: baoProvenance({
          source_title: "Forgejo Pulumi admin token",
          source_tags: "forgejo",
        }),
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    // The Forgejo -> operator webhook shared secret. Generated here for the same
    // reason as the password: it has no meaning outside this pairing, so having
    // a human invent it only creates a step that can be skipped.
    const webhookToken = new random.RandomPassword(
      "forgejo-renovate-webhook-token",
      {
        length: 64,
        special: false,
      },
      { parent: this },
    );

    // The bot's own password, which nothing ever uses to log in: the provider
    // authenticates as the admin, and Renovate authenticates with the token.
    // Forgejo requires one to create the account, so it is generated here rather
    // than hand-made, and written to OpenBao alongside the token purely so a
    // human has a way back into the account if the token is ever revoked.
    this.renovateBot = this.createUser(
      {
        fullName: "Renovate Bot",
        login: RENOVATE_LOGIN,
        description: "Dependency updates. Managed by stacks/system; see docs/runbooks/renovate-forgejo.md.",
        active: true,
        admin: false,
        mustChangePassword: false,
        visibility: "limited",
        deactivateOnDestroy: true,
        location: "Equestria",
        // FALSE, and this is not a loosening -- it is what makes the bot
        // work at all.
        //
        // `prohibitLogin` reads like "this account may not sign in
        // interactively", which is exactly what you want for a bot. Forgejo
        // applies it to API TOKEN authentication too, so the PAT this
        // component mints is rejected:
        //
        //   GET /api/v1/user -> 403
        //   "This account is prohibited from signing in, please contact your
        //    site administrator."
        //
        // Renovate surfaces that as a bare `Authentication failure` at
        // initialization and then exits 0, so the discovery Job SUCCEEDS and
        // reports zero repositories -- indistinguishable from a forge with
        // nothing to manage. That is the whole reason this line is dangerous:
        // it fails silently in the one place nobody is looking.
        //
        // The account is still not interactively reachable in any useful
        // sense: it has no OIDC identity, and its password is generated,
        // written only to OpenBao, and used by nothing.
        prohibitLogin: false,
        allowGitHook: true,
      },
      // Same collapsing rule as the admin token above: `read:repository` and
      // `read:issue` are omitted because the `write:` of each implies them,
      // and asking for both makes `scopes` diff forever against what Forgejo
      // stores. What remains is exactly what the API reports back.
      ["write:repository", "read:user", "read:organization", "read:misc", "write:issue"] as TOKEN_SCOPES[],
      args.globals,
      this.forgejoProvider,
    );

    // Repository access. THIS is what decides what Renovate manages -- without
    // it the bot authenticates, discovery runs, and the project list comes back
    // empty, which is indistinguishable from a healthy estate with no work.
    //
    // A team per organization with `includesAllRepositories`, so a repository
    // created next month is covered with no change here. The alternative --
    // a `forgejo_collaborator` per repository from a hand-maintained list --
    // makes every new repository a commit.
    //
    // Built from a plain array, NOT inside an `.apply()`. The version this
    // replaces called `adminGetAllOrgs` on a Pulumi Output and registered the
    // Team/TeamMember resources in the apply callback. Resources created that
    // way are invisible to `pulumi preview`, which is exactly how this estate
    // got ~40 phantom deletes out of `stacks/home` (components/tailscale.ts
    // building resources inside an apply). See discoverForgejoOrganizations
    // for how the list is resolved before the graph is built instead.
    for (const org of args.targets.organizations) {
      const team = new forgejo.Team(
        `forgejo-renovate-${org}-team`,
        {
          organization: org,
          name: "renovate",
          description: "Dependency updates. Managed by stacks/system.",
          // `permission: read` with per-unit `write` is not a contradiction:
          // `permission` is the org-level baseline and `unitsMap` is what
          // actually governs each unit. `admin` here would force every unit to
          // `admin` too, which is far more than opening a pull request needs.
          permission: "read",
          includesAllRepositories: true,
          unitsMap: TEAM_UNITS,
        },
        { provider: this.forgejoProvider, parent: this },
      );

      new forgejo.TeamMember(
        `forgejo-renovate-${org}-team-member`,
        {
          teamId: team.teamId,
          user: this.renovateBot.user.login,
        },
        { provider: this.forgejoProvider, parent: team },
      );
    }

    // User-owned repositories, which have no team to join. One grant each, so
    // unlike the organization teams above this does NOT cover repositories
    // created later -- a new user repository is picked up by the next
    // `stacks/system` run, which the Stack CR does daily.
    //
    // `admin`, not `write`. This used to be `write` on the theory that the
    // `write:repository` TOKEN SCOPE covers webhooks (see the file header) --
    // it does not, for the COLLABORATOR PERMISSION checked here. Forgejo's
    // webhook-management route requires the caller be the repository owner or
    // a collaborator with `admin`-level access; `write` collaborators get a
    // 403 (`"user should be an owner or a collaborator with admin write of a
    // repository"`) the moment `spec.webhook.sync` tries to create/update the
    // hook, which is exactly what broke RenovateDiscoveryFailing for
    // home-operations/canary. `admin` here is still just repo-admin for THIS
    // one grant, not instance-admin -- it does not touch org/site settings.
    for (const repository of args.targets.userRepositories) {
      new forgejo.Collaborator(
        `forgejo-renovate-collaborator-${repository.fullName.replace("/", "-")}`,
        {
          // The numeric id, not the slug: it survives a rename, where the
          // Pulumi resource NAME above does not -- a renamed repository
          // replaces the grant rather than silently leaving the old one
          // pointing at a repository that moved.
          repositoryId: repository.id,
          user: this.renovateBot.user.login,
          permission: "admin",
        },
        { provider: this.forgejoProvider, parent: this },
      );
    }

    // The operator's UI session key. Not a Forgejo credential at all, and it
    // lands under a DIFFERENT app prefix (`renovate-operator`, matching the
    // Kubernetes app of that name) -- but it is generated, has no meaning outside
    // this pairing, and the alternative is a `bao kv put` in a runbook that
    // somebody eventually skips. Without it the operator mints a new key every
    // startup and every UI session dies with the pod.
    const sessionSecretPassword = new random.RandomPassword(
      "renovate-operator-session-secret",
      {
        length: 64,
        special: false,
      },
      { parent: this },
    );

    const sessionSecret = baoKvSecret(
      "renovate-session-secret",
      {
        mount: "secrets",
        path: "clusters/equestria/apps/renovate-operator/session_secret",
        data: { session_secret: sessionSecretPassword.result },
        concealedFields: ["session_secret"],
        customMetadata: baoProvenance({
          source_title: "Renovate operator session key",
          source_tags: "renovate",
        }),
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    // The path kubernetes/apps/coder/renovate/externalsecret.yaml reads. Field
    // names are load-bearing on the other side: that ExternalSecret prefixes
    // everything it extracts with `credentials_`, so `forgejo_token` here is
    // `.credentials_forgejo_token` there.
    const renovateCredentials = baoKvSecret(
      "renovate-credentials",
      {
        mount: "secrets",
        path: `clusters/equestria/apps/renovate-operator/credentials`,
        data: {
          forgejo_token: this.renovateBot.token.token,
          webhook_token: webhookToken.result,
          bot_password: this.renovateBot.password.result,
        },
        concealedFields: ["forgejo_token", "webhook_token", "bot_password"],
        customMetadata: baoProvenance({
          source_title: "Forgejo Renovate Bot",
          source_tags: "renovate,forgejo",
        }),
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    this.registerOutputs({
      adminToken,
      sessionSecret,
      renovateCredentials,
    });
  }

  private createUser(details: Omit<forgejo.UserArgs, "password" | "email">, scopes: TOKEN_SCOPES[], globals: GlobalResources, forgejoProvider: forgejo.Provider) {
    const password = new random.RandomPassword(
      "forgejo-renovate-password",
      {
        length: 48,
        // No punctuation. It travels through `forgejo admin`-shaped code paths and
        // there is nothing to gain from the extra entropy at 48 characters.
        special: false,
      },
      { parent: this },
    );

    const user = new forgejo.User(
      "forgejo-renovate",
      {
        email: pulumi.interpolate`${details.login}@git.${globals.searchDomain}`,
        password: password.result,
        ...details,
      },
      { provider: forgejoProvider, parent: this },
    );

    const token = new forgejo.PersonalAccessToken(
      "forgejo-renovate-token",
      {
        user: user.login,
        name: "Renovate Bot Token",
        scopes: scopes,
      },
      {
        provider: forgejoProvider,
        // Every field on this resource forces replacement upstream (name, user
        // and scopes are all `RequiresReplace`), and the token is only ever
        // returned by the CREATE call. Stating it here makes the consequence
        // explicit: editing TOKEN_SCOPES mints a NEW token, and the old one
        // stops working the moment the replacement is deleted -- so the OpenBao
        // write below and the ExternalSecret's 4m refresh are what close the
        // gap. Create the new one first.
        deleteBeforeReplace: false,
        parent: user,
      },
    );
    return { user, token, password };
  }
}

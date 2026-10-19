/**
 * The Forgejo copy of this repository, and the credentials that keep its
 * `main` in step with GitHub's.
 *
 * The point is to let the in-cluster Renovate (kubernetes/apps/coder/renovate)
 * work on `david-driscoll/home-operations`. That bot speaks Forgejo, so the
 * repository has to exist there as an ordinary one it can open pull requests
 * against -- not a Forgejo pull mirror, which is read-only. Two things then
 * keep the copy honest, and both are the one workflow
 * `.forgejo/workflows/github-sync.yml`, which travels inside the repository:
 *
 *   GitHub -> Forgejo   Flux raises an event when GitHub's main moves, and
 *                       kubernetes/apps/coder/forgejo-github-sync dispatches
 *                       the workflow with the token minted here.
 *   Forgejo -> GitHub   a merge on Forgejo starts the workflow, which checks
 *                       the new commits and fast-forwards GitHub with the
 *                       deploy key minted here.
 *
 * docs/runbooks/forgejo-github-mirror.md has the rest, including the two
 * things on GitHub this file does NOT do.
 *
 * ## Why not Forgejo's own push mirror
 *
 * It is the obvious tool and it is the wrong one here. A push mirror always
 * pushes with `--force` (services/mirror/mirror_push.go: `+` refspecs and
 * `Force: true`, branch filter or not), so the moment the two sides diverge it
 * replaces GitHub's main with Forgejo's. And it publishes whatever lands, with
 * no step in which a commit can be read first -- on a forge whose every merge
 * commit is stamped with an address under the private domain. The workflow
 * does the same job with a fast-forward and a look at each commit.
 *
 * ## Its own organization, not `home-operations`, and claude-code read-only
 *
 * Whoever can write to this repository's main can publish to GitHub's without
 * a pull request there. Every organization on the forge gets a `claude-code`
 * team with write access to all of its repositories (./forgejo-renovate.ts),
 * so putting this repository in `home-operations` would hand that to every
 * agent session.
 *
 * So it lives in an organization of its own, {@link MIRROR_ORG}, which
 * ./forgejo-renovate.ts skips when it hands out claude-code's write teams
 * (GITHUB_MIRROR_ORG). What can reach the repository:
 *
 *   renovate             admin, from the per-org team in ./forgejo-renovate.ts,
 *                        on the run after this one creates the organization
 *   github-mirror-sync   write, from a collaborator grant below; its token is
 *                        what the relay dispatches the sync workflow with,
 *                        and what that workflow pushes main with
 *   claude-code          read, from a team below: view, diff, comment, review
 *   the forge's admins   as owners of the organization
 *
 * Until 2026-10 the repository was owned by a USER called `github-mirror`,
 * for the same reason. docs/runbooks/forgejo-github-mirror.md has the
 * hand-run steps that turned it into this organization without changing the
 * repository's path.
 *
 * ## The deploy key: both halves from here, the ruleset not
 *
 * The key pair is generated here. The private half goes into the Forgejo
 * repository's Actions secrets and nowhere else; the public half is registered
 * on the GitHub repository as a deploy key with write access, through the same
 * GitHub App provider that manages the Flux webhook (components/globals.ts).
 *
 * That makes this the second stack to use that provider, and the first time
 * THIS stack talks to GitHub: an App that cannot manage deploy keys, or GitHub
 * being down, now fails a stack every other stack reads from. The App already
 * registers repository-level runners, which needs the same Administration
 * permission, so the first is not expected -- but it is unproven until the
 * first apply.
 *
 * A key alone publishes nothing. GitHub's ruleset on `main` still turns the
 * push away until "Deploy keys" is on its bypass list, and that one click is
 * deliberately left to a person: it is what lets something push to the branch
 * the cluster deploys from without a pull request.
 */

import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import * as forgejo from "@pulumi/forgejo";
import * as github from "@pulumi/github";
import type * as pulumi from "@pulumi/pulumi";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { type ForgejoConfigurationComponent, GITHUB_MIRROR_ORG, type TOKEN_SCOPES } from "./forgejo-renovate.ts";

/**
 * The organization that owns the mirror. The repository's path,
 * `github-mirror/home-operations`, is what every repository-scoped rule in
 * .github/renovate.json5 names, so this name must not change.
 */
const MIRROR_ORG = GITHUB_MIRROR_ORG;

/**
 * The account whose token dispatches the sync workflow. Also the committer on
 * commits the sync replays (.forgejo/workflows/github-sync.yml).
 */
const SYNC_LOGIN = "github-mirror-sync";

/**
 * The account that owns the forge's container images. Part of every image
 * reference (`git.<root domain>/estate-images/...`), and named in
 * .forgejo/workflows/pulumi-workspace-image.yml (IMAGE_OWNER) and
 * kubernetes/components/pulumi-workspace.
 */
const ESTATE_IMAGES_LOGIN = "estate-images";

/** `owner/name` on GitHub. The workflow builds both of its GitHub URLs from this. */
const UPSTREAM = "david-driscoll/home-operations";

/** The repository's name on Forgejo, under {@link MIRROR_ORG}. */
const REPOSITORY = "home-operations";

/**
 * claude-code's units on the mirror: enough to read code, issues, pull
 * requests and Actions logs, and to comment on and review a pull request.
 * Nothing at `write`. See the header.
 */
const CLAUDE_CODE_MIRROR_UNITS = {
  "repo.code": "read",
  "repo.issues": "read",
  "repo.pulls": "read",
  "repo.actions": "read",
};

/**
 * The status `main` requires before a pull request can merge, posted by
 * .forgejo/workflows/merge-window.yml. It has to match that workflow's
 * MERGE_WINDOW_CONTEXT letter for letter.
 */
const MERGE_WINDOW_CONTEXT = "merge-window";

export interface ForgejoGithubMirrorArgs {
  globals: GlobalResources;
  /** For its provider and its `createUser`; nothing here authenticates on its own. */
  forgejo: ForgejoConfigurationComponent;
}

export class ForgejoGithubMirrorComponent extends ComponentResource {
  constructor(args: ForgejoGithubMirrorArgs, opts?: ComponentResourceOptions) {
    super("custom:forgejo:github-mirror", "forgejo-github-mirror", args, opts);

    const provider = args.forgejo.forgejoProvider;

    // `public`. The instance is REQUIRE_SIGNIN_VIEW, so in practice that is
    // signed-in accounts only, as `limited` was; the repository itself stays
    // private either way. Owned by whoever the
    // provider authenticates as -- the forge's admin -- and nobody else.
    const organization = new forgejo.Organization(
      "forgejo-github-mirror-organization",
      {
        name: MIRROR_ORG,
        fullName: "GitHub Mirror",
        description: "The forge's copy of GitHub's home-operations. Managed by stacks/system; see docs/runbooks/forgejo-github-mirror.md.",
        location: "Equestria",
        visibility: "public",
        // Only the org's owners decide who can reach the repository.
        repoAdminChangeTeamAccess: false,
      },
      { provider, parent: this },
    );

    // Same construction as the two accounts in forgejo-renovate.ts, and the
    // same reasons: a generated password nothing logs in with, and
    // `prohibitLogin: false` because Forgejo applies that flag to token
    // authentication too.
    const syncBot = args.forgejo.createUser(
      {
        fullName: "GitHub Mirror Sync",
        login: SYNC_LOGIN,
        description: "Dispatches the github-sync workflow on github-mirror/home-operations. Managed by stacks/system; see docs/runbooks/forgejo-github-mirror.md.",
        active: true,
        admin: false,
        mustChangePassword: false,
        visibility: "limited",
        deactivateOnDestroy: true,
        location: "Equestria",
        prohibitLogin: false,
        allowGitHook: false,
        // Owns nothing and creates nothing; sees only the grant below.
        maxRepoCreation: 0,
        restricted: true,
      },
      // Two uses: the relay dispatches the sync workflow with it, which
      // Forgejo files under repository write, and the workflow clones and
      // pushes this repository with it (MIRROR_SYNC_TOKEN), because the job
      // token cannot push to the protected main.
      ["write:repository"] as TOKEN_SCOPES[],
      args.globals,
      provider,
      { resourcePrefix: "forgejo-github-mirror-sync", tokenName: "Sync dispatch", versionTokenName: true },
    );

    // The account that OWNS the images .forgejo/workflows/pulumi-workspace-image.yml
    // builds: `git.<root domain>/estate-images/pulumi-workspace`. A user rather
    // than this organization, because a user can always write its own packages
    // with a `write:package` token; pushing to an organization's would take a
    // team with the packages unit, and every team here is a grant on this
    // repository too. docs/kubernetes/pulumi-workspace-image.md.
    //
    // Two tokens, so each holder gets only its half:
    //
    //   push  write:package, an Actions secret on THIS repository
    //         (ESTATE_IMAGES_TOKEN below), read by that workflow only. Never
    //         given to a pull_request workflow -- see its header.
    //   pull  read:package, into OpenBao for the image pull secret in namespace
    //         `pulumi` (kubernetes/apps/pulumi/workspace-image). The instance is
    //         REQUIRE_SIGNIN_VIEW, so an anonymous pull is refused.
    const imagesBot = args.forgejo.createUser(
      {
        fullName: "Estate images",
        login: ESTATE_IMAGES_LOGIN,
        description: "Owns the container images built by github-mirror/home-operations' workflows. Managed by stacks/system; see docs/kubernetes/pulumi-workspace-image.md.",
        active: true,
        admin: false,
        mustChangePassword: false,
        // Its packages are as visible as it is: `limited` is every signed-in
        // account, which on this forge is everyone who can see anything.
        visibility: "limited",
        deactivateOnDestroy: true,
        location: "Equestria",
        // Forgejo applies this flag to token authentication too.
        prohibitLogin: false,
        allowGitHook: false,
        maxRepoCreation: 0,
        restricted: true,
      },
      ["write:package"] as TOKEN_SCOPES[],
      args.globals,
      provider,
      { resourcePrefix: "forgejo-estate-images", tokenName: "Image push", versionTokenName: true },
    );
    const imagesPullToken = new forgejo.PersonalAccessToken(
      "forgejo-estate-images-pull-token",
      {
        user: imagesBot.user.login,
        name: "Image pull (read:package)",
        scopes: ["read:package"] as TOKEN_SCOPES[],
      },
      // Create the replacement before deleting the old one, as createUser's
      // tokens do; the ExternalSecret's refresh closes the gap.
      { provider, parent: imagesBot.user, deleteBeforeReplace: false },
    );
    // Read by kubernetes/apps/pulumi/workspace-image/externalsecret.yaml
    // (`username`, `token`); field names are load-bearing there.
    baoKvSecret(
      "forgejo-estate-images-pull",
      {
        mount: "secrets",
        path: "clusters/equestria/apps/pulumi/workspace-image-pull",
        data: {
          username: imagesBot.user.login,
          token: imagesPullToken.token,
        },
        concealedFields: ["token"],
        customMetadata: baoProvenance({
          source_title: "Forgejo estate-images pull token",
          source_tags: "forgejo,pulumi",
        }),
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    const repository = new forgejo.Repository(
      "forgejo-github-mirror-repository",
      {
        // The same string the user-owned repository had, so this is not the
        // owner change that would replace -- re-import -- the repository. The
        // move itself is a hand-run transfer (see the header).
        owner: organization.name,
        name: REPOSITORY,
        description: `GitHub's ${UPSTREAM}; main is kept in step by .forgejo/workflows/github-sync.yml. Managed by stacks/system.`,
        // GitHub's copy is public. This one holds pull requests and Actions
        // logs that are not.
        private: false,

        // A one-time import, NOT a mirror: `mirror: true` makes the repository
        // read-only, and Renovate could then open nothing against it. From
        // here on the workflow is what moves main.
        //
        // It brings every branch GitHub had on the day -- an import cannot be
        // limited to one -- Mend's `renovate/*` ones included, and nothing
        // updates them afterwards. The workflow's `prune_branches` input
        // deletes them. Until someone runs it the forge's Renovate simply
        // takes the `renovate/*` ones over: its `gitAuthor` is the identity
        // Mend committed them with, so to it they are its own.
        cloneAddr: `https://github.com/${UPSTREAM}.git`,
        service: "git",
        mirror: false,

        // Issues for the Dependency Dashboard, pull requests for the updates,
        // Actions for the sync. The rest would only be somewhere for the copy
        // to drift from GitHub.
        hasIssues: true,
        hasPullRequests: true,
        hasActions: true,
        hasWiki: false,
        hasProjects: false,
        hasReleases: false,
        hasPackages: false,

        // REBASE OR FAST-FORWARD ONLY. Both land a pull request's own commits
        // and write no message. A merge commit or a squash is a commit Forgejo
        // composes -- from the web UI it carries a `Reviewed-on:` link to the
        // forge -- and the sync would refuse to publish it.
        //
        // Rebase is the default because it also works on a branch that is
        // behind main: fast-forward-only would have Renovate rebasing every
        // open pull request after each merge, and merging one per run.
        allowRebase: true,
        allowFastForwardOnlyMerge: true,
        allowMergeCommits: false,
        allowSquashMerge: false,
        allowRebaseExplicit: false,
        allowManualMerge: false,
        autodetectManualMerge: false,
        defaultMergeStyle: "rebase",
        allowRebaseUpdate: true,
        defaultUpdateStyle: "rebase",
        defaultDeleteBranchAfterMerge: true,
        defaultAllowMaintainerEdit: true,
        defaultBranch: "main",
        internalTracker: {
          allowOnlyContributorsToTrackTime: true,
          enableTimeTracker: false,
          enableIssueDependencies: false,
        },

        // Destroying this resource archives the repository rather than
        // deleting its pull requests along with it.
        archiveOnDestroy: true,
      },
      {
        provider,
        parent: this,
        // The import happens once, at create. All three force a replacement,
        // and a provider that read any of them back differently would have the
        // next run delete the repository to "fix" it.
        ignoreChanges: ["cloneAddr", "service", "mirror"],
      },
    );

    // The sync bot's access: `write`, because Forgejo files workflow dispatch
    // under it. A collaborator grant rather than a team so that it holds
    // whoever owns the repository -- it is what kept the relay working across
    // the hand-run transfer into the organization. The user that owned the
    // repository before had owner rights here; this is less.
    const syncCollaborator = new forgejo.Collaborator(
      "forgejo-github-mirror-collaborator-sync",
      {
        // The numeric id, as for Renovate's grants: it survives a rename.
        repositoryId: repository.repositoryId,
        user: syncBot.user.login,
        permission: "write",
      },
      { provider, parent: repository },
    );

    // `claude-code` READS this repository, and that is all. It is a restricted
    // account (./forgejo-renovate.ts), so without a grant of its own the Forgejo
    // MCP server answers every call here -- the pull request, its diff, a file
    // on main -- with "The target couldn't be found", and an agent asked to
    // review one of the forge's Renovate PRs cannot even open it.
    //
    // `read`, never more. Write here is write to main, and main is what the
    // sync publishes to GitHub -- see the header. Read is enough to view, diff,
    // comment on and review a pull request; it cannot push, merge or change
    // settings. A team covering the whole organization, so a second repository
    // here would be readable too and nothing more.
    const claudeCodeTeam = new forgejo.Team(
      "forgejo-github-mirror-claude-code-team",
      {
        organization: organization.name,
        name: "claude-code",
        description: "Claude Code (agentboard), read-only. Managed by stacks/system.",
        permission: "read",
        includesAllRepositories: true,
        unitsMap: CLAUDE_CODE_MIRROR_UNITS,
        canCreateOrgRepo: false,
      },
      { provider, parent: organization },
    );

    new forgejo.TeamMember(
      "forgejo-github-mirror-claude-code-team-member",
      {
        teamId: claudeCodeTeam.teamId,
        user: args.forgejo.claudeCode.user.login,
      },
      { provider, parent: claudeCodeTeam },
    );

    // `main` merges only inside the merge window: a pull request needs the
    // `merge-window` status green, which .forgejo/workflows/merge-window.yml
    // posts only while the window is open. "Merge when checks succeed" then
    // waits for it. docs/runbooks/forgejo-merge-window.md is the long version.
    //
    // PUSH IS ALLOWED TO TWO ACCOUNTS, and they are the only things that push
    // to this main without a pull request:
    //
    //   github-mirror-sync  .forgejo/workflows/github-sync.yml fast-forwards
    //                       this main to GitHub's, with this account's token
    //                       (MIRROR_SYNC_TOKEN below)
    //   renovate            its branch automerge for GitHub Actions updates
    //
    // NOT THE JOB TOKEN. A protected branch makes Forgejo's pre-receive hook
    // look the pusher up by id (routers/private/hook_pre_receive.go,
    // preReceiveBranch), and the job token pushes as the Actions user, -2,
    // which is not in the user table: every push fails with a 500, "Unable to
    // GetUserByID ... user does not exist [uid: -2]", whatever this rule says.
    // That froze the sync from 2026-10-17 18:47, when the rule first landed.
    //
    // A required status gates merging a pull request, not a push, so neither
    // account waits for the window.
    //
    // NEVER A FORCE PUSH. Forgejo refuses every non-fast-forward update of a
    // protected branch before it reads any allow-list, admins included. The
    // sync's two leased pushes to this main -- replaying Forgejo's commits
    // after the two sides diverge, and `discard_local` -- are refused for as
    // long as this rule exists. docs/runbooks/forgejo-merge-window.md says how
    // to get through one.
    //
    // Every field the provider allows is set, defaults included. The provider
    // gives each one left out a default rather than reading the forge's value,
    // so a box ticked in the UI still shows up as drift. The allow-lists are
    // the exception: the provider refuses `*WhitelistUsernames`, `*Teams` and
    // `pushWhitelistDeployKeys` outright, even empty or false, unless their
    // `enable*Whitelist` is true. Left out, they default to empty.
    new forgejo.BranchProtection(
      "forgejo-github-mirror-branch-protection-main",
      {
        repositoryId: repository.repositoryId,
        branchName: "main",

        enablePush: true,
        enablePushWhitelist: true,
        // Forgejo drops an allow-listed user who has no write on the
        // repository, silently: the sync bot's comes from the collaborator
        // grant above, Renovate's from its team in ./forgejo-renovate.ts.
        pushWhitelistUsernames: [syncBot.user.login, args.forgejo.renovateBot.user.login],
        pushWhitelistTeams: [],
        pushWhitelistDeployKeys: false,

        // A required pattern that matches no status on a pull request counts
        // as pending (services/pull/commit_status.go), so every one here must
        // be posted on EVERY pull request, or that pull request never merges:
        //
        //   merge-window             .forgejo/workflows/merge-window.yml
        //   flate*                   .forgejo/workflows/flate.yml, both jobs;
        //                            several matches, the worst one counts
        //   renovate/stability-days  every Renovate update here (the first
        //                            mirror rule in .github/renovate.json5).
        //                            A pull request Renovate did not open never
        //                            gets it, so on this copy only Renovate's
        //                            pull requests can merge.
        //
        // Not `Image Check*`: .forgejo/workflows/image-check.yml runs only for
        // docker/**, so requiring it would block every other pull request.
        // Renovate still waits for it where it runs, since it waits for every
        // status.
        enableStatusCheck: true,
        statusCheckContexts: [MERGE_WINDOW_CONTEXT, "flate*", "renovate/stability-days"],

        // Renovate's pull requests merge unreviewed, and rebase only when they
        // conflict (`rebaseWhen: conflicted`), so neither reviews nor an
        // up-to-date branch can be required here.
        requiredApprovals: 0,
        enableApprovalsWhitelist: false,
        dismissStaleApprovals: false,
        blockOnRejectedReviews: true,
        blockOnOfficialReviewRequests: true,
        blockOnOutdatedBranch: false,

        enableMergeWhitelist: false,

        requireSignedCommits: false,
        protectedFilePatterns: "",
        unprotectedFilePatterns: "",
      },
      { provider, parent: repository, dependsOn: [syncCollaborator] },
    );

    // What the workflow pushes to GitHub with. ed25519, as for claude-code's
    // key. To rotate: `pulumi up --replace` this resource. The Actions secret
    // and the deploy key below both follow it in the same run.
    const deployKey = new tls.PrivateKey("forgejo-github-mirror-deploy-key", { algorithm: "ED25519" }, { parent: this });

    // The public half, on GitHub. Write access is the point: a read-only key
    // could fetch a repository that is public anyway.
    //
    // The App's provider is scoped to the owner, so `repository` is the bare
    // name. Every argument here forces a replacement upstream; GitHub refuses
    // the same key twice, but a rotated key is a different key, so the default
    // create-then-delete order works and leaves no gap.
    new github.RepositoryDeployKey(
      "forgejo-github-mirror-deploy-key",
      {
        repository: UPSTREAM.split("/")[1],
        title: "forgejo-github-mirror (stacks/system)",
        // publicKeyOpenssh ends with a newline; GitHub stores the key trimmed
        // and the provider would then report a diff against its own copy.
        key: deployKey.publicKeyOpenssh.apply(key => key.trim()),
        readOnly: false,
      },
      { provider: args.globals.githubProvider, parent: this },
    );

    // Repository secrets and variables, read by name in the workflow. Forgejo
    // refuses names starting FORGEJO_, GITHUB_ or GITEA_, hence MIRROR_.
    const secrets: Record<string, pulumi.Input<string>> = {
      MIRROR_DEPLOY_KEY: deployKey.privateKeyOpenssh,
      // The two names scripts/private-domain-guard looks for in every commit
      // before it is published. Secrets so they stay out of the job log.
      PRIVATE_DOMAIN_ROOT: args.globals.searchDomain,
      PRIVATE_DOMAIN_TAILNET: args.globals.tailscaleDomain,
      // The renovate-operator's webhook bearer, so the workflow can ask for a
      // Renovate run of this repository when a sync finishes. It is the same
      // token the operator already writes onto every repository's webhook,
      // and all it can do is start a run.
      MIRROR_RENOVATE_TOKEN: args.forgejo.webhookToken,
      // What the sync clones and pushes this repository with: the sync bot's
      // own token, the one the relay already dispatches with. It has to be a
      // real account to push to the protected main (see the branch rule).
      MIRROR_SYNC_TOKEN: syncBot.token.token,
      // What .forgejo/workflows/pulumi-workspace-image.yml pushes the
      // workspace image with (write:package, estate-images' own packages).
      ESTATE_IMAGES_TOKEN: imagesBot.token.token,
    };
    for (const [name, data] of Object.entries(secrets)) {
      new forgejo.RepositoryActionSecret(`forgejo-github-mirror-secret-${name.toLowerCase().replaceAll("_", "-")}`, { repositoryId: repository.repositoryId, name, data }, { provider, parent: repository });
    }

    const variables: Record<string, string> = {
      // Its presence is also what tells the workflow this copy IS the mirror;
      // anywhere else the job exits without doing anything.
      MIRROR_UPSTREAM: UPSTREAM,
      // The in-cluster Service, as forgejo-runner uses, so the job's clone
      // does not go out through the gateway and back.
      MIRROR_FORGEJO_URL: "http://forgejo-http.coder.svc.cluster.local:3000",
      // The operator's "schedule one project" endpoint, scoped to the
      // RenovateJob in kubernetes/apps/coder/renovate. The workflow appends
      // `&project=<this repository>`. Without it the step does nothing.
      MIRROR_RENOVATE_URL: "http://renovate-operator.coder.svc.cluster.local:8082/webhook/v1/schedule?job=renovate&namespace=coder",
    };
    for (const [name, data] of Object.entries(variables)) {
      new forgejo.RepositoryActionVariable(`forgejo-github-mirror-variable-${name.toLowerCase().replaceAll("_", "-")}`, { repositoryId: repository.repositoryId, name, data }, { provider, parent: repository });
    }

    // Read by kubernetes/apps/coder/forgejo-github-sync/externalsecret.yaml
    // (`forgejo_token`, `repository`); field names are load-bearing there.
    const credentials = baoKvSecret(
      "forgejo-github-sync-credentials",
      {
        mount: "secrets",
        path: "clusters/equestria/apps/forgejo-github-sync/credentials",
        data: {
          forgejo_token: syncBot.token.token,
          bot_password: syncBot.password.result,
          repository: repository.fullName,
        },
        concealedFields: ["forgejo_token", "bot_password"],
        customMetadata: baoProvenance({
          source_title: "Forgejo GitHub mirror",
          source_tags: "forgejo,github",
        }),
      },
      { provider: args.globals.baoProvider, parent: this },
    );

    this.registerOutputs({ credentials });
  }
}

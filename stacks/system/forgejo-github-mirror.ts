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
 * ## Owned by an account, not by the `home-operations` organization
 *
 * Whoever can write to this repository's main can publish to GitHub's without
 * a pull request there. Every organization on the forge gets a `claude-code`
 * team with write access to all of its repositories (./forgejo-renovate.ts),
 * so an organization repository would hand that to every agent session. A
 * user-owned repository is reachable only by its owner, by Renovate -- which
 * gets its usual collaborator grant from the discovery in that file, on the
 * run after this one creates the repository -- and by the forge's admins.
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
import type { ForgejoConfigurationComponent, TOKEN_SCOPES } from "./forgejo-renovate.ts";

/** The account that owns the mirror. Also the committer on commits the sync replays. */
const MIRROR_LOGIN = "github-mirror";

/** `owner/name` on GitHub. The workflow builds both of its GitHub URLs from this. */
const UPSTREAM = "david-driscoll/home-operations";

/** The repository's name on Forgejo, under {@link MIRROR_LOGIN}. */
const REPOSITORY = "home-operations";

export interface ForgejoGithubMirrorArgs {
  globals: GlobalResources;
  /** For its provider and its `createUser`; nothing here authenticates on its own. */
  forgejo: ForgejoConfigurationComponent;
}

export class ForgejoGithubMirrorComponent extends ComponentResource {
  constructor(args: ForgejoGithubMirrorArgs, opts?: ComponentResourceOptions) {
    super("custom:forgejo:github-mirror", "forgejo-github-mirror", args, opts);

    const provider = args.forgejo.forgejoProvider;

    // Same construction as the two accounts in forgejo-renovate.ts, and the
    // same reasons: a generated password nothing logs in with, and
    // `prohibitLogin: false` because Forgejo applies that flag to token
    // authentication too.
    const owner = args.forgejo.createUser(
      {
        fullName: "GitHub Mirror",
        login: MIRROR_LOGIN,
        description: "Owns the GitHub mirror of home-operations. Managed by stacks/system; see docs/runbooks/forgejo-github-mirror.md.",
        active: true,
        admin: false,
        mustChangePassword: false,
        visibility: "limited",
        deactivateOnDestroy: true,
        location: "Equestria",
        prohibitLogin: false,
        allowGitHook: false,
        // Sees its own repository and nothing else on the forge.
        restricted: true,
      },
      // The token's one use is dispatching the sync workflow, which Forgejo
      // files under repository write. The workflow itself pushes with its job
      // token, not with this.
      ["write:repository"] as TOKEN_SCOPES[],
      args.globals,
      provider,
      { resourcePrefix: "forgejo-github-mirror", tokenName: "Sync dispatch", versionTokenName: true },
    );

    const repository = new forgejo.Repository(
      "forgejo-github-mirror-repository",
      {
        owner: owner.user.login,
        name: REPOSITORY,
        description: `GitHub's ${UPSTREAM}; main is kept in step by .forgejo/workflows/github-sync.yml. Managed by stacks/system.`,
        // GitHub's copy is public. This one holds pull requests and Actions
        // logs that are not.
        private: true,

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
          forgejo_token: owner.token.token,
          bot_password: owner.password.result,
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

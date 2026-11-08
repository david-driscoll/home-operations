/**
 * Forge-hosted app repositories: an app whose source, CI and cluster manifests
 * live on the forge, under the `home-operations` organization, rather than in
 * this repository. Flux deploys each one from a GitRepository on the forge;
 * the Flux Kustomization that applies it stays in this repository, under
 * kubernetes/apps, so it is patched and substituted like every other app.
 *
 * Each repository gets:
 *   - the repository itself, empty (autoInit off): its first commit is pushed
 *     by hand, and its history starts there;
 *   - a read grant for the forge's `flux` account (forgejo-renovate.ts), the
 *     credential its GitRepository clones with
 *     (clusters/equestria/apps/forgejo/flux);
 *   - the Actions secrets its image workflow needs: ESTATE_IMAGES_TOKEN to
 *     push to estate-images, PRIVATE_DOMAIN_ROOT to name the registry host
 *     without writing it in git;
 *   - a push webhook to a Flux Receiver on equestria, so a push reaches Flux
 *     at once instead of on the GitRepository's interval.
 *
 * Renovate needs nothing here: its `admin` team on every organization
 * (forgejo-renovate.ts) covers repositories created later.
 *
 * The first one is the region picker (docs/plans/wonderbolts-nuxt.md, phase 8).
 */

import * as k8s from "@kubernetes/client-node";
import * as forgejo from "@pulumi/forgejo";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
import type { GlobalResources } from "components/globals.ts";
import { awaitOutput } from "components/helpers.ts";
import { generateTailscaleKubeConfig } from "components/store/index.ts";
import { equestriaDefinition } from "./applications.ts";
import type { ForgejoConfigurationComponent } from "./forgejo-renovate.ts";

/** The organization the app repositories live in. It exists already; this stack does not manage it. */
const APP_REPOSITORY_ORG = "home-operations";

/**
 * The Flux Receiver the push webhooks call
 * (kubernetes/apps/flux-system/flux-instance/receiver.yaml, `forgejo-webhook`):
 * type `github`, which Forgejo's deliveries satisfy (they carry X-GitHub-Event
 * and X-Hub-Signature-256), signed with the same token as the GitHub one.
 */
const RECEIVER = { name: "forgejo-webhook", namespace: "flux-system", tokenSecret: "github-webhook-token-secret" } as const;

/**
 * notification-controller's webhook Service, in-cluster: Forgejo delivers to it
 * directly, no Funnel. It has to be in Forgejo's webhook ALLOWED_HOST_LIST
 * (kubernetes/apps/coder/forgejo/helmrelease.yaml), which names it exactly.
 */
const RECEIVER_SERVICE = "http://webhook-receiver.flux-system.svc.cluster.local";

interface AppRepository {
  name: string;
  description: string;
}

const APP_REPOSITORIES: readonly AppRepository[] = [
  {
    name: "wonderbolts",
    description: "The region picker (wonderbolts.<root domain>) and the region exits' agent: source, CI, images and the manifests Flux deploys. Managed by stacks/system.",
  },
];

export interface ForgejoAppRepositoriesArgs {
  globals: GlobalResources;
  forgejo: ForgejoConfigurationComponent;
  /** The estate-images account's write:package token (forgejo-github-mirror.ts). */
  imagesPushToken: pulumi.Input<string>;
}

/**
 * The Receiver's webhook path and token, read from equestria at run time, or
 * null while the Receiver is not there (the first run after this lands may
 * race Flux applying it). Then the webhooks are left for the next run, and the
 * GitRepositories still poll.
 */
async function receiverHook(globals: GlobalResources): Promise<{ path: string; token: string } | null> {
  const definition = equestriaDefinition();
  const kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromString(await awaitOutput(generateTailscaleKubeConfig(definition.key, globals.tailscaleDomain)));
  try {
    const receiver = (await kubeConfig.makeApiClient(k8s.CustomObjectsApi).getNamespacedCustomObject({
      group: "notification.toolkit.fluxcd.io",
      version: "v1",
      plural: "receivers",
      name: RECEIVER.name,
      namespace: RECEIVER.namespace,
    })) as { status?: { webhookPath?: string } };
    const secret = await kubeConfig.makeApiClient(k8s.CoreV1Api).readNamespacedSecret({ name: RECEIVER.tokenSecret, namespace: RECEIVER.namespace });
    const path = receiver.status?.webhookPath;
    const token = secret.data?.token ? Buffer.from(secret.data.token, "base64").toString("utf8") : "";
    if (!path || !token) {
      pulumi.log.warn(`Receiver ${RECEIVER.namespace}/${RECEIVER.name} has no webhook path or token yet; the app repositories' webhooks wait for the next run.`);
      return null;
    }
    return { path, token };
  } catch (error) {
    pulumi.log.warn(`Receiver ${RECEIVER.namespace}/${RECEIVER.name} is not readable yet (${String(error).slice(0, 200)}); the app repositories' webhooks wait for the next run.`);
    return null;
  }
}

export async function configureForgejoAppRepositories(args: ForgejoAppRepositoriesArgs): Promise<ForgejoAppRepositoriesComponent> {
  return new ForgejoAppRepositoriesComponent({ ...args, hook: await receiverHook(args.globals) });
}

export class ForgejoAppRepositoriesComponent extends ComponentResource {
  constructor(args: ForgejoAppRepositoriesArgs & { hook: { path: string; token: string } | null }, opts?: ComponentResourceOptions) {
    super("custom:forgejo:app-repositories", "forgejo-app-repositories", {}, opts);
    const provider = args.forgejo.forgejoProvider;

    for (const app of APP_REPOSITORIES) {
      const repository = new forgejo.Repository(
        `forgejo-app-repository-${app.name}`,
        {
          owner: APP_REPOSITORY_ORG,
          name: app.name,
          description: app.description,
          // Private: its Actions logs and pull requests are nobody else's.
          // (The instance is REQUIRE_SIGNIN_VIEW regardless.)
          private: true,
          autoInit: false,
          defaultBranch: "main",
          hasActions: true,
          hasIssues: true,
          hasPullRequests: true,
          hasPackages: false,
          hasProjects: false,
          hasReleases: false,
          hasWiki: false,
          allowSquashMerge: true,
          allowMergeCommits: false,
          allowRebase: false,
          allowRebaseExplicit: false,
          defaultMergeStyle: "squash",
          defaultDeleteBranchAfterMerge: true,
        },
        // A repository's history is not something to lose to a refactor here.
        { provider, parent: this, protect: true },
      );

      new forgejo.Collaborator(`forgejo-app-repository-${app.name}-flux`, { repositoryId: repository.repositoryId, user: args.forgejo.fluxReader.user.login, permission: "read" }, { provider, parent: repository });

      // Forgejo refuses secret names starting FORGEJO_, GITHUB_ or GITEA_.
      const secrets: Record<string, pulumi.Input<string>> = {
        ESTATE_IMAGES_TOKEN: args.imagesPushToken,
        PRIVATE_DOMAIN_ROOT: args.globals.searchDomain,
      };
      for (const [name, data] of Object.entries(secrets)) {
        new forgejo.RepositoryActionSecret(`forgejo-app-repository-${app.name}-secret-${name.toLowerCase().replaceAll("_", "-")}`, { repositoryId: repository.repositoryId, name, data }, { provider, parent: repository });
      }

      if (args.hook) {
        new forgejo.RepositoryWebhook(
          `forgejo-app-repository-${app.name}-flux-webhook`,
          {
            repositoryId: repository.repositoryId,
            type: "forgejo",
            active: true,
            events: ["push"],
            branchFilter: "main",
            config: {
              url: `${RECEIVER_SERVICE}${args.hook.path}`,
              content_type: "json",
              secret: args.hook.token,
            },
          },
          { provider, parent: repository },
        );
      }
    }
  }
}

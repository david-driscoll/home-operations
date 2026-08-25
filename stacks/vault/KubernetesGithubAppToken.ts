import { GithubAppToken } from "@components/GithubAppToken.ts";
import type { GlobalResources } from "@components/globals.ts";
import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
import kubernetes from "@pulumi/kubernetes";
import { ComponentResource, type ComponentResourceOptions, type Input, output } from "@pulumi/pulumi";

export interface KubernetesGithubAppTokensArgs {
  cluster: KubernetesClusterDefinition;
  globals: GlobalResources;
  kubernetes: kubernetes.Provider;
  credentials: Input<{
    github_app_id: string;
    github_app_installation_id: string;
    github_app_private_key: string;
  }>;
}

export class KubernetesGithubAppTokenComponent extends ComponentResource {
  constructor(name: string, args: KubernetesGithubAppTokensArgs, opts?: ComponentResourceOptions) {
    super("custom:github:apptokens", name, args, opts);

    const creds = output(args.credentials).apply(z => ({
      appId: z.github_app_id,
      installationId: z.github_app_installation_id,
      pemFile: z.github_app_private_key,
    }));

    const appToken = new GithubAppToken(
      `${name}-github-app-token`,
      {
        appId: creds.appId,
        installationId: creds.installationId,
        pemFile: creds.pemFile,
      },
      { parent: this, dependsOn: opts?.dependsOn },
    );

    const cro = {
      parent: this,
      provider: args.kubernetes,
    };

    new kubernetes.core.v1.SecretPatch(
      `${name}-github-app-token`,
      {
        metadata: {
          name: `github-token`,
          namespace: "kube-system",
          annotations: {
            "reflector.v1.k8s.emberstack.com/reflection-allowed": "true",
            "reflector.v1.k8s.emberstack.com/reflection-auto-enabled": "true",
            "reloader.stakater.com/auto": "true",
            // The token is an `additionalSecretOutputs` field, and a SecretPatch
            // carrying ONLY secret fields does not reliably re-apply when those
            // fields change: this Secret was last written by Pulumi on
            // 2026-06-07 even though the token behind it is re-minted correctly
            // (verified in state 2026-08-24 -- the dynamic resource had been
            // replaced minutes earlier while the live Secret still held a
            // June value).
            //
            // `expiresAt` is NOT secret and changes on every mint, so surfacing
            // it here does two things: it makes the patch's inputs visibly
            // different on each new token, and it forces the ordering, because
            // the patch cannot be computed before the resource it reads from.
            // In the broken state the patch was recorded as applied two seconds
            // BEFORE the token it was meant to carry.
            //
            // Do not remove this thinking it is decorative. It is the only
            // non-secret evidence that the value underneath changed.
            "driscoll.dev/token-expires-at": appToken.expiresAt,
          },
        },
        stringData: {
          token: appToken.token,
          access_token: appToken.token,
        },
      },
      { ...cro, deleteBeforeReplace: true },
    );
  }
}

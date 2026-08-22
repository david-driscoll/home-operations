import { GithubAppToken } from "@components/GithubAppToken.ts";
import type { GlobalResources } from "@components/globals.ts";
import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
import kubernetes from "@pulumi/kubernetes";
import { ComponentResource, type ComponentResourceOptions, CustomResourceOptions, dynamic, type Input, interpolate, log, output } from "@pulumi/pulumi";

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

    const authKeySecret = new kubernetes.core.v1.SecretPatch(
      `${name}-github-app-token`,
      {
        metadata: {
          name: `github-token`,
          namespace: "kube-system",
          annotations: {
            "reflector.v1.k8s.emberstack.com/reflection-allowed": "true",
            "reflector.v1.k8s.emberstack.com/reflection-auto-enabled": "true",
            "reloader.stakater.com/auto": "true",
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

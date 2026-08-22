import { Tailscale } from "@components/constants.ts";
import type { GlobalResources } from "@components/globals.ts";
import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
import { TailscaleAccessToken } from "@components/TailscaleAccessToken.ts";
import kubernetes from "@pulumi/kubernetes";
import { ComponentResource, type ComponentResourceOptions, type Input, interpolate, output } from "@pulumi/pulumi";
import { TailnetKey, Provider as TailscaleProvider } from "@pulumi/tailscale";

export interface KubernetesTailscaleAuthKeysArgs {
  cluster: KubernetesClusterDefinition;
  globals: GlobalResources;
  kubernetes: kubernetes.Provider;
  credentials: Input<{ hostname: string; username: string; credential: string }>;
}

export class KubernetesTailscaleAuthKeyComponent extends ComponentResource {
  constructor(name: string, args: KubernetesTailscaleAuthKeysArgs, opts?: ComponentResourceOptions) {
    super("custom:tailscale:authkeys", name, args, opts);

    const creds = output(args.credentials);
    const tailscaleProvider = new TailscaleProvider(
      `${name}-tailscale`,
      {
        oauthClientId: creds.username,
        oauthClientSecret: creds.credential,
      },
      { parent: this, dependsOn: opts?.dependsOn },
    );

    const tailscaleAppAuthkey = new TailnetKey(
      `${name}-app-authkey`,
      {
        reusable: true,
        preauthorized: true,
        ephemeral: false,
        recreateIfInvalid: "always",
        tags: [Tailscale.tag.apps],
        description: interpolate`${output(args.cluster).title} Cluster Management Key`,
      },
      { parent: this, dependsOn: opts?.dependsOn, provider: tailscaleProvider },
    );

    const tailscaleDnsAuthkey = new TailnetKey(
      `${name}-dns-authkey`,
      {
        reusable: true,
        preauthorized: true,
        ephemeral: false,
        recreateIfInvalid: "always",
        tags: [Tailscale.tag.dns],
        description: interpolate`${output(args.cluster).title} Cluster Management Key`,
      },
      { parent: this, dependsOn: opts?.dependsOn, provider: tailscaleProvider },
    );

    const accessToken = new TailscaleAccessToken(
      `${name}-access-token`,
      {
        credential: creds.credential,
        username: creds.username,
      },
      { parent: this },
    );

    const cro = {
      parent: this,
      provider: args.kubernetes,
    };

    const authKeySecret = new kubernetes.core.v1.SecretPatch(
      `${name}-tailscale-app-authkey`,
      {
        metadata: {
          name: `tailscale-authkey`,
          namespace: "tailscale-system",
          annotations: {
            "reflector.v1.k8s.emberstack.com/reflection-allowed": "true",
            "reloader.stakater.com/auto": "true",
          },
        },
        stringData: {
          authkey: tailscaleAppAuthkey.key,
        },
      },
      {
        ...cro,
        deleteBeforeReplace: true,
        // This resource was renamed from `${name}-tailscale-authkey` when the app/dns keys
        // were split apart. The underlying Secret (tailscale-system/tailscale-authkey) never
        // changed. Without this alias Pulumi treats the rename as create-new + delete-old, and
        // the new resource is issued a *fresh* server-side-apply field manager that collides
        // with the old resource's field manager -- which still owns `.data.authkey` on the
        // live Secret. The create then fails, the old resource is never deleted, and the
        // stack deadlocks on the same conflict every run. Aliasing adopts the existing state
        // entry (and its field manager), so this stays an in-place SSA update.
        aliases: [{ name: `${name}-tailscale-authkey` }],
      },
    );

    const dnsAuthKeySecret = new kubernetes.core.v1.SecretPatch(
      `${name}-tailscale-dns-authkey`,
      {
        metadata: {
          name: `tailscale-dns-authkey`,
          namespace: "tailscale-system",
          annotations: {
            "reflector.v1.k8s.emberstack.com/reflection-allowed": "true",
            "reloader.stakater.com/auto": "true",
          },
        },
        stringData: {
          authkey: tailscaleDnsAuthkey.key,
        },
      },
      { ...cro, deleteBeforeReplace: true },
    );

    const accessTokenSecret = new kubernetes.core.v1.SecretPatch(
      `${name}-tailscale-access-token`,
      {
        metadata: {
          name: `tailscale-access-token`,
          namespace: "tailscale-system",
          annotations: {
            "reflector.v1.k8s.emberstack.com/reflection-allowed": "true",
            "reloader.stakater.com/auto": "true",
          },
        },
        stringData: {
          token: accessToken.token,
        },
      },
      { ...cro, deleteBeforeReplace: true },
    );
  }
}

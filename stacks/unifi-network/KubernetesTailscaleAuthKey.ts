import { Tailscale } from "@components/constants.ts";
import type { GlobalResources } from "@components/globals.ts";
import type { KubernetesClusterDefinition } from "@components/store/interfaces.ts";
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

    const cro = {
      parent: this,
      provider: args.kubernetes,
    };

    const authKeySecret = new kubernetes.core.v1.Secret(
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
        // Explicit, and load-bearing: the live Secret is type Opaque, and
        // importing records that in state. Omitting `type` here diffs as
        // REMOVING it — an immutable-field change, i.e. a replacement, which
        // Pulumi refuses outright for a resource that still carries `import`
        // ("previously-imported resources that still specify an ID may not be
        // replaced"). Matching the live value keeps every run an in-place
        // update. This is what wedged the stack after the SecretPatch->Secret
        // conversion.
        type: "Opaque",
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

    const dnsAuthKeySecret = new kubernetes.core.v1.Secret(
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
        // Same reasoning as the app authkey above.
        type: "Opaque",
        stringData: {
          authkey: tailscaleDnsAuthkey.key,
        },
      },
      {
        ...cro,
        deleteBeforeReplace: true,
      },
    );
  }
}

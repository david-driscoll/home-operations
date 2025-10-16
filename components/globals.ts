import { Output, ComponentResource, ComponentResourceOptions, CustomResourceOptions, output, Unwrap, mergeOptions, interpolate } from "@pulumi/pulumi";
import { Provider as TailscaleProvider, TailnetKey } from "@pulumi/tailscale";
import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as UnifiProvider } from "@pulumi/unifi";
import { Provider as AdguardProvider } from "@pulumi/adguard";
import { Provider as MinioProvider } from "@pulumi/minio";
import { Provider as BackblazeProvider } from "@pulumi/b2";
import { OPClient, OPClientItem } from "./op.ts";

const op = new OPClient();

export type ClusterDefinition = DockgeClusterDefinition | KubernetesClusterDefinition;

export function createClusterDefinition(item: OPClientItem): ClusterDefinition {
  return {
    type: item.fields.type.value as any,
    authentikDomain: item.fields.authentikDomain.value!,
    key: item.fields.key.value!,
    rootDomain: item.fields.rootDomain.value!,
    secret: item.fields.secret?.value!,
    title: item.fields.title.value!,
    background: item.fields.background?.value,
    favicon: item.fields.favicon?.value,
    icon: item.fields.icon?.value,
  };
}

export interface DockgeClusterDefinition {
  type: "dockge";
  key: string;
  title: string;
  rootDomain: string;
  authentikDomain: string;
  icon?: string;
  background?: string;
  favicon?: string;
}

export interface KubernetesClusterDefinition {
  type: "kubernetes";
  key: string;
  title: string;
  rootDomain: string;
  authentikDomain: string;
  secret: string;
  icon?: string;
  background?: string;
  favicon?: string;
}

export interface GlobalResourcesArgs {}

export type OnePasswordItem = Unwrap<ReturnType<(typeof op)["mapItem"]>>;

export class GlobalResources extends ComponentResource {
  public readonly cloudflareCredential: Output<OnePasswordItem>;
  public readonly cloudflareProvider: CloudflareProvider;
  public readonly unifiCredential: Output<OnePasswordItem>;
  public readonly unifiProvider: UnifiProvider;
  public readonly proxmoxCredential: Output<OnePasswordItem>;
  public readonly tailscaleCredential: Output<OnePasswordItem>;
  public readonly backblazeCredential: Output<OnePasswordItem>;
  public readonly tailscaleProvider: TailscaleProvider;
  public readonly tailscaleDomain: Output<string>;
  public readonly searchDomain: Output<string>;
  public readonly tailscaleAuthKey: TailnetKey;
  public readonly truenasCredential: Output<OnePasswordItem>;
  public readonly truenasMinioCredential: Output<OnePasswordItem>;
  public readonly truenasMinioProvider: MinioProvider;
  public readonly gateway: Output<string>;
  public readonly adguardCredential: Output<OnePasswordItem>;
  public readonly adguardProvider: AdguardProvider;
  public readonly backblazeProvider: BackblazeProvider;

  constructor(args: GlobalResourcesArgs, opts?: ComponentResourceOptions) {
    super("custom:home:resources", "globals", args, opts);

    const cro: CustomResourceOptions = { parent: this };
    this.cloudflareCredential = output(op.getItemByTitle("Cloudflare (driscoll.tech)"));
    this.unifiCredential = output(op.getItemByTitle("Unifi Api Key Eris Cluster"));
    this.proxmoxCredential = output(op.getItemByTitle("Proxmox"));
    this.tailscaleCredential = output(op.getItemByTitle("Tailscale Terraform OAuth Client"));
    this.truenasCredential = output(op.getItemByTitle("Eris Truenas Credentials"));
    this.truenasMinioCredential = output(op.getItemByTitle("minio root user"));

    this.adguardCredential = output(op.getItemByTitle("AdGuard Home"));
    this.adguardProvider = new AdguardProvider(
      "adguard",
      {
        host: this.adguardCredential.apply((z) => z.urls.find((z) => z.label === "ip-host")?.href!.substring(7)!),
        username: this.adguardCredential.apply((z) => z.fields["username"].value!),
        password: this.adguardCredential.apply((z) => z.fields["password"].value!),
        insecure: true,
        scheme: "http",
      },
      cro,
    );

    this.cloudflareProvider = new CloudflareProvider("cloudflare", { apiToken: this.cloudflareCredential.apply((z) => z.fields["credential"].value!) }, cro);
    this.unifiProvider = new UnifiProvider(
      "unifi",
      {
        apiUrl: this.unifiCredential.apply((z) => z.fields["hostname"].value!),
        apiKey: this.unifiCredential.apply((z) => z.fields["credential"].value!),
      },
      cro,
    );
    this.tailscaleProvider = new TailscaleProvider(
      "tailscale",
      {
        oauthClientId: this.tailscaleCredential.apply((z) => z.fields["username"].value!),
        oauthClientSecret: this.tailscaleCredential.apply((z) => z.fields["credential"].value!),
      },
      cro,
    );
    this.searchDomain = output("driscoll.tech");
    this.gateway = output("10.10.0.1");
    this.tailscaleDomain = this.tailscaleCredential.apply((z) => z.fields["hostname"].value!);

    this.tailscaleAuthKey = new TailnetKey(
      "tailnetkey",
      {
        reusable: true,
        preauthorized: true,
        ephemeral: true,
        // expiry: Math.floor(60 * 60), // 1 hour in seconds
        recreateIfInvalid: "always",
        tags: ["tag:proxmox", "tag:apps"],
        description: "Proxmox Management Key",
      },
      mergeOptions(cro, { provider: this.tailscaleProvider }),
    );

    this.truenasMinioProvider = new MinioProvider(
      "truenas-minio",
      {
        minioRegion: "homelab",
        minioInsecure: true,
        minioUser: this.truenasMinioCredential.apply((z) => z.fields["username"].value!),
        minioPassword: this.truenasMinioCredential.apply((z) => z.fields["password"].value!),
        minioServer: interpolate`${this.truenasCredential.apply((z) => z.fields["hostname"].value)}:9000`,
      },
      cro,
    );

    this.backblazeCredential = output(op.getItemByTitle("Backblaze Master Application Key"));
    this.backblazeProvider = new BackblazeProvider(
      "backblaze",
      {
        applicationKeyId: this.backblazeCredential.fields.apply((z) => z["username"].value!),
        applicationKey: this.backblazeCredential.fields.apply((z) => z["credential"].value!),
      },
      cro,
    );
  }
}

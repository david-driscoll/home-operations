import { Output, ComponentResource, ComponentResourceOptions, CustomResourceOptions, output, Unwrap, mergeOptions } from "@pulumi/pulumi";
import { Provider as TailscaleProvider, TailnetKey } from "@pulumi/tailscale";
import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as UnifiProvider } from "@pulumi/unifi";
import { Provider as MinioProvider } from "@pulumi/minio";
import { op } from "../../components/op.ts";

export interface GlobalResourcesArgs {}

export type OnePasswordItem = Unwrap<ReturnType<(typeof op)["getItemByTitle"]>>;

export class GlobalResources extends ComponentResource {
  public readonly cloudflareCredential: Output<OnePasswordItem>;
  public readonly cloudflareProvider: CloudflareProvider;
  public readonly unifiCredential: Output<OnePasswordItem>;
  public readonly unifiProvider: UnifiProvider;
  public readonly proxmoxCredential: Output<OnePasswordItem>;
  public readonly tailscaleCredential: Output<OnePasswordItem>;
  public readonly tailscaleProvider: TailscaleProvider;
  public readonly tailscaleDomain: Output<string>;
  public readonly tailscaleAuthKey: TailnetKey;
  public readonly truenasCredential: Output<OnePasswordItem>;
  public readonly truenasMinioCredential: Output<OnePasswordItem>;
  public readonly truenasMinioProvider: MinioProvider;

  constructor(args: GlobalResourcesArgs, opts?: ComponentResourceOptions) {
    super("custom:home:resources", "globals", args, opts);

    const cro: CustomResourceOptions = { parent: this };
    this.cloudflareCredential = output(op.getItemByTitle("Cloudflare (driscoll.tech)"));
    this.unifiCredential = output(op.getItemByTitle("Unifi Api Key Eris Cluster"));
    this.proxmoxCredential = output(op.getItemByTitle("Proxmox"));
    this.tailscaleCredential = output(op.getItemByTitle("Tailscale Terraform OAuth Client"));
    this.truenasCredential = output(op.getItemByTitle("Eris Truenas Credentials"));
    this.truenasMinioCredential = output(op.getItemByTitle("minio root user"));

    this.cloudflareProvider = new CloudflareProvider("cloudflare", { apiToken: this.cloudflareCredential.apply((z) => z.fields["credential"].value!) }, cro);
    this.unifiProvider = new UnifiProvider(
      "unifi",
      {
        apiUrl: this.unifiCredential.apply((z) => z.fields["hostname"].value!),
        apiKey: this.unifiCredential.apply((z) => z.fields["credential"].value!),
      },
      cro
    );
    this.tailscaleProvider = new TailscaleProvider(
      "tailscale",
      {
        oauthClientId: this.tailscaleCredential.apply((z) => z.fields["username"].value!),
        oauthClientSecret: this.tailscaleCredential.apply((z) => z.fields["credential"].value!),
      },
      cro
    );
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
      mergeOptions(cro, { provider: this.tailscaleProvider })
    );

    this.truenasMinioProvider = new MinioProvider(
      "truenas-minio",
      {
        minioRegion: "homelab",
        minioInsecure: true,
        minioUser: this.truenasMinioCredential.apply((z) => z.fields["username"].value!),
        minioPassword: this.truenasMinioCredential.apply((z) => z.fields["password"].value!),
        minioServer: this.truenasCredential.apply((z) => `http://${this.truenasCredential.apply((z) => z.fields["domain"].value)}:9000`),
      },
      cro
    );
  }
}

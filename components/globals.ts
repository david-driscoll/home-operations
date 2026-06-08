import { Output, ComponentResource, ComponentResourceOptions, CustomResourceOptions, output, Unwrap, mergeOptions, interpolate, log } from "@pulumi/pulumi";
import { Provider as TailscaleProvider, TailnetKey } from "@pulumi/tailscale";
import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as UnifiProvider } from "@pulumiverse/unifi";
import { Provider as UnifiFirewallProvider } from "@pulumi/terrifi";
import { Provider as AdguardProvider } from "@pulumi/adguard";
import { Provider as MinioProvider } from "@pulumi/minio";
// import { Provider as BackblazeProvider } from "@pulumi/b2";
import { Provider as PbsProvider } from "@pulumi/pbs";
import { OPClient, OPClientItem } from "./op.ts";
import { Tailscale } from "./constants.ts";
import { remote, types } from "@pulumi/command";
import { VaultStore } from "./store/index.ts";

export interface GlobalResourcesArgs {}

export class GlobalResources extends ComponentResource {
  public readonly cloudflareCredential;
  public readonly cloudflareProvider: CloudflareProvider;
  public readonly unifiCredential;
  public readonly unifiProvider: UnifiProvider;
  public readonly unifiFirewallProvider: UnifiFirewallProvider;
  public readonly proxmoxCredential;
  public readonly tailscaleCredential;
  // public readonly backblazeCredential
  public readonly tailscaleProvider: TailscaleProvider;
  public readonly tailscaleDomain: Output<string>;
  public readonly searchDomain: Output<string>;
  public readonly truenasCredential;
  public readonly truenasMinioCredential;
  public readonly truenasMinioProvider: MinioProvider;
  public readonly gateway: Output<string>;
  public readonly adguardCredential;
  public readonly adguardProvider: AdguardProvider;
  public readonly cloudflareZoneId: Output<string>;
  public readonly cloudFlareAccountId: Output<string>;
  public readonly store: VaultStore;
  // public readonly backblazeProvider: BackblazeProvider;

  constructor(args: GlobalResourcesArgs, opts?: ComponentResourceOptions) {
    super("custom:home:resources", "globals", args, opts);

    const cro: CustomResourceOptions = { parent: this };
    this.searchDomain = output("driscoll.tech");
    this.gateway = output("10.10.0.1");

    const store = (this.store = new VaultStore());
    this.tailscaleDomain = store.tailscaleDomain;
    this.tailscaleCredential = store.getSecretByTitle<{ hostname: string; username: string; credential: string }>("Tailscale Terraform OAuth Client");

    this.cloudflareCredential = store.getSecretByTitle<{ username: string; credential: string; zoneId: string; accountId: string }>("Cloudflare (driscoll.tech)");
    this.unifiCredential = store.getSecretByTitle<{ credential: string; hostname: string }>("Unifi Api Key Eris Cluster");
    this.proxmoxCredential = store.getSecretByTitle<{ username: string; password: string }>("Proxmox");
    this.truenasCredential = store.getSecretByTitle<{ username: string; credential: string; hostname: string; domain: string }>("Eris Truenas Credentials");
    this.truenasMinioCredential = store.getSecretByTitle<{ username: string; credential: string }>("minio root user");

    this.adguardCredential = store.getSecretByTitle<{ username: string; password: string; urls: { label: string; href: string }[] }>("AdGuard Home");
    this.adguardProvider = new AdguardProvider(
      "adguard",
      {
        host: this.adguardCredential.apply((z) => z.meta.urls.find((z) => z.label === "ip-host")?.href!.substring(7)!),
        username: this.adguardCredential.username,
        password: this.adguardCredential.password,
        insecure: true,
        scheme: "http",
      },
      cro,
    );

    this.cloudflareProvider = new CloudflareProvider("cloudflare", { apiToken: this.cloudflareCredential.credential }, cro);
    this.cloudflareZoneId = this.cloudflareCredential.zoneId;
    this.cloudFlareAccountId = this.cloudflareCredential.accountId;
    this.unifiProvider = new UnifiProvider(
      "unifi",
      {
        apiUrl: this.unifiCredential.hostname,
        apiKey: this.unifiCredential.credential,
      },
      cro,
    );
    this.unifiFirewallProvider = new UnifiFirewallProvider(
      "unifi-firewall",
      {
        apiUrl: this.unifiCredential.hostname,
        apiKey: this.unifiCredential.credential,
      },
      cro,
    );
    this.tailscaleProvider = new TailscaleProvider(
      "tailscale",
      {
        oauthClientId: this.tailscaleCredential.username,
        oauthClientSecret: this.tailscaleCredential.credential,
      },
      cro,
    );

    this.truenasMinioProvider = new MinioProvider(
      "truenas-minio",
      {
        minioRegion: "homelab",
        minioInsecure: true,
        minioUser: this.truenasMinioCredential.username,
        minioPassword: this.truenasMinioCredential.credential,
        minioServer: interpolate`${this.truenasCredential.hostname}:9000`,
      },
      cro,
    );

    // this.backblazeCredential = output(op.getItemByTitle("Backblaze Master Application Key"));
    // this.backblazeProvider = new BackblazeProvider(
    //   "backblaze",
    //   {
    //     applicationKeyId: this.backblazeCredential.fields.apply((z) => z["username"].value!),
    //     applicationKey: this.backblazeCredential.fields.apply((z) => z["credential"].value!),
    //   },
    //   cro,
    // );
  }
}

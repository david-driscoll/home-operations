import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as MinioProvider } from "@pulumi/minio";
import { ComponentResource, type ComponentResourceOptions, type CustomResourceOptions, interpolate, type Output, output } from "@pulumi/pulumi";
import { Provider as TailscaleProvider } from "@pulumi/tailscale";
import { Provider as TechnitiumProvider } from "@pulumi/technitium";
import { Provider as UnifiFirewallProvider } from "@pulumi/terrifi";
import { Provider as UnifiProvider } from "@pulumiverse/unifi";
import { VaultStore } from "./store/index.ts";

export type GlobalResourcesArgs = object;

export class GlobalResources extends ComponentResource {
  public readonly cloudflareCredential;
  public readonly cloudflareProvider: CloudflareProvider;
  public readonly unifiCredential;
  public readonly unifiProvider: UnifiProvider;
  public readonly unifiFirewallProvider: UnifiFirewallProvider;
  public readonly technitiumCredential;
  public readonly technitiumProvider: TechnitiumProvider;
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
    this.tailscaleCredential = store.getSecretByTitle<{
      hostname: string;
      username: string;
      credential: string;
    }>("Tailscale Terraform OAuth Client");

    this.cloudflareCredential = store.getSecretByTitle<{
      username: string;
      credential: string;
      zoneId: string;
      accountId: string;
    }>("Cloudflare (driscoll.tech)");
    this.unifiCredential = store.getSecretByTitle<{
      credential: string;
      hostname: string;
    }>("Unifi Api Key Eris Cluster");
    this.technitiumCredential = store.getSecretByTitle<{
      credential: string;
      hostname: string;
    }>("Technitium ApiKey");
    this.proxmoxCredential = store.getSecretByTitle<{
      username: string;
      password: string;
    }>("Proxmox");
    this.truenasCredential = store.getSecretByTitle<{
      username: string;
      credential: string;
      hostname: string;
      domain: string;
    }>("Eris Truenas Credentials");
    this.truenasMinioCredential = store.getSecretByTitle<{
      username: string;
      password: string;
    }>("minio root user");

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
    // hostname is host:port (cluster primary's admin TLS endpoint); writes replicate cluster-wide
    this.technitiumProvider = new TechnitiumProvider(
      "technitium",
      {
        // The cluster primary's tailnet name resolves everywhere: MagicDNS
        // returns the tailscale IP for local runs, and the tailscale operator's
        // nameserver (dnsrecords ConfigMap) returns the dns-celestia egress
        // service IP for pulumi-operator workspace pods.
        serverUrl: interpolate`https://dns-celestia.${this.tailscaleDomain}:53443`,
        // The tailnet name doesn't match the LE certificate — validate TLS
        // against the real hostname from the credential item (sans port).
        tlsServerName: this.technitiumCredential.hostname.apply(h => h.split(":")[0]),
        apiToken: this.technitiumCredential.credential,
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
        minioPassword: this.truenasMinioCredential.password,
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

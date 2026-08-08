import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as MinioProvider } from "@pulumi/minio";
import { ComponentResource, type ComponentResourceOptions, type CustomResourceOptions, interpolate, type Output, output, runtime } from "@pulumi/pulumi";
import { Provider as TailscaleProvider } from "@pulumi/tailscale";
import { Provider as TechnitiumProvider } from "@pulumi/technitium";
import { Provider as UnifiFirewallProvider } from "@pulumi/terrifi";
import { Provider as VaultProvider } from "@pulumi/vault";
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
  private _baoProvider?: VaultProvider;

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
  }

  /**
   * Whether the Phase 8a dual-writes should run at all.
   *
   * The in-cluster Pulumi operator has no BAO_TOKEN wiring yet (the AppRole in
   * `vault/bootstrap/openbao/pulumi-approle.sops.yaml` is still delivered by
   * hand), so demanding a token unconditionally stalls every stack that reaches
   * a dual-write site. Callers skip the write when this is false and say so;
   * the paired `retainOnDelete` on those resources means a token-less run drops
   * them from state WITHOUT deleting anything already in OpenBao, so a skip can
   * never destroy migrated data.
   *
   * Remove this once the operator mints tokens and go back to hard-failing.
   */
  public get baoDualWriteEnabled(): boolean {
    return !!process.env.BAO_TOKEN || runtime.isDryRun();
  }

  /**
   * OpenBao (Phase 8a of the 1Password→OpenBao migration).
   *
   * Lazy on purpose, unlike every other provider here. Constructing it eagerly
   * would make BAO_ADDR/BAO_TOKEN a hard requirement of `GlobalResources`, and
   * therefore of `pulumi preview` on every stack in the repo — including the
   * ones that never touch OpenBao. Only the two dual-write sites
   * (`authentik.ts`, `ProxmoxBackupServerLxc.ts`) reach for it.
   */
  public get baoProvider(): VaultProvider {
    if (this._baoProvider) return this._baoProvider;

    const token = process.env.BAO_TOKEN ?? "";
    // Preview never calls the API, so an absent token must not break it. On a
    // real update this getter must never hand back a provider that would write
    // nowhere — callers gate on `baoDualWriteEnabled` before reaching here, so
    // arriving without a token means that gate was bypassed.
    if (!token && !runtime.isDryRun()) {
      throw new Error("BAO_TOKEN is not set — OpenBao writes would be skipped. Mint a token from the `pulumi` AppRole (vault repo: bootstrap/openbao/pulumi-approle.sops.yaml) and export BAO_ADDR/BAO_TOKEN.");
    }

    this._baoProvider = new VaultProvider(
      "openbao",
      {
        address: process.env.BAO_ADDR ?? "https://bao.equestria.driscoll.tech",
        token,
        // The `pulumi` policy grants secrets/, docs/ and meta/ — and nothing
        // on auth/token/create. The provider's default behaviour is to mint
        // itself a short-lived CHILD token, which that policy cannot do, so
        // every run would fail at configure time with a 403. Use the AppRole
        // token as-is; it is already short-lived (1h TTL, 4h max).
        skipChildToken: true,
      },
      { parent: this },
    );
    return this._baoProvider;
  }
}

import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as MinioProvider } from "@pulumi/minio";
import { ComponentResource, type ComponentResourceOptions, type CustomResourceOptions, interpolate, log, type Output, output, runtime, secret } from "@pulumi/pulumi";
import { Provider as TailscaleProvider } from "@pulumi/tailscale";
import { Provider as TechnitiumProvider } from "@pulumi/technitium";
import { Provider as UnifiFirewallProvider } from "@pulumi/terrifi";
import { Provider as VaultProvider } from "@pulumi/vault";
import { Provider as UnifiProvider } from "@pulumiverse/unifi";
import { BaoStore, baoStoreReadsEnabled } from "./store/bao.ts";
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

    // Phase 8: BAO_STORE_READS flips every `globals.store` read from 1Password
    // to OpenBao in one place. Deliberately explicit — see the comment on
    // `baoStoreReadsEnabled` for why this must not be inferred from whether
    // credentials happen to be present. Logged at info so the run's own output
    // says which store its values came from; a value that differs between the
    // two is otherwise indistinguishable from a real config change.
    const useBao = baoStoreReadsEnabled();
    log.info(`Secret reads: ${useBao ? "OpenBao (BAO_STORE_READS)" : "1Password Connect"}`);
    const store = (this.store = useBao ? new BaoStore() : new VaultStore());
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
   * It must accept the SAME credentials as `baoProvider` below — a token OR the
   * AppRole. Checking only BAO_TOKEN made an AppRole run authenticate fine and
   * then silently skip every dual-write, so `pulumi up` reported success while
   * `secrets/hosts/pbs/` and the app `.../oidc` paths stayed empty. The
   * `isDryRun()` arm hides that from preview too: preview advertises the creates
   * and the apply quietly drops them, so a clean preview proves nothing here.
   *
   * Remove this once the operator mints tokens and go back to hard-failing.
   */
  public get baoDualWriteEnabled(): boolean {
    const haveApprole = !!process.env.BAO_ROLE_ID && !!process.env.BAO_SECRET_ID;
    return !!process.env.BAO_TOKEN || haveApprole || runtime.isDryRun();
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

    // Two ways in, in priority order:
    //
    //   BAO_TOKEN                   an already-minted token. Break-glass, CI,
    //                               or a human who just ran `bao login`.
    //   BAO_ROLE_ID/BAO_SECRET_ID   the `pulumi` AppRole, which the provider
    //                               exchanges for a token itself.
    //
    // The AppRole path is the normal one, and it is what removes the manual
    // step this used to require: nobody has to mint a token by hand before a
    // deploy. Source the two values from the vault repo with
    // `eval "$(bootstrap/openbao/pulumi-env.sh)"` — they live in SOPS rather
    // than 1Password on purpose (INVENTORY §2: this is the credential Pulumi
    // authenticates WITH, so it cannot live in the store it unlocks).
    const token = process.env.BAO_TOKEN ?? "";
    const roleId = process.env.BAO_ROLE_ID ?? "";
    const secretId = process.env.BAO_SECRET_ID ?? "";
    const haveApprole = roleId !== "" && secretId !== "";

    // Preview never calls the API, so absent credentials must not break it. On
    // a real update this getter must never hand back a provider that would
    // write nowhere.
    if (!token && !haveApprole && !runtime.isDryRun()) {
      throw new Error('No OpenBao credentials — writes would be skipped. Run `eval "$(bootstrap/openbao/pulumi-env.sh)"` from the vault repo to export BAO_ADDR/BAO_ROLE_ID/BAO_SECRET_ID, or set BAO_TOKEN directly.');
    }

    this._baoProvider = new VaultProvider(
      "openbao",
      {
        address: process.env.BAO_ADDR ?? "https://bao.equestria.driscoll.tech",
        ...(token
          ? { token }
          : haveApprole
            ? {
                // The provider has no dedicated approle block in v7; the
                // generic authLogin covers it, and `parameters` is exactly the
                // login payload.
                authLogin: {
                  path: "auth/approle/login",
                  parameters: { role_id: roleId, secret_id: secret(secretId) },
                },
              }
            : // Dry run with no credentials: a placeholder keeps provider
              // construction from throwing, and preview makes no API call.
              { token: "" }),
        // The `pulumi` policy grants secrets/, docs/, meta/ and the narrow OIDC
        // paths — and nothing on auth/token/create. The provider's default is
        // to mint itself a short-lived CHILD token, which that policy cannot
        // do, so every run would fail at configure time with a 403. The token
        // it gets is already short-lived (1h TTL, 4h max).
        skipChildToken: true,
      },
      { parent: this },
    );
    return this._baoProvider;
  }
}

import { Provider as GarageProvider } from "@axnic/pulumi-garage";
import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as GithubProvider } from "@pulumi/github";
import { Provider as MinioProvider } from "@pulumi/minio";
import { ComponentResource, type ComponentResourceOptions, type CustomResourceOptions, interpolate, type Output, output, runtime, secret } from "@pulumi/pulumi";
import { Provider as TailscaleProvider } from "@pulumi/tailscale";
import { Provider as TechnitiumProvider } from "@pulumi/technitium";
import { Provider as UnifiFirewallProvider } from "@pulumi/terrifi";
import { Provider as VaultProvider } from "@pulumi/vault";
import { Provider as UnifiProvider } from "@pulumiverse/unifi";
import { BAO_CREDENTIAL_HINT, baoEnv, baoEnvUnresolved } from "./bao.ts";
import { BaoStore } from "./store/bao.ts";
import type { VaultStore } from "./store/index.ts";

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
  private _garageProvider?: GarageProvider;
  private _githubCredential?: Output<GithubAppCredential>;
  private _githubProvider?: GithubProvider;

  constructor(args: GlobalResourcesArgs, opts?: ComponentResourceOptions) {
    super("custom:home:resources", "globals", args, opts);

    const cro: CustomResourceOptions = { parent: this };
    this.searchDomain = output("driscoll.tech");
    this.gateway = output("10.10.0.1");

    // One store. The 1Password reads were removed in Phase 11 — see
    // components/store/index.ts for why a fallback to a store nothing writes
    // any more is a hazard rather than a safety net.
    const store = (this.store = new BaoStore());
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
   * `bootstrap/openbao/pulumi-approle.sops.yaml` is still delivered by
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
    // baoEnv(), not process.env: .config/mise.toml sets BAO_ROLE_ID/BAO_SECRET_ID
    // to `ref+sops://` references, which are only values when the command ran
    // under `mise run vals-run`. Reading the raw variables would flip this gate
    // to true on a bare `pulumi up` and fail at the API instead of here.
    const haveApprole = !!baoEnv("BAO_ROLE_ID") && !!baoEnv("BAO_SECRET_ID");
    return !!baoEnv("BAO_TOKEN") || haveApprole || runtime.isDryRun();
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
    // deploy. `.config/mise.toml` supplies both from
    // `.config/bao-approle.sops.yaml`, resolved by `mise run vals-run`;
    // `eval "$(bootstrap/openbao/pulumi-env.sh)"` still works and is the
    // break-glass path. Either way they live in SOPS rather than
    // 1Password on purpose (INVENTORY §2: this is the credential Pulumi
    // authenticates WITH, so it cannot live in the store it unlocks).
    const token = baoEnv("BAO_TOKEN") ?? "";
    const roleId = baoEnv("BAO_ROLE_ID") ?? "";
    const secretId = baoEnv("BAO_SECRET_ID") ?? "";
    const haveApprole = roleId !== "" && secretId !== "";

    // Preview never calls the API, so absent credentials must not break it. On
    // a real update this getter must never hand back a provider that would
    // write nowhere.
    if (!token && !haveApprole && !runtime.isDryRun()) {
      throw new Error(
        baoEnvUnresolved() ? `OpenBao credentials are unresolved \`vals\` references, so writes would be skipped. ${BAO_CREDENTIAL_HINT}` : `No OpenBao credentials — writes would be skipped. ${BAO_CREDENTIAL_HINT}`,
      );
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

  /**
   * The Garage Admin API — the geo-distributed S3 store on the
   * celestia/luna/skystar dockge hosts (docker/_common/garage), which holds
   * the estate's second set of postgres backups.
   *
   * Lazy, like `baoProvider`: only stacks/garage manages buckets and keys,
   * and an eager construction would make the `docker/apps/garage/admin-token`
   * path a preview-time dependency of every stack in the repo.
   *
   * The endpoint names dockge-celestia's tailnet address on purpose — the
   * same resolution story as `technitiumProvider` above: MagicDNS answers it
   * for local runs, and the tailscale-operator egress Services would answer
   * it for workspace pods. Any of the three nodes serves the Admin API
   * (writes replicate cluster-wide); celestia is named because it is the node
   * equestria already egresses to for S3, so its reachability is load-bearing
   * either way. Plain http: the hop is inside the tailnet, which is the same
   * transport trust the RPC mesh itself runs on.
   */
  public get garageProvider(): GarageProvider {
    if (this._garageProvider) return this._garageProvider;
    this._garageProvider = new GarageProvider(
      "garage",
      {
        endpoint: interpolate`http://dockge-celestia.${this.tailscaleDomain}:3903`,
        // Minted by the bootstrap ceremony in docs/garage-offsite-s3.md; the
        // path is marked concealed, so the store hands it back as a secret.
        adminToken: this.store.getSecretByPath<{ password: string }>("docker/apps/garage/admin-token").password,
      },
      { parent: this },
    );
    return this._garageProvider;
  }

  /**
   * The GitHub App the estate automates GitHub with (installation tokens for
   * the clusters, the Flux push webhooks). Lazy, like `baoProvider`: only
   * `stacks/vault` uses it, and an eager read would make every other stack's
   * preview depend on one more OpenBao path for nothing.
   *
   * By PATH, not by title, unlike the seven providers above. In the vault repo
   * this was `getSecretByTitle("Github Actions Runner (david-driscoll)")`,
   * which resolved through the old `shared/<slug(title)>` default rule. The
   * reorganisation deleted that rule — `resolveBaoPath` now errors on any title
   * absent from `TITLE_PATHS` — so the title form would fail outright here.
   * A new call site should name the path anyway; `TITLE_PATHS` is the legacy
   * set, not a place to grow. Same path the `vault-runners` scale set reads
   * (kubernetes/apps/github-actions/runners/vault/secret.yaml).
   *
   * Never log this Output. `.apply()` unwraps the private key into a plain
   * string, and Pulumi redacts secrets in resource inputs/outputs, not in
   * diagnostic text — a logged value lands in the Stack CR status and pod
   * logs in the clear.
   */
  public get githubCredential(): Output<GithubAppCredential> {
    this._githubCredential ??= this.store.getSecretByPath<GithubAppCredential>("third-party-tokens/github/actions-runner/david-driscoll");
    return this._githubCredential;
  }

  public get githubProvider(): GithubProvider {
    if (this._githubProvider) return this._githubProvider;
    const credential = this.githubCredential;
    this._githubProvider = new GithubProvider(
      "github",
      {
        owner: "david-driscoll",
        appAuth: {
          id: credential.github_app_id,
          installationId: credential.github_app_installation_id,
          pemFile: credential.github_app_private_key,
        },
      },
      { parent: this },
    );
    return this._githubProvider;
  }
}

export interface GithubAppCredential {
  github_app_id: string;
  github_app_installation_id: string;
  github_app_private_key: string;
}

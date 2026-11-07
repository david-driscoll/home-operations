import { Provider as GarageProvider } from "@axnic/pulumi-garage";
// The subpath, not the package root: the root's index loads every Azure
// service module (about 2 s), and every stack imports this file.
import { Provider as AzureProvider } from "@pulumi/azure-native/provider.js";
import { Provider as CloudflareProvider } from "@pulumi/cloudflare";
import { Provider as GithubProvider } from "@pulumi/github";
import { Provider as MinioProvider } from "@pulumi/minio";
import { Provider as NetbirdProvider } from "@pulumi/netbird";
import { Provider as OciProvider } from "@pulumi/oci";
import { all, ComponentResource, type ComponentResourceOptions, type CustomResourceOptions, interpolate, log, type Output, output, runtime, secret } from "@pulumi/pulumi";
import { Provider as TailscaleProvider } from "@pulumi/tailscale";
import { Provider as TechnitiumProvider } from "@pulumi/technitium";
import { Provider as UnifiFirewallProvider } from "@pulumi/terrifi";
import { Provider as VaultProvider } from "@pulumi/vault";
import { Provider as UnifiProvider } from "@pulumiverse/unifi";
import { BAO_CREDENTIAL_HINT, baoEnv, baoEnvUnresolved } from "./bao.ts";
import { rootDomain } from "./domains.ts";
import { chooseToken, NETBIRD_AUTOMATION_BAO_PATH, NETBIRD_OWNER_BAO_PATH, NETBIRD_OWNER_PAT_BAO_PATH, type StoredToken, type TokenCandidate } from "./netbird/tokens.ts";
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
  private _ociCredential?: Output<OciApiKeyCredential>;
  private _ociProvider?: OciProvider;
  private _azureCredential?: Output<AzureServicePrincipalCredential>;
  private _azureProvider?: AzureProvider;
  private _mullvadCredential?: Output<MullvadAccountCredential>;
  private _netbirdOwner?: Output<NetbirdOwnerCredential>;
  private _netbirdApi?: NetbirdApiCredential;
  private _netbirdOwnerApi?: NetbirdApiCredential;
  private _netbirdProvider?: NetbirdProvider;
  private _netbirdOwnerProvider?: NetbirdProvider;

  constructor(args: GlobalResourcesArgs, opts?: ComponentResourceOptions) {
    super("custom:home:resources", "globals", args, opts);

    const cro: CustomResourceOptions = { parent: this };
    this.searchDomain = output(rootDomain());
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

    this.cloudflareCredential = store.getSecretByPath<{
      username: string;
      credential: string;
      zoneId: string;
      accountId: string;
    }>("third-party-tokens/cloudflare/dns-zone");
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
   * `secrets/hosts/` and the app `.../oidc` paths stayed empty. The
   * `isDryRun()` arm hides that from preview too: preview advertises the creates
   * and the apply quietly drops them, so a clean preview proves nothing here.
   *
   * Remove this once the operator mints tokens and go back to hard-failing.
   */
  public get baoDualWriteEnabled(): boolean {
    // baoEnv(), not process.env: BAO_ROLE_ID/BAO_SECRET_ID can still be
    // unresolved `ref+sops://` references (an old shell from before fnox, a
    // stray export). Reading the raw variables would flip this gate to true on
    // such a run and fail at the API instead of here.
    const haveApprole = !!baoEnv("BAO_ROLE_ID") && !!baoEnv("BAO_SECRET_ID");
    return !!baoEnv("BAO_TOKEN") || haveApprole || runtime.isDryRun();
  }

  /**
   * OpenBao (Phase 8a of the 1Password→OpenBao migration).
   *
   * Lazy on purpose, unlike every other provider here. Constructing it eagerly
   * would make BAO_ADDR/BAO_TOKEN a hard requirement of `GlobalResources`, and
   * therefore of `pulumi preview` on every stack in the repo — including the
   * ones that never touch OpenBao. Only the dual-write sites
   * (`authentik.ts`, `DockgeLxc.ts`, ...) reach for it.
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
    // deploy. `.config/fnox.toml` supplies both from
    // `.config/bao-approle.sops.yaml` under `fnox exec`;
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
        baoEnvUnresolved() ? `OpenBao credentials are unresolved \`ref+\` references, so writes would be skipped. ${BAO_CREDENTIAL_HINT}` : `No OpenBao credentials — writes would be skipped. ${BAO_CREDENTIAL_HINT}`,
      );
    }

    this._baoProvider = new VaultProvider(
      "openbao",
      {
        address: process.env.BAO_ADDR ?? `https://bao.equestria.${rootDomain()}`,
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
   * Lazy, like `baoProvider`: only stacks/system's garage.ts manages buckets and keys,
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
   * `stacks/system` uses it (stacks/system/flux-webhooks.ts and the Forgejo
   * mirror's deploy key), and an eager read would make every other stack's
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

  /**
   * The `pulumi-netbird` user's API key on the Always Free OCI tenancy
   * (stacks/netbird-edge, docs/plans/netbird-mirror.md). Lazy like
   * `githubCredential`: only that stack reads it. `.config/fnox.toml` exposes
   * the same path as OCI_CLI_* for the `oci` CLI.
   *
   * Never log this Output: `private_key` is a PEM.
   */
  public get ociCredential(): Output<OciApiKeyCredential> {
    this._ociCredential ??= this.store.getSecretByPath<OciApiKeyCredential>("third-party-tokens/oci/pulumi");
    return this._ociCredential;
  }

  public get ociProvider(): OciProvider {
    if (this._ociProvider) return this._ociProvider;
    const credential = this.ociCredential;
    this._ociProvider = new OciProvider(
      "oci",
      {
        auth: "ApiKey",
        tenancyOcid: credential.tenancy_ocid,
        userOcid: credential.user_ocid,
        fingerprint: credential.fingerprint,
        privateKey: credential.private_key,
        region: credential.region,
      },
      { parent: this },
    );
    return this._ociProvider;
  }

  /**
   * The `netbird-edge` service principal on the Visual Studio subscription
   * (#3001): Contributor on that one subscription, which has its spending
   * limit on. Lazy like `ociCredential`: only stacks/netbird-edge reads it.
   * `.config/fnox.toml` exposes the same path as ARM_* for the az CLI.
   *
   * Never log this Output: `client_secret` is the credential.
   */
  public get azureCredential(): Output<AzureServicePrincipalCredential> {
    this._azureCredential ??= this.store.getSecretByPath<AzureServicePrincipalCredential>("third-party-tokens/azure/netbird-edge");
    return this._azureCredential;
  }

  public get azureProvider(): AzureProvider {
    if (this._azureProvider) return this._azureProvider;
    const credential = this.azureCredential;
    this._azureProvider = new AzureProvider(
      "azure-native",
      {
        tenantId: credential.tenant_id,
        subscriptionId: credential.subscription_id,
        clientId: credential.client_id,
        clientSecret: secret(credential.client_secret),
      },
      { parent: this },
    );
    return this._azureProvider;
  }

  /**
   * The standalone Mullvad account the region exits register their WireGuard
   * devices on (docs/plans/region-exits.md §C1, dynamic/mullvad/MullvadDevice.ts).
   * Lazy like `azureCredential`: only stacks/region-exits reads it.
   *
   * Never log this Output: the account number is the whole credential.
   */
  public get mullvadCredential(): Output<MullvadAccountCredential> {
    this._mullvadCredential ??= this.store.getSecretByPath<MullvadAccountCredential>("third-party-tokens/mullvad/wonderbolts");
    return this._mullvadCredential;
  }

  /**
   * The self-hosted NetBird's break-glass owner, written by stacks/netbird-edge
   * when it first set the server up (#3000): where the server is, the owner's
   * login, and the setup PAT. Lazy: only stacks/netbird reads it, and the path
   * does not exist until that setup ran.
   *
   * Never log this Output. Call the API with `netbirdApi`, not with the PAT in
   * here.
   */
  public get netbirdOwner(): Output<NetbirdOwnerCredential> {
    this._netbirdOwner ??= this.store.getSecretByPath<NetbirdOwnerCredential>(NETBIRD_OWNER_BAO_PATH);
    return this._netbirdOwner;
  }

  /**
   * The one credential every NetBird API call Pulumi makes uses: the provider,
   * the dynamic resources and raw `fetch`es alike. It is the `automation`
   * service user's PAT once stacks/netbird has written it, and the owner's
   * until then (components/netbird/tokens.ts has the chain and why it cannot
   * deadlock).
   *
   * Shaped like the provider's and the dynamic resources' args, so it is
   * passed whole: `new NetbirdDefaultPolicyRemoval(name, globals.netbirdApi)`.
   * `token` is secret.
   */
  public get netbirdApi(): NetbirdApiCredential {
    this._netbirdApi ??= this.netbirdCredential("automation");
    return this._netbirdApi;
  }

  /**
   * The owner's own PAT, for the one thing `netbirdApi` cannot do: mint the
   * owner a new PAT. NetBird lets a user manage only its own tokens and its
   * service users' tokens, so the automation user cannot rotate the owner's.
   */
  public get netbirdOwnerApi(): NetbirdApiCredential {
    this._netbirdOwnerApi ??= this.netbirdCredential("owner");
    return this._netbirdOwnerApi;
  }

  /**
   * Switching this provider's token (owner to automation on the second run, or
   * a rotation) is an in-place provider update, not a replace. The bridged
   * provider marks no config key as forcing replacement, so the NetBird
   * resources keep their provider reference and see no diff.
   */
  public get netbirdProvider(): NetbirdProvider {
    this._netbirdProvider ??= new NetbirdProvider("netbird", this.netbirdApi, { parent: this });
    return this._netbirdProvider;
  }

  /** `netbirdOwnerApi` as a provider, for the owner's own `netbird.Token` only. */
  public get netbirdOwnerProvider(): NetbirdProvider {
    this._netbirdOwnerProvider ??= new NetbirdProvider("netbird-owner", this.netbirdOwnerApi, { parent: this });
    return this._netbirdOwnerProvider;
  }

  private netbirdCredential(prefer: "automation" | "owner"): NetbirdApiCredential {
    const ownerPat = this.store.tryGetSecretByPath<StoredToken>(NETBIRD_OWNER_PAT_BAO_PATH);
    const automation = prefer === "automation" ? this.store.tryGetSecretByPath<StoredToken>(NETBIRD_AUTOMATION_BAO_PATH) : output(undefined);
    const chosen = all([this.netbirdOwner, ownerPat, automation]).apply(([owner, ownerPat, automation]) => {
      const candidates: TokenCandidate[] = [...(prefer === "automation" ? [{ source: "automation", token: automation }] : []), { source: "owner-pat", token: ownerPat }, { source: "owner", token: owner }];
      const choice = chooseToken(candidates, new Date());
      for (const skip of choice.skipped) {
        // Absent is the expected first run; expired means the alert was missed.
        const message = `NetBird ${prefer} credential: skipping ${skip.source} (${skip.detail}), using ${choice.source}.`;
        if (skip.reason === "absent") log.info(message, this);
        else log.warn(message, this);
      }
      return { managementUrl: owner.url, token: choice.token };
    });
    return { managementUrl: chosen.managementUrl, token: secret(chosen.token) };
  }
}

/** Where the NetBird API is and the PAT to call it with. `token` is secret. */
export interface NetbirdApiCredential {
  /** `https://netbird.<root domain>`. */
  managementUrl: Output<string>;
  token: Output<string>;
}

export interface NetbirdOwnerCredential {
  /** `https://netbird.<root domain>`. */
  url: string;
  email: string;
  password: string;
  user_id: string;
  personal_access_token: string;
}

export interface OciApiKeyCredential {
  tenancy_ocid: string;
  user_ocid: string;
  fingerprint: string;
  region: string;
  private_key: string;
}

/** OpenBao `third-party-tokens/azure/netbird-edge`. */
export interface AzureServicePrincipalCredential {
  tenant_id: string;
  subscription_id: string;
  client_id: string;
  client_secret: string;
}

/** OpenBao `third-party-tokens/mullvad/wonderbolts`. */
export interface MullvadAccountCredential {
  account: string;
}

export interface GithubAppCredential {
  github_app_id: string;
  github_app_installation_id: string;
  github_app_private_key: string;
}

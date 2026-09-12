/**
 * The Cloudflare Zero Trust tunnel a cluster publishes through, and the list of
 * public hostnames it serves.
 *
 * ## What this owns, and what it deliberately does not
 *
 * The tunnel is `configSrc: "cloudflare"` — remotely configured. The connector
 * (`kubernetes/apps/network/cloudflare-tunnel/`, chart `cloudflare-tunnel-remote`)
 * holds no ingress rules at all; it fetches them from Cloudflare at connect time.
 * Until 2026-09-12 that rule list was maintained by hand in the Zero Trust
 * dashboard, so the set of hostnames the estate exposed to the internet was
 * described nowhere in this repo and reviewed by nobody. This component is what
 * moved it into code.
 *
 * It owns exactly three things:
 *
 *   1. the tunnel resource (ADOPTED — see "Adoption" below, it is never created),
 *   2. the tunnel's ingress rules,
 *   3. the write-back of the tunnel's identity and token to OpenBao.
 *
 * It owns NO DNS. Every `<app>.driscoll.tech` CNAME that points at
 * `<tunnel-id>.cfargotunnel.com` is created by external-dns in-cluster
 * (`kubernetes/apps/network/external-dns/cloudflare/`, `policy: sync`,
 * `txtOwnerId: equestria`). A Pulumi DNS record for the same name would be a
 * second writer against a controller whose sync policy actively deletes records
 * it does not own — the two would fight on every reconcile. `StandardDns` exists
 * for names external-dns does not manage; tunnel hostnames are not those.
 *
 * ## Adoption, not creation
 *
 * `pulumi import` (the CLI) put the live tunnel into state. The `import:`
 * RESOURCE OPTION is deliberately absent, and must stay absent.
 *
 * `components/StandardDns.ts` carries the full post-mortem: the Cloudflare
 * provider's import id is `<parent>/<child>` while the id it stores in state is
 * the bare child, so `import:` can never equal the resource's own state id and a
 * replace is re-planned on EVERY subsequent run. With `deleteBeforeReplace` that
 * became 56 wiped DNS records on 2026-07-25, twice, and 9 destroyed UniFi records
 * on 2026-07-28. Both tunnel resources here have that exact shape — import id
 * `<account_id>/<tunnel_id>`, state id the bare tunnel id — so they would fail
 * the same way. Adopting through the CLI writes state once and arms nothing.
 *
 * `protect` and `retainOnDelete` are the belt to that braces. Deleting this
 * tunnel does not just break a hostname: the connector authenticates with a
 * token derived from it, and `TUNNEL_DOMAIN` in
 * `kubernetes/flux/meta/cluster-secrets.sops.yaml` hardcodes its UUID, so a
 * recreate would take every external name down until that sops file was
 * hand-edited. Nothing in a Pulumi run is allowed to reach that outcome.
 */

import * as cloudflare from "@pulumi/cloudflare";
import { all, ComponentResource, type ComponentResourceOptions, type Input, interpolate, log, type Output, output, secret } from "@pulumi/pulumi";
import { baoKvSecret, baoProvenance } from "./bao.ts";
import type { GlobalResources } from "./globals.ts";

export interface CloudflareTunnelArgs {
  globals: GlobalResources;
  /**
   * OpenBao path, within the `secrets` mount, holding this tunnel's identity.
   *
   * `name` is READ from here and is the only hand-written field. `tunnelId`,
   * `credential` (the connector token) and `hostname` are WRITTEN back on every
   * run. Read and write are the same path on purpose — one item is the whole
   * answer to "what is this tunnel", for humans and for the ExternalSecret that
   * feeds the connector.
   */
  secretPath: string;
  /**
   * Public hostnames this tunnel serves, one ingress rule each.
   *
   * MUST be non-empty — see the guard in the constructor for why that is
   * enforced rather than assumed.
   */
  hostnames: Input<string[]>;
  /** Origin every hostname is routed to. Defaults to the in-cluster Traefik service. */
  service?: Input<string>;
  /**
   * SNI presented to the origin. Defaults to the estate search domain, which is
   * what the wildcard certificate on the external Gateway is issued for.
   */
  originServerName?: Input<string>;
  /** Final catch-all rule. See the note on the default in the constructor. */
  catchAllService?: Input<string>;
}

export class CloudflareTunnelComponent extends ComponentResource {
  public readonly tunnel: cloudflare.ZeroTrustTunnelCloudflared;
  public readonly config: cloudflare.ZeroTrustTunnelCloudflaredConfig;
  /** UUID of the tunnel. */
  public readonly tunnelId: Output<string>;
  /** `<tunnel-id>.cfargotunnel.com` — what a proxied CNAME has to target. */
  public readonly hostname: Output<string>;
  /** The connector token. Secret. */
  public readonly token: Output<string>;
  /** The hostnames actually written, post-validation, sorted. */
  public readonly hostnames: Output<string[]>;

  constructor(name: string, args: CloudflareTunnelArgs, opts?: ComponentResourceOptions) {
    super("custom:cloudflare:tunnel", name, args, opts);

    const { globals } = args;
    const cro = {
      parent: this,
      provider: globals.cloudflareProvider,
      // Not a convenience. See the "Adoption" section in the file header: a
      // destroyed tunnel takes the connector token AND the hardcoded
      // TUNNEL_DOMAIN with it, and neither comes back from a `pulumi up`.
      protect: true,
      retainOnDelete: true,
    };

    const identity = globals.store.getSecretByPath<{ name: string }>(args.secretPath);

    // THE FIRST GUARD. This component reads `name` from the same OpenBao path it
    // overwrites. There is no Pulumi cycle — the read is a plan-time data source
    // and the write is a resource — but `baoKvSecret` serialises the WHOLE item
    // to `dataJson`, so a read that came back empty would be written straight
    // back as an empty name and the next run would adopt a tunnel called "".
    // Fail here instead, naming the path and the fix.
    const tunnelName = identity.name.apply(value => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(
          `CloudflareTunnel "${name}": no \`name\` at secrets/${args.secretPath}. ` +
            "It is the one hand-written field on that item and must match the tunnel's name in Cloudflare exactly — " +
            "a mismatch renames the live tunnel. Seed it with `bao kv patch` (patch, not put: `credential` must survive).",
        );
      }
      return value.trim();
    });

    this.tunnel = new cloudflare.ZeroTrustTunnelCloudflared(
      `${name}-tunnel`,
      {
        accountId: globals.cloudFlareAccountId,
        name: tunnelName,
        // Remotely configured: the rules live in the `-config` resource below,
        // not in a YAML file on the connector. Flipping this to "local" would
        // strand that resource — cloudflared would stop reading it and start
        // looking for an on-disk config the chart does not mount.
        configSrc: "cloudflare",
      },
      cro,
    );

    this.tunnelId = this.tunnel.id.apply(id => id);
    this.hostname = interpolate`${this.tunnelId}.cfargotunnel.com`;

    // THE SECOND GUARD. An empty hostname list is not an empty tunnel, it is a
    // DARK tunnel: the rendered ingress array would be nothing but the catch-all
    // and every external name would start answering it. `hostnames` is derived
    // from a live Kubernetes query at the call site, so "empty" is exactly what
    // an unreachable API server or a mistyped Gateway selector looks like.
    //
    // Same posture as `mise run update` refusing to run without its Tailscale
    // credentials rather than regenerating an empty list (.config/mise.toml) —
    // in both cases the empty result is indistinguishable from a real one by the
    // time it reaches the writer.
    this.hostnames = output(args.hostnames).apply(list => {
      const cleaned = list.map(hostname => hostname.trim()).filter(hostname => hostname.length > 0);
      if (cleaned.length === 0) {
        throw new Error(
          `CloudflareTunnel "${name}": no hostnames. Refusing to write a tunnel config that serves only the catch-all — ` +
            "that would take every externally published name dark. If the tunnel really should serve nothing, delete this component.",
        );
      }
      const duplicates = [...new Set(cleaned.filter((hostname, index) => cleaned.indexOf(hostname) !== index))];
      if (duplicates.length > 0) {
        // Cloudflare matches ingress rules top-down, so a duplicate is a rule
        // that can never fire. It always means two HTTPRoutes claim one name.
        throw new Error(`CloudflareTunnel "${name}": duplicate hostnames ${duplicates.join(", ")}. Two routes claim the same name; only the first rule would ever match.`);
      }
      return cleaned.sort();
    });

    const service = output(args.service ?? "https://traefik.network.svc.cluster.local");
    const originServerName = output(args.originServerName ?? globals.searchDomain);
    // Cloudflare REQUIRES the last ingress rule to be a hostname-less catch-all,
    // so "serve nothing else" cannot be expressed by omitting it. 404 is the
    // cloudflared convention and the honest answer: the name is not served here.
    // This replaced a live `http_status:402` (Payment Required) on 2026-09-12 —
    // a strange thing to have been showing the public internet.
    const catchAllService = output(args.catchAllService ?? "http_status:404");

    const ingresses = all([this.hostnames, service, originServerName, catchAllService]).apply(([hostnames, origin, serverName, catchAll]) => [
      ...hostnames.map(hostname => ({
        hostname,
        service: origin,
        originRequest: {
          // Traefik serves the wildcard LE certificate for the external Gateway,
          // which does not match the in-cluster service name cloudflared dials.
          // `originServerName` fixes the SNI; `noTlsVerify` covers the fact that
          // the connector has no reason to trust the cluster's chain.
          noTlsVerify: true,
          originServerName: serverName,
        },
      })),
      // Appended AFTER the guard above, never folded into it — so an empty
      // hostname list can never be mistaken for a list of one.
      { service: catchAll },
    ]);

    this.config = new cloudflare.ZeroTrustTunnelCloudflaredConfig(
      `${name}-config`,
      {
        accountId: globals.cloudFlareAccountId,
        tunnelId: this.tunnelId,
        source: "cloudflare",
        config: {
          // Pulumi camelCases what the Cloudflare API spells differently:
          // `ingresses` is the API's `ingress`, `noTlsVerify` its `noTLSVerify`.
          // Checked against the provider's own input types, not guessed — the
          // API spellings silently no-op here.
          ingresses,
          // No `warpRouting`, although the input type accepts it. Cloudflare
          // derives `warp-routing.enabled` from whether the tunnel has private
          // network routes, and provider 6.10.0 rejects setting it: the first
          // preview on 2026-09-12 failed with "Invalid Configuration for
          // Read-Only Attribute" at `config.warpRouting.enabled`. It is `false`
          // live because this tunnel has no routes, which is also what keeps it.
        },
      },
      cro,
    );

    // The resource itself exposes no token output, so the data source is the
    // only way to reach it. It takes plain strings rather than Inputs, hence the
    // apply. This is what retires the hand-maintained copy in OpenBao: the token
    // is derived from the account and tunnel, so reading it is stable rather
    // than a rotation.
    //
    // PERMISSION: the Cloudflare API token behind `globals.cloudflareProvider`
    // needs `Cloudflare Tunnel Write` (dashboard: Account > Cloudflare Tunnel >
    // Edit). Read is not enough — `GET .../cfd_tunnel/<id>/token` answers
    // `401 {"code":1001,"message":"Not authorized"}` to a token that can read the
    // tunnel's configuration fine, which is exactly what the first preview hit on
    // 2026-09-12. Updating the ingress rules above needs Write as well.
    this.token = secret(
      all([globals.cloudFlareAccountId, this.tunnelId]).apply(([accountId, tunnelId]) =>
        cloudflare.getZeroTrustTunnelCloudflaredToken({ accountId, tunnelId }, { provider: globals.cloudflareProvider, parent: this }).then(result => result.token),
      ),
    );

    // Write-back. `credential` is the key the ExternalSecret at
    // kubernetes/apps/network/cloudflare-tunnel/secret.yaml extracts and the
    // HelmRelease feeds to `cloudflare.tunnel_token` — renaming it takes the
    // connector down, so it is load-bearing, not descriptive.
    //
    // Gated because a run without OpenBao credentials must not look like a run
    // that decided the secret should not exist; `baoKvSecret` pairs that with
    // `retainOnDelete` so a skipped write orphans rather than deletes.
    if (globals.baoDualWriteEnabled) {
      baoKvSecret(
        `${name}-identity`,
        {
          mount: "secrets",
          path: args.secretPath,
          data: all([tunnelName, this.tunnelId, this.token, this.hostname]).apply(([tunnel, tunnelId, credential, hostname]) => ({
            name: tunnel,
            tunnelId,
            credential,
            hostname,
          })),
          concealedFields: ["credential"],
          // This replaces the item's custom_metadata wholesale, dropping the
          // 1Password migration provenance (`moved_from`, `source_uuid`) that
          // has described a finished move since 2026-08-22. `source_title` is
          // reconstructed so the item is still findable by the name it had.
          customMetadata: baoProvenance({ source_title: interpolate`${tunnelName} Cloudflare Tunnel` }),
        },
        { parent: this, provider: globals.baoProvider },
      );
    } else {
      log.warn(`CloudflareTunnel "${name}": BAO credentials absent — skipping the identity write-back. The connector keeps running on the token already in OpenBao.`);
    }
  }
}

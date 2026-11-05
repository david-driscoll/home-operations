/**
 * Custom domains on the private proxy's cluster (docs/plans/netbird-mirror.md
 * D38): the public CNAMEs management validates them by, the domain itself,
 * and the re-validation of one that did not validate at create.
 *
 * A custom domain lets a service on the proxy use a name other than the
 * cluster address (`ek.<root domain>`). Management checks, once at create,
 * that `validation.<domain>` is a CNAME naming the target cluster's address
 * (validator.go, v0.82.0), and a service under the domain can only be created
 * once it is validated (DeriveClusterFromDomain). An unvalidated domain is
 * dropped after 48 hours.
 *
 * The CNAMEs are Cloudflare-only and grey, like netbird-edge's names. They
 * point at a name with no public address, so on the internet they resolve to
 * nothing; NetBird peers get the services' names from management's
 * synthesized zones, never from public DNS.
 */
import * as cloudflare from "@pulumi/cloudflare";
import * as netbird from "@pulumi/netbird";
import * as pulumi from "@pulumi/pulumi";
import type { GlobalResources } from "components/globals.ts";
import { type LiveDomain, validationRecordName } from "./nbidp.ts";

/** One public CNAME to the cluster address. */
export interface ClusterCname {
  /** Pulumi resource name. */
  name: string;
  /** The record, fully qualified. */
  recordName: string;
  comment: string;
}

/**
 * The public CNAMEs a custom domain needs: always `validation.<domain>`, plus
 * any the caller adds (a wildcard, say). All name the cluster address.
 */
export function clusterCnames(globals: GlobalResources, clusterAddress: string, records: ClusterCname[]): cloudflare.DnsRecord[] {
  // zoneId as in StandardDns: it arrives as a secret and reads back plain.
  return records.map(
    record =>
      new cloudflare.DnsRecord(
        record.name,
        { zoneId: globals.cloudflareCredential.zoneId, name: record.recordName, type: "CNAME", content: clusterAddress, ttl: 300, proxied: false, comment: record.comment },
        { provider: globals.cloudflareProvider, ignoreChanges: ["zoneId"] },
      ),
  );
}

/** The validation record for `domain`, as a ClusterCname. */
export function validationCname(name: string, domain: string, what: string): ClusterCname {
  return { name, recordName: validationRecordName(domain), comment: `stacks/netbird: NetBird custom-domain validation for ${what}` };
}

export interface CustomDomainArgs {
  /** Pulumi resource name. */
  name: string;
  domain: string;
  clusterAddress: string;
  provider: netbird.Provider;
  managementUrl: string;
  token: string;
  /** What GET /api/reverse-proxies/domains says about this domain now. */
  live: LiveDomain | undefined;
  /** The CNAMEs (clusterCnames) and anything else that must exist first. */
  dependsOn: pulumi.Resource[];
}

/**
 * Declare the custom domain, and re-validate it if management has it but not
 * yet validated. Returns the resource and whether it is validated as of this
 * run (false for a domain this run creates: the create's own check is only
 * known once it has run).
 *
 * A cluster change REPLACES the domain, deleting first: the domain is unique
 * per server, and management checks the CNAME against the target cluster only
 * at create or validate. Services under the domain are pinned to their
 * cluster too (NetbirdPrivateService replaces them the same way).
 */
export async function declareCustomDomain(args: CustomDomainArgs): Promise<{ resource: netbird.ReverseProxyDomain; validated: boolean }> {
  const resource = new netbird.ReverseProxyDomain(
    args.name,
    { domain: args.domain, targetCluster: args.clusterAddress },
    { provider: args.provider, dependsOn: args.dependsOn, replaceOnChanges: ["targetCluster"], deleteBeforeReplace: true },
  );
  const onCluster = args.live?.target_cluster === undefined || args.live.target_cluster === args.clusterAddress;
  let validated = args.live?.validated === true && onCluster;
  if (args.live && onCluster && !validated && !pulumi.runtime.isDryRun()) validated = await validateDomain(args.managementUrl, args.token, args.live.id, args.domain);
  if (!args.live)
    pulumi.log.warn(
      `NetBird: custom domain ${args.domain} is not registered with management yet. This run registers it if it is new; if management dropped it (unvalidated for 48h) while Pulumi still holds it, run \`pulumi refresh\`.`,
    );
  return { resource, validated };
}

/** Ask management to check `validation.<domain>` again. 412 is "not yet": a warning, not a failure. */
async function validateDomain(url: string, token: string, id: string, domain: string): Promise<boolean> {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/reverse-proxies/domains/${encodeURIComponent(id)}/validate`, { headers: { Authorization: `Token ${token}`, Accept: "application/json" } });
  if (response.ok) return true;
  const detail = await response.text().catch(() => "");
  if (response.status === 412) {
    pulumi.log.warn(`NetBird: ${domain} did not validate: ${detail}`.trim());
    return false;
  }
  throw new Error(`NetBird GET /api/reverse-proxies/domains/${id}/validate: HTTP ${response.status} ${detail}`.trim());
}

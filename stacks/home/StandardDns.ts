import { GlobalResources } from "@components/globals.ts";
import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { DnsRecord as CloudflareDnsRecord } from "@pulumi/cloudflare";
import { ComponentResource, Output, ComponentResourceOptions } from "@pulumi/pulumi";
import { Rewrite } from "@pulumi/adguard";
import { DnsRecord as UnifiDnsRecord } from "@pulumi/unifi";

export class StandardDns extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly ipAddress: Output<string>;
  public readonly unifi: UnifiDnsRecord;
  public readonly cloudflare: CloudflareDnsRecord;
  public readonly adguard: Rewrite;

  constructor(
    name: string,
    args: {
      hostname: Output<string>;
      ipAddress: Output<string>;
      type: "A" | "CNAME";
      record?: Output<string>;
    },
    globals: GlobalResources,
    cro: ComponentResourceOptions,
  ) {
    super("custom:resource:StandardDns", name, {}, cro);

    this.unifi = new UnifiDnsRecord(
      `${name}-unifi`,
      {
        name: args.hostname,
        recordType: args.type,
        value: args.record ?? args.ipAddress,
        port: 0,
        ttl: 0,
      },
      {
        parent: this,
        provider: globals.adguardProvider,
        deleteBeforeReplace: true,
      },
    );
    this.cloudflare = new CloudflareDnsRecord(
      `${name}-cloudflare`,
      {
        name: args.hostname,
        zoneId: globals.cloudflareCredential.apply((z) => z.fields?.zoneId?.value!),
        content: args.record ?? args.ipAddress,
        type: args.type,
        ttl: 1,
      },
      {
        parent: this,
        provider: globals.adguardProvider,
        deleteBeforeReplace: true,
      },
    );
    // TODO: pull this value from unifi later
    this.adguard = new Rewrite(
      `${name}-adguard`,
      {
        domain: args.hostname,
        answer: args.ipAddress,
      },
      {
        parent: this,
        provider: globals.adguardProvider,
        deleteBeforeReplace: true,
      },
    );
    this.hostname = args.hostname;
    this.ipAddress = args.ipAddress;
  }
}
export function createDnsSection(dns: StandardDns): OnePasswordItemSectionInput {
  return {
    fields: {
      hostname: {
        type: TypeEnum.String,
        value: dns.hostname,
      },
      ipAddress: {
        type: TypeEnum.String,
        value: dns.ipAddress,
      },
    },
  };
}

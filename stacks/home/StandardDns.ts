import { GlobalResources } from "@components/globals.ts";
import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as cloudflare from "@pulumi/cloudflare";
import { ComponentResource, Output, ComponentResourceOptions, mergeOptions, Input, output, interpolate } from "@pulumi/pulumi";
import * as adguard from "@pulumi/adguard";
import * as unifi from "@pulumiverse/unifi";
import { GatusDefinition } from "@openapi/application-definition.js";
import { dns } from "@components/constants.ts";

export class StandardDns extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly unifi: unifi.dns.Record;
  public readonly cloudflare: cloudflare.DnsRecord;
  public readonly adguard: adguard.Rewrite;

  constructor(
    name: string,
    args: {
      hostname: Input<string>;
      ipAddress?: Input<string>;
      type: "A" | "CNAME";
      record?: Input<string>;
    },
    globals: GlobalResources,
    cro: ComponentResourceOptions,
  ) {
    super("custom:resource:StandardDns", name, {}, mergeOptions(cro, { deleteBeforeReplace: true }));

    const record =
      args.record ??
      args.ipAddress ??
      (() => {
        throw new Error("Either ipAddress or record must be provided");
      })();

    this.unifi = new unifi.dns.Record(
      `${name}-unifi`,
      {
        name: args.hostname,
        type: args.type,
        value: record,
      },
      {
        parent: this,
        provider: globals.unifiProvider,
        deleteBeforeReplace: true,
      },
    );

    this.cloudflare = new cloudflare.DnsRecord(
      `${name}-cloudflare`,
      {
        name: args.hostname,
        zoneId: globals.cloudflareCredential.apply((z) => z.fields?.zoneId?.value!),
        content: record,
        type: args.type,
        ttl: 1,
      },
      {
        parent: this,
        provider: globals.cloudflareProvider,
        deleteBeforeReplace: true,
      },
    );

    this.adguard = new adguard.Rewrite(
      `${name}-adguard`,
      {
        domain: args.hostname,
        answer: record,
      },
      {
        parent: this,
        provider: globals.adguardProvider,
        deleteBeforeReplace: true,
      },
    );
    this.hostname = output(args.hostname);
    addGatusDnsRecord(name, args);
  }
}

export const gatusDnsRecords: Output<GatusDefinition>[] = [];

function addGatusDnsRecord(
  name: string,
  args: {
    hostname: Input<string>;
    ipAddress?: Input<string>;
    type: "A" | "CNAME";
    record?: Input<string>;
  },
) {
  for (const [server, { ips, uptime }] of Object.entries(dns.config)) {
    if (!uptime) continue;
    const ip = ips[0];
    const bodyConfig = output(args.hostname).apply((hostname) => {
      if (args.type === "A") return args.ipAddress;
      return interpolate`${args.record}., ${args.record},`;
    });
    gatusDnsRecords.push(
      output({
        name: args.hostname,
        url: ip,
        group: `DNS @ ${server}`,
        dns: {
          "query-name": args.hostname,
          "query-type": args.type,
        },
        interval: "5m",
        timeout: "1m",
        conditions: [interpolate`[BODY] == any(${bodyConfig})`, "[DNS_RCODE] == NOERROR"],
        alerts: [
          {
            type: "pushover",
            enabled: true,
            "minimum-reminder-interval": "2h",
          },
        ],
      }),
    );
  }
}

export function createDnsSection(dns: StandardDns): OnePasswordItemSectionInput {
  return {
    fields: {
      hostname: {
        type: TypeEnum.String,
        value: dns.hostname,
      },
    },
  };
}

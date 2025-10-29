import { GlobalResources } from "@components/globals.ts";
import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as cloudflare from "@pulumi/cloudflare";
import { ComponentResource, Output, ComponentResourceOptions, mergeOptions, Input, output, interpolate, asset } from "@pulumi/pulumi";
import * as adguard from "@pulumi/adguard";
import * as unifi from "@pulumi/unifi";
import { GatusDefinition } from "@openapi/application-definition.js";
import { mkdirSync, write } from "fs";
import { addUptimeGatus } from "@components/helpers.ts";

export class StandardDns extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly ipAddress: Output<string>;
  public readonly unifi: unifi.DnsRecord;
  public readonly cloudflare: cloudflare.DnsRecord;
  public readonly adguard: adguard.Rewrite;

  constructor(
    name: string,
    args: {
      hostname: Input<string>;
      ipAddress: Input<string>;
      type: "A" | "CNAME";
      record?: Input<string>;
    },
    globals: GlobalResources,
    cro: ComponentResourceOptions
  ) {
    super("custom:resource:StandardDns", name, {}, mergeOptions(cro, { deleteBeforeReplace: true }));

    this.unifi = new unifi.DnsRecord(
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
        provider: globals.unifiProvider,
        deleteBeforeReplace: true,
      }
    );

    this.cloudflare = new cloudflare.DnsRecord(
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
        provider: globals.cloudflareProvider,
        deleteBeforeReplace: true,
      }
    );

    this.adguard = new adguard.Rewrite(
      `${name}-adguard`,
      {
        domain: args.hostname,
        answer: args.ipAddress,
      },
      {
        parent: this,
        provider: globals.adguardProvider,
        deleteBeforeReplace: true,
      }
    );
    this.hostname = output(args.hostname);
    this.ipAddress = output(args.ipAddress);
    addGatusDnsRecord(name, args);
  }
}

const dnsServers = {
  "10.10.10.9": "Alpha Site",
  "10.10.0.1": "Discord",
  "10.10.209.201": "Stargate Command",
  "9.9.9.9": "Quad9",
  "1.1.1.1": "CloudFlare",
};

export const gatusDnsRecords: Output<GatusDefinition>[] = [];

function addGatusDnsRecord(
  name: string,
  args: {
    hostname: Input<string>;
    ipAddress: Input<string>;
    type: "A" | "CNAME";
    record?: Input<string>;
  }
) {
  for (const [ip, server] of Object.entries(dnsServers)) {
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
        conditions: [interpolate`[BODY] == any(${bodyConfig})`, "[DNS_RCODE] == NOERROR"],
      })
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
      ipAddress: {
        type: TypeEnum.String,
        value: dns.ipAddress,
      },
    },
  };
}

import { GlobalResources } from "@components/globals.ts";
import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as cloudflare from "@pulumi/cloudflare";
import { ComponentResource, Output, ComponentResourceOptions, mergeOptions, Input, output, interpolate, asset } from "@pulumi/pulumi";
import * as adguard from "@pulumi/adguard";
import * as unifi from "@pulumi/unifi";
import { GatusDefinition } from "@openapi/application-definition.js";
import { mkdirSync, write } from "fs";
import { writeFile } from "fs/promises";
import * as yaml from "yaml";
import { awaitOutput } from "@components/helpers.ts";
import { remote } from "@pulumi/command";
import { md5 } from "@pulumi/std";

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
    addGatusDnsRecord(name, args, globals, this);
  }
}

const dnsServers = {
  "10.10.10.9": "Alpha Site",
  "10.10.0.1": "Discord",
  "10.10.209.201": "Stargate Command",
  "9.9.9.9": "Quad9",
  "1.1.1.1": "CloudFlare",
};

function addGatusDnsRecord(
  name: string,
  args: {
    hostname: Input<string>;
    ipAddress: Input<string>;
    type: "A" | "CNAME";
    record?: Input<string>;
  },
  globals: GlobalResources,
  parent: ComponentResource
) {
  const records: Input<GatusDefinition>[] = [];
  for (const [ip, server] of Object.entries(dnsServers)) {
    records.push(
      output({
        name: args.hostname,
        url: ip,
        group: `DNS @ ${server}`,
        dns: {
          "query-name": args.hostname,
          "query-type": args.type,
        },
        conditions: [interpolate`[BODY] == ${args.type === "A" ? args.ipAddress : args.record}`, "[DNS_RCODE] == NOERROR"],
      })
    );
  }
  mkdirSync(`./.tmp/`, { recursive: true });
  output(records).apply(async (endpoints) => {
    const content = yaml.stringify({ endpoints });
    const id = (await md5({ input: content })).result;
    await writeFile(`./.tmp/dnsrecord-${name}.yaml`, content);

    new remote.CopyToRemote(
      `${name}-dns-records`,
      {
        connection: {
          host: interpolate`dockge-as.${globals.tailscaleDomain}`,
          user: "root",
        },
        source: new asset.FileAsset(`./.tmp/dnsrecord-${name}.yaml`),
        remotePath: `/opt/stacks/uptime/config/dns-${name}.yaml`,
        triggers: [id],
      },
      { parent }
    );
  });
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

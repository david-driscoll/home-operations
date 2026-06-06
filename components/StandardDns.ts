import { GlobalResources } from "@components/globals.ts";
import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import * as cloudflare from "@pulumi/cloudflare";
import { ComponentResource, Output, ComponentResourceOptions, mergeOptions, Input, output, interpolate, all, getStack, log } from "@pulumi/pulumi";
import * as adguard from "@pulumi/adguard";
import * as unifi from "@pulumiverse/unifi";
import { GatusDefinition } from "@openapi/application-definition.js";
import { dns } from "@components/constants.ts";
import { addUptimeGatus, awaitOutput } from "./helpers.ts";

export class StandardDns extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly unifi: unifi.dns.Record;
  public readonly cloudflare: cloudflare.DnsRecord;
  // public readonly adguard: adguard.Rewrite;

  public static async create(
    name: string,
    args: {
      hostname: string;
      ipAddress?: Input<string>;
      type: "A" | "CNAME";
      record?: Input<string>;
    },
    globals: GlobalResources,
    cro: ComponentResourceOptions,
  ) {
    const record =
      args.record ??
      args.ipAddress ??
      (() => {
        throw new Error("Either ipAddress or record must be provided");
      })();

    const unifiRecords = unifi.dns.getRecordsOutput({}, { provider: globals.unifiProvider });
    const unifiRecordId = unifiRecords.results.apply((results) => results.find((r) => r.name === args.hostname)?.id).apply((id) => (id ? `default:${id}` : undefined));
    const cloudflareRecords = cloudflare.getDnsRecordsOutput(
      {
        zoneId: globals.cloudflareZoneId,
        name: { exact: all([args.hostname, globals.searchDomain]).apply(([h, s]) => h.replace(`.${s}`, "")) },
        maxItems: 100,
      },
      { provider: globals.cloudflareProvider },
    );
    cloudflareRecords.apply((r) => log.info(`Cloudflare records for ${name}: ${r.results.map((rec) => rec.name).join(", ")}`, globals));
    const cloudflareRecordId = all([globals.cloudflareZoneId, cloudflareRecords.apply((z) => z.results.find((r) => r.name === args.hostname)?.id)]).apply(([zoneId, id]) =>
      id ? `${zoneId}/${id}` : undefined,
    );
    const [unifiId, cloudflareId] = await awaitOutput(all([unifiRecordId, cloudflareRecordId]));
    return new StandardDns(name, { hostname: args.hostname, ipAddress: args.ipAddress, type: args.type, record, unifiId, cloudflareId }, globals, cro);
  }

  private constructor(
    name: string,
    args: {
      hostname: string;
      ipAddress?: Input<string>;
      type: "A" | "CNAME";
      record?: Input<string>;
      unifiId: string | undefined;
      cloudflareId: string | undefined;
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
        import: args.unifiId,
      },
    );

    this.cloudflare = new cloudflare.DnsRecord(
      `${name}-cloudflare`,
      {
        name: args.hostname,
        zoneId: globals.cloudflareCredential.zoneId,
        content: record,
        type: args.type,
        ttl: 1,
      },
      {
        parent: this,
        provider: globals.cloudflareProvider,
        deleteBeforeReplace: true,
        import: args.cloudflareId,
      },
    );

    // this.adguard = new adguard.Rewrite(
    //   `${name}-adguard`,
    //   {
    //     domain: args.hostname,
    //     answer: record,
    //   },
    //   {
    //     parent: this,
    //     provider: globals.adguardProvider,
    //     deleteBeforeReplace: true,
    //   },
    // );
    this.hostname = output(args.hostname);
    addGatusDnsRecord(name, args);
  }
}
const gatusDnsRecords: Output<GatusDefinition>[] = [];

export function createGatusDnsUptime(globals: GlobalResources, options: { parent?: ComponentResource }) {
  const dnsParent = new ComponentResource("custom:home:StandardDnsParent", "standard-dns", options ?? {});

  return all([gatusDnsRecords]).apply(async ([endpoints]) => {
    return addUptimeGatus(`dns-${getStack()}`, globals, { endpoints: [...endpoints] }, dnsParent);
  }).apply(a => a);
}

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
        name: output(args.hostname).apply((h) => `${h.replace(/\./g, "_")}-${args.type}`),
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

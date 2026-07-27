import { dns } from "@components/constants.ts";
import type { GlobalResources } from "@components/globals.ts";
import { type OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import type { GatusDefinition } from "@openapi/application-definition.js";
import * as cloudflare from "@pulumi/cloudflare";
import { all, ComponentResource, type ComponentResourceOptions, getStack, type Input, interpolate, mergeOptions, type Output, output } from "@pulumi/pulumi";
import * as technitium from "@pulumi/technitium";
import * as unifi from "@pulumiverse/unifi";
import { addUptimeGatus, awaitOutput } from "./helpers.ts";

export class StandardDns extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly unifi: unifi.dns.Record;
  public readonly cloudflare: cloudflare.DnsRecord;
  public readonly technitium: technitium.Record;
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
    const unifiRecordId = unifiRecords.results.apply(results => results.find(r => r.name === args.hostname)?.id).apply(id => (id ? `default:${id}` : undefined));
    // Deliberately NOT adopting pre-existing Cloudflare records via `import`.
    //
    // The provider's import id is `<zoneId>/<recordId>` but the id it stores in state is the
    // bare `<recordId>`, so `import` can never equal the resource's own state id. Pulumi
    // therefore re-runs the import step on every single update, and combined with the
    // `deleteBeforeReplace` below that destroys and recreates live DNS each run — any
    // interruption leaves the records deleted. This wiped all 56 managed records twice on
    // 2026-07-25.
    //
    // A collision with an existing Cloudflare record (error 81054) is instead handled by
    // reusing the old Pulumi resource name so it becomes a replacement rather than a create
    // — see the technitium record in `components/DockgeLxc.ts`.
    const cloudflareId = undefined;
    const unifiId = await awaitOutput(unifiRecordId);
    return new StandardDns(
      name,
      {
        hostname: args.hostname,
        ipAddress: args.ipAddress,
        type: args.type,
        record,
        unifiId,
        cloudflareId,
      },
      globals,
      cro,
    );
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

    // Override record inside the driscoll.tech conditional-forwarder zone on the
    // Technitium cluster (zone managed by stacks/unifi-network/technitium-zone.ts).
    // Names without an override fall through the zone's FWD record to public DNS.
    this.technitium = new technitium.Record(
      `${name}-technitium`,
      {
        zone: "driscoll.tech",
        name: args.hostname,
        type: args.type,
        value: record,
        ttl: 300,
      },
      {
        parent: this,
        provider: globals.technitiumProvider,
        deleteBeforeReplace: true,
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
        // `zoneId` is replace-triggering, and the program supplies it as a secret while the
        // provider reads it back as plaintext. Keep it out of the diff so a `[secret] =>
        // "c2ed…"` comparison can never plan a destroy/recreate of live DNS.
        ignoreChanges: ["zoneId"],
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

  return all([gatusDnsRecords])
    .apply(async ([endpoints]) => {
      return addUptimeGatus(`dns-${getStack()}`, globals, { endpoints: [...endpoints] }, dnsParent);
    })
    .apply(a => a);
}

function addGatusDnsRecord(
  _name: string,
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
    const bodyConfig = output(args.hostname).apply(_hostname => {
      if (args.type === "A") return args.ipAddress;
      return interpolate`${args.record}., ${args.record},`;
    });
    gatusDnsRecords.push(
      output({
        name: output(args.hostname).apply(h => `${h.replace(/\./g, "_")}-${args.type}`),
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

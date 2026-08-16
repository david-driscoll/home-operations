import { dns } from "@components/constants.ts";
import type { GlobalResources } from "@components/globals.ts";
import { type OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import type { GatusDefinition } from "@openapi/application-definition.js";
import * as cloudflare from "@pulumi/cloudflare";
import { all, ComponentResource, type ComponentResourceOptions, getStack, type Input, interpolate, log, mergeOptions, type Output, output } from "@pulumi/pulumi";
import * as technitium from "@pulumi/technitium";
import * as unifi from "@pulumiverse/unifi";
import { addUptimeGatus } from "./helpers.ts";

export class StandardDns extends ComponentResource {
  public readonly hostname: Output<string>;
  public readonly unifi: unifi.dns.Record;
  public readonly cloudflare: cloudflare.DnsRecord;
  public readonly technitium: technitium.Record;

  public static async create(
    name: string,
    args: {
      hostname: Input<string>;
      ipAddress?: Input<string>;
      type: "A" | "CNAME";
      record?: Input<string>;
      /**
       * TRANSIENT adoption of a pre-existing UniFi record. Format is `<site>:<recordId>`,
       * e.g. `default:68f45bc5015fc104b3a3db19`.
       *
       * Set this ONLY for the single run that adopts the record, then delete the line. It is
       * not a permanent property: the provider stores the bare `<recordId>` in state, so this
       * value can never equal the resource's own id and every later run re-plans a replace.
       * See the block comment below for what that cost in July 2026.
       */
      unifiImportId?: string;
      /**
       * TRANSIENT adoption of a pre-existing Cloudflare record. Format is
       * `<zoneId>/<recordId>`, e.g. `c2eddc…/9493f8…`.
       *
       * Same rule as `unifiImportId`: one run, then remove it.
       */
      cloudflareImportId?: string;
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

    // Deliberately NOT adopting pre-existing UniFi records via `import` either — same defect
    // as Cloudflare below, confirmed against live state on 2026-07-28.
    //
    // The provider's import id is `<site>:<recordId>` (`default:6a12…`) but the id it stores
    // in state is the bare `<recordId>`, so `import` can never equal the resource's own state
    // id. This used to be fed from a live `unifi.dns.getRecordsOutput` lookup, which meant a
    // record was created with `import: undefined` on the run that made it and then, on the
    // very next run, the lookup found it and supplied `import: "default:<id>"`. That
    // transition makes Pulumi plan a replace-by-import, and the `deleteBeforeReplace` below
    // turns it into delete-then-adopt: the live record is destroyed first. If the update dies
    // before the import checkpoint lands, the record stays deleted and state keeps the dead
    // id — every subsequent delete then 404s and wedges the stack.
    //
    // Evidence at the time of removal: across gulf-of-mexico/home-operations/ocracoke, 45/45
    // records carrying an `importID` had `importID == "default:" + id` and were healthy,
    // while every entry that had *not* completed the cycle pointed at an id the controller no
    // longer had — nine destroyed records in total (`pbs.luna`, `pbs.celestia`,
    // `netbootxyz`, `arcane`, `pbs.skystar`, `backrest.skystar`, and the three
    // `<node>.dns` records), plus three `delete: true` twins still queued to destroy the
    // `arcane-agent.*` records they share an id with.
    //
    // A collision with an existing UniFi record is handled the same way as Cloudflare: reuse
    // the old Pulumi resource name so it becomes a replacement rather than a create.
    //
    // ADOPTION IS NOW OPT-IN, PER CALL, AND MEANT TO BE TRANSIENT (`args.unifiImportId`).
    // Two things make that safe enough to allow, and both matter:
    //   1. It is never derived from a live lookup any more, so the silent
    //      `undefined -> "default:<id>"` transition that caused the damage cannot happen on
    //      its own. A human writes the id, for one run, on purpose.
    //   2. `deleteBeforeReplace` is dropped for as long as an import id is set (see the
    //      constructor). That is the mechanism that turned "a replace was planned" into
    //      "the live record was destroyed first". Without it a mis-planned replace fails
    //      closed on "record already exists" and leaves DNS untouched.
    // Leaving the id in place after adoption does NOT wipe records, but it will wedge the
    // stack on that error every run — which is the intended, loud failure mode.
    const unifiId = args.unifiImportId;
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
    //
    // As with UniFi above, adoption is now opt-in per call via `args.cloudflareImportId` and
    // is meant to last exactly one run. The id mismatch described above is unchanged and
    // unfixable from here — the guardrail is that `deleteBeforeReplace` is dropped while an
    // import id is set, so the re-planned replace fails closed (error 81054, "record already
    // exists") instead of destroying and recreating live DNS. Remove the id once the record
    // is in state.
    const cloudflareId = args.cloudflareImportId;
    // Adoption ids are transient by design; say so on every run that carries one, so a
    // leftover cannot sit quietly in the tree until the next replace surprises someone.
    if (args.unifiImportId !== undefined || args.cloudflareImportId !== undefined) {
      log.warn(
        `StandardDns "${name}" is carrying an adoption import id (unifi=${args.unifiImportId ?? "-"}, cloudflare=${args.cloudflareImportId ?? "-"}). ` +
          "These are ONE-RUN values: remove them once the records are in state. Left in place they re-plan a replace every update, " +
          "which now fails closed rather than deleting live DNS — but it will wedge this stack.",
      );
    }

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
      hostname: Input<string>;
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
        // THE GUARDRAIL. `deleteBeforeReplace` is what converted a planned replace into a
        // destroyed record in the 2026-07-28 incident. While an import id is set the import
        // id can never match the state id, so a replace WILL be re-planned on the next run —
        // without delete-first that plan fails on "record already exists" and live DNS is
        // untouched. Once the id is removed the normal ordering comes back.
        deleteBeforeReplace: args.unifiId === undefined,
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
        // Same guardrail as the UniFi record above — this is the option that turned the
        // 2026-07-25 re-import loop into 56 wiped records, twice.
        deleteBeforeReplace: args.cloudflareId === undefined,
        import: args.cloudflareId,
        // `zoneId` is replace-triggering, and the program supplies it as a secret while the
        // provider reads it back as plaintext. Keep it out of the diff so a `[secret] =>
        // "c2ed…"` comparison can never plan a destroy/recreate of live DNS.
        ignoreChanges: ["zoneId"],
      },
    );

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

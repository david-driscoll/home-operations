import { ComponentResource, ComponentResourceOptions, interpolate, mergeOptions, output, Output } from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";
import { DnsRecord as CloudflareDnsRecord } from "@pulumi/cloudflare";
import { DnsRecord as UnifiDnsRecord } from "@pulumi/unifi";
import { Rewrite } from "@pulumi/adguard";
import { OnePasswordItemSectionInput, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";

export function getHostnames(name: string, globals: GlobalResources) {
  const hostname = interpolate`${name}.host.${globals.searchDomain}`;
  const tailscaleHostname = interpolate`${name}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleHostname };
}

export function getContainerHostnames(name: string, host: ProxmoxHost, globals: GlobalResources) {
  const hostname = interpolate`${host.name}.${globals.searchDomain}`;
  const tailscaleName = interpolate`${name}-${host.shortName ?? host.name}`;
  const tailscaleHostname = interpolate`${tailscaleName}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleName, tailscaleHostname };
}

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
        type: args.type,
        record: args.record ?? args.ipAddress,
        ttl: 0,
      },
      mergeOptions(cro, {
        parent: this,
        provider: globals.unifiProvider,
        deleteBeforeReplace: true,
      }),
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
      mergeOptions(cro, {
        parent: this,
        provider: globals.cloudflareProvider,
        deleteBeforeReplace: true,
      }),
    );
    // TODO: pull this value from unifi later
    this.adguard = new Rewrite(
      `${name}-adguard`,
      {
        domain: args.hostname,
        answer: args.ipAddress,
      },
      mergeOptions(cro, {
        parent: this,
        provider: globals.adguardProvider,
        deleteBeforeReplace: true,
      }),
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

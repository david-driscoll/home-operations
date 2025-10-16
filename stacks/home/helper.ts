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

export function createDnsRecord(
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
  const unifi = new UnifiDnsRecord(
    name,
    {
      name: args.hostname,
      type: args.type,
      record: args.record ?? args.ipAddress,
      ttl: 0,
    },
    mergeOptions(cro, {
      provider: globals.unifiProvider,
      deleteBeforeReplace: true,
    }),
  );
  const cloudflare = new CloudflareDnsRecord(
    name,
    {
      name: args.hostname,
      zoneId: globals.cloudflareCredential.apply((z) => z.fields?.zoneId?.value!),
      content: args.record ?? args.ipAddress,
      type: args.type,
      ttl: 1,
    },
    mergeOptions(cro, {
      provider: globals.cloudflareProvider,
      deleteBeforeReplace: true,
    }),
  );
  const adguard = new Rewrite(
    name,
    {
      domain: args.hostname,
      answer: args.ipAddress,
    },
    mergeOptions(cro, {
      provider: globals.adguardProvider,
      deleteBeforeReplace: true,
    }),
  );
  return { hostname: args.hostname, ipAddress: output(args.ipAddress), unifi, cloudflare, adguard };
}

export function createDnsSection(dns: ReturnType<typeof createDnsRecord>): OnePasswordItemSectionInput {
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

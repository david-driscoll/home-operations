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
  const tailscaleName = interpolate`${name}-${host.name}`;
  const tailscaleHostname = interpolate`${tailscaleName}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleName, tailscaleHostname };
}

export function createDnsRecord(name: string, hostname: Output<string>, ipAddress: Output<string>, globals: GlobalResources, cro: ComponentResourceOptions) {
  const unifi = new UnifiDnsRecord(
    name,
    {
      name: hostname,
      type: "A",
      record: ipAddress,
      ttl: 0,
    },
    mergeOptions(cro, {
      provider: globals.unifiProvider,
      deleteBeforeReplace: true,
    })
  );
  const cloudflare = new CloudflareDnsRecord(
    name,
    {
      name: hostname,
      zoneId: globals.cloudflareCredential.apply((z) => z.fields?.zoneId?.value!),
      content: ipAddress,
      type: "A",
      ttl: 1,
    },
    mergeOptions(cro, {
      provider: globals.cloudflareProvider,
      deleteBeforeReplace: true,
    })
  );
  const adguard = new Rewrite(
    name,
    {
      domain: hostname,
      answer: ipAddress,
    },
    mergeOptions(cro, {
      provider: globals.adguardProvider,
      deleteBeforeReplace: true,
    })
  );
  return { hostname, ipAddress: output(ipAddress), unifi, cloudflare, adguard };
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

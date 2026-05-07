import * as pulumi from "@pulumi/pulumi";
import axios from "axios";
import * as unifi from "@pulumiverse/unifi";
import * as firewall from "@pulumi/terrifi";
import is_ip_private from "private-ip";
import type { components } from "../../types/tailscale.ts";

import { GlobalResources } from "../../components/globals.ts";
import { Tailscale } from "../../components/constants.ts";
import { getTailscaleClient } from "../../components/tailscale.ts";
import CIDRMatcher from "cidr-matcher";

export function createTailscaleAttDropFirewallRule(globals: GlobalResources) {
  const matcher = new CIDRMatcher([Tailscale.subnets.home]);
  const devices = pulumi.output(getTailscaleClient()).apply(async (client) => {
    const devices = await client.GET("/tailnet/{tailnet}/devices", {
      params: {
        path: { tailnet: "-" },
        query: { fields: "all" },
      },
    });
    const devicesIncludingDrops: { device: components["schemas"]["Device"]; ipv4IpsToDrop: { ip: string; port: number }[]; ipv6IpsToDrop: { ip: string; port: number }[] }[] = [];
    const peerRelays: string[] = [];
    for (const device of devices.data?.devices ?? []) {
      const ipv6IpsToDrop: { ip: string; port: number }[] = [];
      const ipv4IpsToDrop: { ip: string; port: number }[] = [];
      const endpoints = device.clientConnectivity?.endpoints ?? [];
      for (const { ip, port } of endpoints.map((e) => ({ ip: e.substring(0, e.lastIndexOf(":")).replace("[", "").replace("]", ""), port: +e.substring(e.lastIndexOf(":") + 1) }))) {
        if (device.tags?.includes(Tailscale.tag.peerRelay) && matcher.contains(ip)) {
          peerRelays.push(ip);
          continue;
        }
        if (is_ip_private(ip)) {
          continue;
        }

        const ipDetails = await getIpDetails(ip);
        if (!ipDetails) continue;
        if (ipDetails.type !== "isp") continue;
        if (ipDetails.domain !== "att.com") continue;
        if (ipDetails.country_code !== "US") continue;

        if (ipDetails.ip_version === "4") {
          ipv4IpsToDrop.push({ ip, port });
        } else if (ipDetails.ip_version === "6") {
          ipv6IpsToDrop.push({ ip, port });
        }
      }
      if (ipv4IpsToDrop.length > 0 || ipv6IpsToDrop.length > 0) {
        devicesIncludingDrops.push({ device, ipv4IpsToDrop, ipv6IpsToDrop });
      }
    }
    return { devices: devicesIncludingDrops, peerRelays };
  });

  devices.apply(({ devices, peerRelays }) => {
    pulumi.log.info(`Found ${devices.length} Tailscale devices with AT&T IPs to drop`);
    pulumi.log.info(`Found ${peerRelays.length} Tailscale devices tagged as peer relays: ${peerRelays.map((d) => d).join(", ")}`);
  });

  const internalZone = unifi.firewall.getZoneOutput({ name: "Internal" }, { provider: globals.unifiProvider });
  const externalZone = unifi.firewall.getZoneOutput({ name: "External" }, { provider: globals.unifiProvider });

  return devices.apply(({ devices, peerRelays }) => {
    if (peerRelays.length === 0) {
      pulumi.log.info("No peer relays found, skipping firewall rule creation");
      return;
    }
    for (const { device, ipv4IpsToDrop, ipv6IpsToDrop } of devices) {
      if (ipv4IpsToDrop.length > 0) {
        for (const { ip, port } of ipv4IpsToDrop) {
          const firewallRule = new firewall.FirewallPolicy(
            `att-tailscale-drop-ipv4-${device.hostname}-${ip.replace(/\./g, "-")}`,
            {
              enabled: true,

              action: "BLOCK", // REJECT ?
              connectionStateType: "ALL",
              protocol: "all",
              ipVersion: "IPV4",

              source: {
                zoneId: externalZone.id,
                ips: [ip],
                port: port,
              },
              destination: {
                zoneId: internalZone.id,
                ips: peerRelays.map((d) => d),
                matchOppositeIps: true,
              },
              schedule: {
                mode: "ALWAYS",
              },
            },
            { provider: globals.unifiFirewallProvider },
          );
        }
      }

      if (ipv6IpsToDrop.length > 0) {
        for (const { ip, port } of ipv6IpsToDrop) {
          const firewallRule = new firewall.FirewallPolicy(
            `att-tailscale-drop-ipv6-${device.hostname}-${ip.replace(/:/g, "-")}`,
            {
              enabled: true,

              action: "BLOCK", // REJECT ?
              connectionStateType: "ALL",
              protocol: "all",
              ipVersion: "IPV6",

              source: {
                zoneId: externalZone.id,
                ips: [ip],
                port: port,
              },
              destination: {
                zoneId: internalZone.id,
                // TOOD: peer-relays that have ipv6?
              },
              schedule: {
                mode: "ALWAYS",
              },
            },
            { provider: globals.unifiFirewallProvider },
          );
        }
      }
    }
  });
}

interface IPInfo {
  ip: string;
  ip_version: string;
  type: string;
  company: string;
  domain: string;
  network: string;
  rir: string;
  ASN: number;
  city: string;
  country_code: string;
  state1: string;
  postcode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  abuse_contact: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  abuser_score: string;
}

async function getIpDetails(ip: string) {
  try {
    const url = `https://api.ipdetails.io/?ip=${ip}`;
    const resp = await axios.get<IPInfo>(url, { timeout: 10000 });
    return resp.data;
  } catch (e) {
    return null;
  }
}

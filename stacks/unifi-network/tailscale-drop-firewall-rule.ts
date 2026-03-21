import * as pulumi from "@pulumi/pulumi";
import axios from "axios";
import * as tailscale from "@pulumi/tailscale";
import * as unifi from "@pulumi/unifi";
import is_ip_private from "private-ip";

import { GlobalResources } from "../../components/globals.ts";
import { awaitOutput } from "../../components/helpers.ts";

export function createTailscaleAttDropFirewallRule(globals: GlobalResources) {
  const devices = tailscale.getDevicesOutput({}, { provider: globals.tailscaleProvider }).apply(async (result) => {
    const devicesIncludingDrops: { device: (typeof result.devices)[0]; ipv4IpsToDrop: Set<string>; ipv6IpsToDrop: Set<string> }[] = [];
    for (const device of result.devices) {
      const ipv6IpsToDrop = new Set<string>();
      const ipv4IpsToDrop = new Set<string>();
      for (const endpoint of device.addresses ?? []) {
        let [ip, port] = endpoint.split(":");
        if (ip.startsWith("[") && ip.endsWith("]")) {
          ip = ip.slice(1, -1);
        }
        if (is_ip_private(ip)) {
          continue;
        }
        const ipDetails = await getIpDetails(ip);
        if (!ipDetails) continue;
        if (ipDetails.type !== "isp") continue;
        if (ipDetails.domain !== "att.com") continue;
        if (ipDetails.country_code !== "US") continue;
        if (ipDetails.ip_version === 4) {
          ipv4IpsToDrop.add(ip);
        } else if (ipDetails.ip_version === 6) {
          ipv6IpsToDrop.add(ip);
        }
      }
      if (ipv4IpsToDrop.size > 0 || ipv6IpsToDrop.size > 0) {
        devicesIncludingDrops.push({ device, ipv4IpsToDrop, ipv6IpsToDrop });
      }
    }
    return devicesIncludingDrops;
  });

  return devices.apply((devices) => {
    const ipv6Ips: string[] = [];
    const ipv4Ips: string[] = [];
    for (const { device, ipv4IpsToDrop, ipv6IpsToDrop } of devices) {
      pulumi.log.info(`Device ${device.name} has ${ipv4IpsToDrop.size} IPv4 IPs to drop: ${[...ipv4IpsToDrop].join(", ")}`);
      pulumi.log.info(`Device ${device.name} has ${ipv6IpsToDrop.size} IPv6 IPs to drop: ${[...ipv6IpsToDrop].join(", ")}`);
      ipv6Ips.push(...ipv6IpsToDrop);
      ipv4Ips.push(...ipv4IpsToDrop);
    }
    const ipv4FirewallGroup = new unifi.FirewallGroup(
      `att-tailscale-ips-to-drop-ipv4`,
      {
        type: "address-group",
        members: [...ipv4Ips],
      },
      { provider: globals.unifiProvider },
    );

    const ipv6FirewallGroup = new unifi.FirewallGroup(
      `att-tailscale-ips-to-drop-ipv6`,
      {
        type: "ipv6-address-group",
        members: [...ipv6Ips],
      },
      { provider: globals.unifiProvider },
    );
    const firewallRule = new unifi.FirewallRule(
      `att-tailscale-drop`,
      {
        action: "drop",
        enabled: true,
        ruleset: "WAN_IN",
        protocol: "all",
        protocolV6: "all",
        ruleIndex: 2223,
        srcFirewallGroupIds: [ipv4FirewallGroup.id, ipv6FirewallGroup.id],
      },
      { provider: globals.unifiProvider },
    );
    return firewallRule;
  });
}

interface IPInfo {
  ip: string;
  ip_version: number;
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

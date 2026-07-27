/**
 * Technitium zone scaffolding for split-horizon DNS.
 *
 * Creates a Conditional Forwarder zone for driscoll.tech on the Technitium
 * cluster (created on the primary; cluster sync replicates it). StandardDns
 * records across all stacks land in this zone as overrides; anything without an
 * override follows the FWD record upstream, so public Cloudflare records keep
 * resolving for internal clients.
 */

import * as pulumi from "@pulumi/pulumi";
import * as technitium from "@pulumi/technitium";
import type { GlobalResources } from "../../components/globals.ts";

export function configureTechnitiumZones(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:technitium:Zones", "technitium-zones", {});
  const cro = { parent, provider: globals.technitiumProvider };

  const zone = new technitium.Zone(
    "driscoll-tech",
    {
      name: "driscoll.tech",
      type: "Forwarder",
    },
    { ...cro, protect: true, retainOnDelete: true },
  );

  addForwarderRecord(cro, zone, "www.david-driscoll.com", "dns.quad9.net:853 ([2620:fe::fe])");
  addForwarderRecord(cro, zone, "www.david-driscoll.com", "dns.quad9.net:853 ([2620:fe::9])");
  addForwarderRecord(cro, zone, "www.david-driscoll.com", "dns.quad9.net:853 (9.9.9.9)");
  addForwarderRecord(cro, zone, "www.david-driscoll.com", "dns.quad9.net:853 (149.112.112.112)");

  return { zone };
}

function addForwarderRecord(cro: pulumi.ComponentResourceOptions, zone: technitium.Zone, name: string, target: string) {
  return new technitium.Record(
    `fwd-${name}`,
    {
      zone: zone.name.apply(z => z!),
      name,
      type: "FWD",
      value: target,
      protocol: "Quic",
    },
    cro,
  );
}

/**
 * Technitium zone scaffolding for split-horizon DNS.
 *
 * Creates a Conditional Forwarder zone for <root domain> on the Technitium
 * cluster (created on the primary; cluster sync replicates it). StandardDns
 * records across all stacks land in this zone as overrides; anything without an
 * override follows the FWD record upstream, so public Cloudflare records keep
 * resolving for internal clients.
 */

import * as pulumi from "@pulumi/pulumi";
import * as technitium from "@pulumi/technitium";
import { rootDomain, rootDomainSlug } from "../../components/domains.ts";
import type { GlobalResources } from "../../components/globals.ts";

export function configureTechnitiumZones(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:technitium:Zones", "technitium-zones", {});
  const cro = { parent, provider: globals.technitiumProvider };

  // Both from the environment (components/domains.ts). The resource name is
  // the slug it has always been, so this protected zone keeps its URN.
  const root = rootDomain();
  const zone = new technitium.Zone(
    rootDomainSlug(),
    {
      name: root,
      type: "Forwarder",
      // external-dns runs `--rfc2136-tsig-axfr` against this zone to learn what
      // already exists before it reconciles. A new Technitium zone denies zone
      // transfer, so every AXFR came back REFUSED ("bad xfr rcode: 5"), every
      // cycle re-created every record, and the writes succeeding kept it
      // silent. The requests arrive through each cluster's tailscale egress
      // proxy, so they source from the tailnet CGNAT range rather than a fixed
      // address; the TSIG key below is the actual authentication.
      //
      // NONE OF THIS APPLIES UNTIL THE ZONE OVERRIDES ITS CATALOG. The zone is
      // a member of the cluster catalog, and a member inherits the catalog's
      // transfer policy (the cluster nodes' addresses, the catalog's TSIG key)
      // unless `overrideCatalogZoneTransfer` is set on it. The provider has no
      // field for that flag, so it is set by hand in Technitium (Zone Options
      // -> Zone Transfer). Without it these two lists are stored and ignored,
      // which is what refused external-dns until 2026-10-03 -- silently under
      // external-dns 0.22, fatally from 0.23.
      //
      // With the override ON, this list is the WHOLE policy, so it must also
      // admit the cluster's own secondaries: they sign with the catalog key,
      // and equestria's node is on the LAN, outside the tailnet range.
      allowTransfers: ["100.64.0.0/10", "10.10.206.202"],
      zoneTransferTsigKeyNames: ["external-dns", `cluster-catalog.dns.${root}`],
    },
    { ...cro, protect: true, retainOnDelete: true },
  );

  addForwarderRecord(cro, zone, root, "dns.quad9.net:853 ([2620:fe::fe])");
  addForwarderRecord(cro, zone, root, "dns.quad9.net:853 ([2620:fe::9])");
  addForwarderRecord(cro, zone, root, "dns.quad9.net:853 (9.9.9.9)");
  addForwarderRecord(cro, zone, root, "dns.quad9.net:853 (149.112.112.112)");

  return { zone };
}

function addForwarderRecord(cro: pulumi.ComponentResourceOptions, zone: technitium.Zone, name: string, target: string) {
  // Resource name carries the target's IP so multiple upstreams for the same
  // record name stay distinct; overwrite=false makes each record additive to
  // the FWD record set instead of replacing its siblings.
  const suffix = (target.match(/\(([^)]+)\)/)?.[1] ?? target).replace(/[^a-zA-Z0-9]+/g, "-");
  return new technitium.Record(
    `fwd-${name}-${suffix}`,
    {
      zone: zone.name.apply(z => z!),
      name,
      type: "FWD",
      value: target,
      protocol: "Quic",
      overwrite: false,
    },
    cro,
  );
}

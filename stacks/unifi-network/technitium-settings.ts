/**
 * Technitium server settings, managed in code (D46).
 *
 * `technitium.ServerSettings` is a singleton (id `server-settings`) written to
 * the cluster primary through `globals.technitiumProvider`; cluster sync
 * carries the settings to the secondaries. Destroying it only drops it from
 * state -- the server keeps whatever it last had.
 *
 * EVERY DEFAULTED FIELD IS PINNED. About 19 attributes carry a static default
 * in the provider (darkhonor v1.3.0) and are sent on every create/update
 * whether they are declared or not -- `logQueries=true`,
 * `enableDnsOverTls=false`, `loggingType=FileAndConsole`,
 * `dnssecValidation=true`, `randomizeName=true` and so on. Declaring only
 * `recursion` would silently reset all of them to the provider's STIG
 * defaults, so each one below is pinned to the value the live server held on
 * 2026-11-04. Change one only on purpose.
 *
 * FORWARDERS AND BLOCK LISTS ARE CODE TOO (D46 follow-up). Both were
 * hand-edited in the UI; they are pinned below to what the primary returned
 * from `/api/settings/get` on 2026-11-04, in the server's order and spelling,
 * so a hand edit now shows up as drift. Re-sending them is a no-op on the
 * server: it replaces the forwarders only when the list differs
 * (`ListEquals`) and re-downloads block lists only when the URL set changes
 * (`HasSameItems`). The provider compares forwarders position by position, so
 * keep the order. The custom allowed zones are the separate `AllowedZones`
 * resource below.
 *
 * NOT DECLARED, ON PURPOSE. The provider sends an optional list or
 * web-service attribute only when it is set, so leaving one out keeps it
 * hand-managed and untouched:
 * - the web-service block (ports, local addresses, TLS certificate path and
 *   its password): node-specific, the path names the node's own certificate,
 *   and the password is a secret that must stay out of code;
 * - the DNS-over-TLS/HTTPS certificate and its password: not modelled by the
 *   provider at all;
 * - TSIG keys (external-dns, the cluster catalog key): not modelled by this
 *   resource -- they stay in Technitium;
 * - zone-transfer / notify networks, the blocking bypass list and the custom
 *   blocking addresses: empty live (and unused with `NxDomain` blocking), and
 *   per-zone policy lives on the zone (technitium-zone.ts); the custom
 *   blocked-zone list is empty too;
 * - `recursionNetworkAcls`: unused with `AllowOnlyForPrivateNetworks`.
 */

import * as pulumi from "@pulumi/pulumi";
import * as technitium from "@pulumi/technitium";
import type { GlobalResources } from "../../components/globals.ts";

export function configureTechnitiumServerSettings(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:technitium:Settings", "technitium-settings", {});

  const settings = new technitium.ServerSettings(
    "server-settings",
    {
      // The one deliberate change (D46). Was `Allow`, an open resolver for
      // anything that can reach :53. `AllowOnlyForPrivateNetworks` is
      // TechnitiumLibrary's NetUtilities.IsPrivateIP: 127/8, 10/8,
      // 100.64/10, 169.254/16, 172.16/12, 192.168/16 and every IPv6 address
      // outside 2000::/3. So the LAN, NetBird (10.100/16), Tailscale (CGNAT
      // and fd7a::) and pod traffic all keep recursion; only public sources
      // lose it. Authoritative answers for our own zones are unaffected.
      recursion: "AllowOnlyForPrivateNetworks",

      // --- pinned to live values (provider defaults in brackets) ---
      dnssecValidation: false, // [true]
      qnameMinimization: true,
      randomizeName: false, // [true]

      logQueries: false, // [true]
      loggingType: "Console", // [FileAndConsole]
      maxLogFileDays: 365,

      enableBlocking: true,
      // Deliberate change (D46 follow-up), was true: a blocked name no
      // longer answers TXT queries with the reason and the block list that
      // matched it.
      allowTxtBlockingReport: false,
      blockingType: "NxDomain",
      blockingAnswerTtl: 30,
      blockListUpdateIntervalHours: 24,
      blockListUrls: [
        "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews/hosts",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/nrd7.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/nrd14-8.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/nrd21-15.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/nrd28-22.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/nrd35-29.txt",
        "https://shreshtait.com/newly-registered-domains/nrd-1m",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/tif-onlydomains.txt",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/dyndns-onlydomains.txt",
        "https://big.oisd.nl/domainswild2",
        "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/pro.plus-onlydomains.txt",
      ],

      serveStale: true,
      // Quad9 over DNS-over-QUIC. Technitium's canonical form is
      // `host:853 (ip)`: the name is the TLS server name, the address in
      // parentheses skips a bootstrap lookup. Order is significant to the
      // provider (a reorder is a diff); the server, with concurrent
      // forwarding on, queries them in parallel.
      forwarderProtocol: "Quic", // [Tls]
      forwarders: ["dns.quad9.net:853 ([2620:fe::fe])", "dns.quad9.net:853 ([2620:fe::9])", "dns.quad9.net:853 (9.9.9.9)", "dns.quad9.net:853 (149.112.112.112)"],

      // 853 (DoT) and 443 (DoH) are both served today. [false, false]
      enableDnsOverTls: true,
      enableDnsOverHttps: true,

      udpPayloadSize: 1232,
      cacheMinimumRecordTtl: 10,
      cacheMaximumRecordTtl: 604800,
    },
    {
      parent,
      provider: globals.technitiumProvider,
      // Adopt the existing singleton rather than "create" over it. Safe to
      // leave in place after the first `up`: once the resource is in state
      // the import option is a no-op.
      import: "server-settings",
      // A destroy is a no-op in the provider anyway; keep it out of state
      // churn by refusing it outright.
      protect: true,
    },
  );

  // The custom allowed zones (exceptions to the block lists), spelled as
  // `/api/allowed/export` lists them (keep the `*.` where it has one).
  // The provider has no import for this resource; its create adds only
  // entries the server does not already have, so on first `up` it adopts
  // these three without writing. Its refresh checks only the entries listed
  // here, so an entry added by hand in the UI is not reported as drift.
  const allowedZones = new technitium.AllowedZones(
    "allowed-zones",
    { domains: ["*.awstrack.me", "*.sofi.org", "webplayer.online"] },
    {
      parent,
      provider: globals.technitiumProvider,
      // A destroy would delete the entries from the server.
      protect: true,
    },
  );

  return { settings, allowedZones };
}

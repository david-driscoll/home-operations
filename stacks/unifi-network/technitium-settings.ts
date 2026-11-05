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
 * - the forwarders (the four Quad9 DoQ upstreams) and the block-list URLs:
 *   both live today and both still hand-edited in the UI. On import the
 *   provider records them as null, so declaring them shows as a pure
 *   addition in the plan and re-sends the same values; adopting them is a
 *   separate, no-op change once this one has landed;
 * - zone-transfer / notify networks and the blocking bypass list: empty live,
 *   and per-zone policy lives on the zone (technitium-zone.ts);
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
      // The estate would rather this were false (it answers TXT probes with
      // the blocking reason). Live is true; flipping it is its own change.
      allowTxtBlockingReport: true,
      blockingType: "NxDomain",
      blockingAnswerTtl: 30,
      blockListUpdateIntervalHours: 24,

      serveStale: true,
      // Not sent while `forwarders` is unset (the provider drops it), but it
      // has a default, so pin it to what the server reports to keep the
      // plan clean.
      forwarderProtocol: "Quic", // [Tls]

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

  return { settings };
}

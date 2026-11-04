/**
 * The home side of the NetBird relay at home (docs/plans/netbird-mirror.md, D32).
 *
 * Three pieces, all here because this stack already holds the UniFi, Technitium,
 * Equestria and OpenBao credentials they need, and resyncs every five minutes:
 *
 * 1. The port forward: WAN 443, TCP (WebSocket) and UDP (QUIC), to celestia's
 *    Dockge host on 33443, where docker/celestia/netbird-relay publishes the
 *    relay. UniFi opens the firewall for a port forward itself, as it does for
 *    the Tailscale peer-relay forwards (components/tailscale.ts createPeerRelayRule).
 * 2. The name: `relay-home.<root domain>` as a Technitium record for the home
 *    WAN address, read from the controller on every run. Private on purpose:
 *    Technitium is the LAN's resolver, the tailnet's, and NetBird's primary
 *    nameserver group, and nothing in public DNS names the home address.
 * 3. The certificate: cert-manager's Secret (kubernetes/apps/netbird-system/relay-home)
 *    copied into OpenBao, where the celestia stack renders it as files.
 *    Copied rather than pushed by ESO, whose OpenBao identity is read-only;
 *    the same call stacks/netbird makes for its `*.app` certificate.
 */

import * as kubernetes from "@kubernetes/client-node";
import * as pulumi from "@pulumi/pulumi";
import * as technitium from "@pulumi/technitium";
import * as unifi from "@pulumiverse/unifi";
import CIDRMatcher from "cidr-matcher";
import { baoKvSecret, baoProvenance } from "../../components/bao.ts";
import { Tailscale } from "../../components/constants.ts";
import { rootDomain } from "../../components/domains.ts";
import type { GlobalResources } from "../../components/globals.ts";
import { gatewayWanIpv4, HOME_RELAY, homeRelayDomain, type UnifiDevice } from "../../components/netbird/homeRelay.ts";

export function configureNetbirdHomeRelay(globals: GlobalResources) {
  const parent = new pulumi.ComponentResource("custom:netbird:HomeRelay", "netbird-relay-home", {});
  const portForward = homeRelayPortForward(globals, parent);
  const record = homeRelayRecord(globals, parent);
  copyHomeRelayCertificate(globals, parent);
  return { portForward, record };
}

function homeRelayPortForward(globals: GlobalResources, parent: pulumi.Resource) {
  // A missing host fails the run rather than skipping: a skip would plan the
  // forward's delete, and take the relay off the internet with nothing to say why.
  const fwdIp = globals.store.getTailscaleExports().apply(exports => {
    const host = exports.flatMap(exp => exp.hosts).find(h => h.name === HOME_RELAY.dockgeHost && h.nodeType === "dockge");
    if (!host?.internalIp) throw new Error(`netbird-relay: no LAN address for ${HOME_RELAY.dockgeHost} in the tailscale exports; refusing to touch the relay's port forward`);
    if (!new CIDRMatcher([Tailscale.subnets.home]).contains(host.internalIp)) {
      throw new Error(`netbird-relay: ${HOME_RELAY.dockgeHost} is at ${host.internalIp}, outside the home LAN; the home relay's port forward cannot reach it`);
    }
    return host.internalIp;
  });

  return new unifi.port.Forward(
    "netbird-relay-home",
    {
      name: "netbird-relay-home",
      portForwardInterface: "wan",
      protocol: "tcp_udp",
      srcIp: "any",
      dstPort: `${HOME_RELAY.wanPort}`,
      fwdIp,
      fwdPort: `${HOME_RELAY.lanPort}`,
    },
    { provider: globals.unifiProvider, parent },
  );
}

/**
 * `relay-home.<root domain>` in the Technitium zone (technitium-zone.ts), for
 * the WAN address the controller reports now. An address change reaches it on
 * the next run, at most five minutes later. A failed lookup fails the run: the
 * record keeps its last value rather than being blanked or deleted.
 *
 * LAN and tailnet clients get the same WAN address and reach the relay by the
 * gateway's hairpin NAT. There is no split-horizon answer for them: the relay
 * listens on 33443 on the LAN, not on the 443 every relay address carries.
 */
function homeRelayRecord(globals: GlobalResources, parent: pulumi.Resource) {
  const wanIp = pulumi.all([globals.unifiCredential.hostname, globals.unifiCredential.credential]).apply(async ([hostname, apiKey]) => {
    const response = await fetch(`${hostname}/proxy/network/api/s/default/stat/device`, { headers: { "X-API-KEY": apiKey ?? "", Accept: "application/json" } });
    if (!response.ok) throw new Error(`netbird-relay: the UniFi controller answered ${response.status} for its device list; the home relay's record is left as it is`);
    const body = (await response.json()) as { data?: UnifiDevice[] };
    return gatewayWanIpv4(body.data ?? []);
  });

  const root = rootDomain();
  return new technitium.Record(
    "netbird-relay-home-technitium",
    {
      zone: root,
      name: homeRelayDomain(root),
      type: "A",
      value: wanIp,
      ttl: 300,
    },
    { provider: globals.technitiumProvider, parent, deleteBeforeReplace: true },
  );
}

/**
 * kubernetes/apps/netbird-system/relay-home's Secret into OpenBao at
 * `apps/netbird/relay-home-tls` (`tls_crt`, `tls_key`). A missing Secret
 * (before cert-manager's first issue) or a refused read warns and skips;
 * baoKvSecret's retainOnDelete keeps the last copy in OpenBao meanwhile.
 */
function copyHomeRelayCertificate(globals: GlobalResources, parent: pulumi.Resource) {
  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn("netbird-relay: no OpenBao credentials; the home relay's certificate is not copied this run.", parent);
    return;
  }
  const { namespace, name } = HOME_RELAY.tlsSecret;
  const certificate = pulumi.secret(
    globals.store.getKubernetesClusters().apply(async clusters => {
      const equestria = clusters.find(cluster => cluster.key === "equestria");
      try {
        if (!equestria) throw new Error("no `equestria` cluster in the store");
        const config = new kubernetes.KubeConfig();
        config.loadFromString(equestria.kubeConfig);
        const secret = await config.makeApiClient(kubernetes.CoreV1Api).readNamespacedSecret({ namespace, name });
        const decode = (key: string) => Buffer.from(secret.data?.[key] ?? "", "base64").toString("utf8");
        const tlsCrt = decode("tls.crt");
        const tlsKey = decode("tls.key");
        if (!tlsCrt || !tlsKey) throw new Error("tls.crt or tls.key is empty");
        return { tlsCrt, tlsKey };
      } catch (error) {
        pulumi.log.warn(`netbird-relay: could not read ${namespace}/${name} (${(error as Error).message?.split("\n")[0]}); OpenBao keeps its last copy of the home relay's certificate.`, parent);
        return undefined;
      }
    }),
  );
  certificate.apply(cert => {
    if (!cert) return;
    baoKvSecret(
      "netbird-relay-home-tls",
      {
        mount: "secrets",
        path: HOME_RELAY.tlsBaoPath,
        data: { tls_crt: cert.tlsCrt, tls_key: cert.tlsKey },
        concealedFields: ["tls_key"],
        customMetadata: baoProvenance({ source: "stacks/unifi-network", copied_from: `kubernetes:equestria/${namespace}/${name}` }),
      },
      { provider: globals.baoProvider, parent },
    );
  });
}

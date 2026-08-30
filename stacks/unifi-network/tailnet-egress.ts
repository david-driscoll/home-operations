/**
 * The tailnet EGRESS services: how a pod in the equestria cluster reaches a
 * machine that only exists on the tailnet.
 *
 * Each one is an `ExternalName` Service annotated for the `tailnet-inbound`
 * ProxyGroup. The Tailscale operator turns it into a local ClusterIP that
 * forwards the declared ports out over the tailnet, because cluster pods have no
 * route to 100.64.0.0/10 of their own.
 *
 * WHY THIS LIVES IN THE NETWORK STACK
 * -----------------------------------
 * A port has to be open in TWO places or the traffic dies: the egress Service has
 * to forward it, and `acl-manager.ts` has to grant it. Until now the first half
 * was a hardcoded `extraPorts` table in
 * kubernetes/apps/tailscale-system/services/Update.cs and the second half was
 * here, and the comments in acl-manager.ts said so in as many words -- "the port
 * must be open in BOTH places or the failure reads as 'garage is down' from the
 * cluster". `grantedPort` below now asserts every forwarded port against the very
 * `Tailscale.ports.*` constant its grant is built from, so the two cannot drift:
 * removing a port from the constant fails this stack instead of quietly leaving a
 * forward that the ACL drops.
 *
 * WHAT IS DELIBERATELY *NOT* HERE
 * -------------------------------
 * Three Services stay hand-maintained Flux YAML, in
 * kubernetes/apps/tailscale-system/. Each one carries traffic that THIS STACK'S
 * OWN ABILITY TO RUN depends on, and unifi-network is run by the in-cluster
 * Pulumi operator (kubernetes/apps/pulumi/unifi-network):
 *
 *   services/bootstrap.yaml
 *     dockge-as        bao:8200           equestria's OpenBao auto-unseals through it
 *                      bao-dumps:2023     the nightly replication receiver
 *     dockge-celestia  garage-admin:3903  the operator's route to the Garage Admin API
 *
 *     dns-celestia     admin:53443        the Technitium admin API. components/globals.ts
 *                                         builds ONE technitiumProvider against
 *                                         `dns-celestia.<tailnet>` and PINGS it while
 *                                         constructing GlobalResources -- which every
 *                                         stack does before it creates anything. So if
 *                                         this Service is missing, no stack can run,
 *                                         including the one that would recreate it.
 *                                         That is not hypothetical: it is exactly what
 *                                         happened when the cutover below pruned it, and
 *                                         only a hand-applied Service broke the deadlock.
 *
 *   services/equestria-kubeproxy.yaml
 *     equestria-kubeproxy https:443       the operator's route to the API SERVER.
 *       `generateTailscaleKubeConfig` (components/store/index.ts) points every
 *       kubeconfig at https://<cluster>-kubeproxy.<tailnet>, so this is the
 *       connection the k8s provider below is itself dialling. Owning it would
 *       mean a stack that can delete the socket it is talking through.
 *
 * If this code owned the first pair and they went missing, the recovery path
 * would be: OpenBao cannot unseal -> external-secrets stops -> the operator's
 * AppRole secret cannot refresh -> this stack cannot run to put them back.
 * Leaving them in git means a bare-metal recovery needs nothing but SOPS and an
 * age key.
 *
 * The carve-out is per SERVICE, not per port: a Service cannot be half-owned by
 * Flux and half by Pulumi without the two fighting over `spec.ports`.
 * `proxmox-celestia` and `pbs-celestia` are separate objects and are managed here
 * as normal. `dns-celestia` used to be too, and that was the bug -- see its entry
 * above.
 *
 * ONE-TIME CUTOVER
 * ----------------
 * These objects were Flux-managed until this change. Flux must PRUNE them before
 * this stack can create them -- pulumi-kubernetes refuses to create an object
 * that already exists. Reconcile `cluster-apps` first, confirm the old Services
 * are gone, then run the stack. A run that lands early fails with "already
 * exists" and succeeds on the next pass; it does not corrupt anything.
 */

import type { TailscaleNetworkCapability } from "@openapi/tailscale-grants.js";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import { Tailscale } from "../../components/constants.ts";
import type { GlobalResources } from "../../components/globals.ts";

const NAMESPACE = "tailscale-system";

/** The kinds of machine that get an egress Service, keyed off the device's tag. */
export type ServiceKind = "dockge" | "proxmox" | "pbs" | "dns";

export interface PortDef {
  name: string;
  port: number;
  /** UDP entries ride alongside the TCP one of the same name/port. */
  protocol?: "UDP";
  /** blackbox_exporter module. Absent means "forward it, do not probe it". */
  probe?: "http_2xx" | "ssh_banner" | "tcp_connect" | "dns_soa";
  /**
   * Probe a different hostname than the tailnet FQDN, as `<server>.<this>.<root>`.
   * Only DoH needs it: Technitium serves a certificate whose only SAN is
   * `<server>.dns.<root>`, so probing the tailnet name fails TLS verification.
   * CoreDNS rewrites that name back to the tailnet one inside the cluster, so the
   * probe still hits the same endpoint and stays independent of Technitium
   * answering for itself.
   */
  probeDomain?: string;
  /** Appended to an http_2xx probe URL. */
  probePath?: string;
}

/**
 * Assert that a port this module forwards is also a port the ACL grants, and
 * return it. The two halves are the failure mode this module exists to remove:
 * a forward without a grant reads from inside the cluster as "the far end is
 * down", never as a policy problem.
 *
 * Takes the grant's own constant, so the check is against the same array
 * acl-manager.ts passes to `setGrant({ ip })` -- not a copy of it.
 */
function grantedPort(label: string, capabilities: readonly TailscaleNetworkCapability[], port: number): number {
  // TailscaleNetworkCapability admits bare numbers as well as "tcp:<port>", so
  // compare on the rendered string rather than on the union.
  if (!capabilities.map(String).includes(`tcp:${port}`)) {
    throw new Error(
      `Egress port tcp:${port} is not granted by Tailscale.ports.${label} ([${capabilities.join(", ")}]). Forwarding it without the grant makes the connection die in the ACL, which looks like the far end being down. Add it to the constant or drop the forward.`,
    );
  }
  return port;
}

/** Ports every machine of a kind gets. Per-server extras are below. */
const defaultPorts: Record<ServiceKind, PortDef[]> = {
  dockge: [
    { name: "https", port: 443 },
    { name: "ssh", port: grantedPort("ssh", Tailscale.ports.ssh, 22), probe: "ssh_banner" },
    // Every dockge host's docker-socket-proxy (docker/_common/docker-socket-proxy)
    // -- the toolhive-docker-* MCP servers reach this from the equestria
    // cluster. No probe: it speaks the raw Docker API, not HTTP 2xx on a
    // known path, same as "https" above going unprobed.
    { name: "docker-proxy", port: grantedPort("dockerSocketProxy", Tailscale.ports.dockerSocketProxy, 2375) },
  ],
  proxmox: [
    { name: "pve", port: grantedPort("proxmoxManagement", Tailscale.ports.proxmoxManagement, 8006), probe: "http_2xx" },
    { name: "ssh", port: grantedPort("ssh", Tailscale.ports.ssh, 22), probe: "ssh_banner" },
  ],
  pbs: [
    { name: "pbs", port: grantedPort("proxmoxBackupServer", Tailscale.ports.proxmoxBackupServer, 8007), probe: "http_2xx" },
    { name: "ssh", port: grantedPort("ssh", Tailscale.ports.ssh, 22), probe: "ssh_banner" },
  ],
  dns: [
    // Do53 (53), DoT (853), DoQ (853/udp), DoH (443), admin/API (53443).
    { name: "dns-tcp", port: grantedPort("dns", Tailscale.ports.dns, 53), probe: "dns_soa" },
    { name: "dns-udp", port: 53, protocol: "UDP" },
    { name: "dot", port: grantedPort("dns", Tailscale.ports.dns, 853), probe: "tcp_connect" },
    { name: "doq", port: 853, protocol: "UDP" },
    { name: "doh", port: grantedPort("dns", Tailscale.ports.dns, 443), probe: "http_2xx", probeDomain: "dns" },
    { name: "admin", port: grantedPort("technitiumManagement", Tailscale.ports.technitiumManagement, 53443) },
  ],
};

/** Per-server additions, on top of the kind's defaults. */
const extraPorts: Record<string, Partial<Record<ServiceKind, PortDef[]>>> = {
  // A NUT UPS daemon, reached only from inside the cluster. `ports.nut` exists
  // for the proxmox->proxmox grant; asserting against it keeps the number in one
  // place even though this particular hop needs no grant of its own.
  "alpha-site": {
    proxmox: [{ name: "nut", port: grantedPort("nut", Tailscale.ports.nut, 3493) }],
  },
  // `as` and `celestia` also have `dockge` entries. Those are the carve-out and
  // live in services/bootstrap.yaml, not here -- see the header. celestia's
  // garage-s3 port is on that same Service, so it goes with it; a Service cannot
  // be split between the two owners.
  luna: {
    // The Home Assistant voice pipeline: llama.cpp plus wyoming whisper/piper.
    // HA runs in this cluster on hostNetwork and reaches them through here --
    // the dockge-* names resolve to tailnet IPs its nodes cannot route.
    // Paired with the `home-assistant-wyoming` grant, which grants exactly the
    // constant these three are checked against.
    //
    // No probes: they speak their own protocols rather than answering a 2xx, and
    // the stacks' own Gatus checks already cover liveness.
    dockge: [
      { name: "llm", port: grantedPort("wyoming", Tailscale.ports.wyoming, 8080) },
      { name: "stt", port: grantedPort("wyoming", Tailscale.ports.wyoming, 10300) },
      { name: "tts", port: grantedPort("wyoming", Tailscale.ports.wyoming, 10200) },
    ],
  },
};

/**
 * Servers being decommissioned. A device stays in the Tailscale API until its
 * last node is wiped, which is far too late to stop monitoring it: the moment the
 * host is powered off its probes go to zero and the generic
 * BlackboxProbeFailingCritical rule pages after two minutes. Listing one here
 * drops it while it is still up and healthy, so the removal is a no-op against
 * live metrics. Remove the entry once the device is actually gone.
 */
const decommissionedServers = new Set(["sgc"]);

/**
 * Off-site. Their probes get `remote: "true"`, which the generic
 * BlackboxProbeFailing rules exclude, and their own alerts wait 2h not 10m.
 */
const remoteServers = new Set(["skystar"]);

/** Services this stack must NOT create. Written as the service NAME so a rename
 *  cannot silently un-carve one. See the header for why each is here. */
const carvedOutServices = new Set(["dockge-as", "dockge-celestia", "dns-celestia"]);

/**
 * Egress to a Tailscale VIP SERVICE rather than to one machine.
 *
 * A VIP is one name advertised by several nodes -- whichever is up answers -- so
 * unlike the per-device Services above it is not discovered from the device list
 * and has to be named here. `externalName` is the VIP's own tailnet name.
 *
 * ACL note: no grant names a `svc:` in its `dst`, and none needs to. Tailscale
 * evaluates VIP traffic against the ADVERTISING node, so the existing
 * `garage-s3-backups` grant (src tag:egress -> dst tag:dockge, ports.garageS3)
 * already covers a pod reaching this. Verified against the live policy: 69
 * grants, zero with a `svc:` destination, and the VIP answers today.
 */
const vipServices: { name: string; ports: PortDef[] }[] = [
  {
    // The Garage S3 data plane across celestia/luna/skystar (docker/_common/garage).
    // Pods have no route to tailnet IPs, so CNPG's barman-cloud plugin -- and any
    // other backup consumer -- reaches the store through this.
    //
    // The VIP, deliberately, rather than dockge-celestia:3900: the per-node name
    // pins every backup to one machine, and this is the OFF-SITE copy, so the
    // node most likely to be unreachable is exactly the one it would be pinned
    // to. `svc:garage-s3` is owned by stacks/system's garage.ts and advertised by
    // all three nodes (SHARED_TAILSCALE_SERVICES in components/DockgeLxc.ts).
    //
    // Inert until something points at it -- the Garage cutover is still staged on
    // MinIO. See the flip note in
    // kubernetes/apps/database/postgres/app/resources/values.yaml, which is where
    // the endpoint is chosen.
    //
    // No probe: the S3 root answers a SigV4 error, not a 2xx (confirmed: it
    // returns 403 over the tailnet), and the garage stack's own Gatus TCP checks
    // already cover liveness.
    name: "garage-s3",
    ports: [{ name: "s3", port: grantedPort("garageS3", Tailscale.ports.garageS3, 3900) }],
  },
];

/** tailnet tag -> kind, plus how to recover the bare server name from a hostname. */
const TAG_MAP: Record<string, { kind: ServiceKind; server: (hostname: string) => string }> = {
  "tag:dockge": { kind: "dockge", server: h => (h.startsWith("dockge-") ? h.slice("dockge-".length) : h) },
  "tag:proxmox": { kind: "proxmox", server: h => h },
  "tag:backups": { kind: "pbs", server: h => (h.startsWith("pbs-") ? h.slice("pbs-".length) : h) },
  "tag:dns": { kind: "dns", server: h => (h.startsWith("dns-") ? h.slice("dns-".length) : h) },
};

const serviceName = (server: string, kind: ServiceKind) => `${kind}-${server}`;

/** The tailnet hostname behind the Service. proxmox is the bare node; the other
 *  kinds are prefixed, because one node runs several of these at once. */
const externalName = (server: string, kind: ServiceKind) => (kind === "proxmox" ? server : `${kind}-${server}`);

/**
 * Discover every tagged device and reduce it to `server -> kinds`.
 *
 * Fails CLOSED on an EMPTY result. The device list is the only input that decides
 * which Services exist, and this stack now OWNS them, so a total loss of the list
 * -- no credentials, a dead API, an OAuth client that lost tag visibility --
 * would otherwise plan a delete for every machine in the estate. Any non-empty
 * answer is taken at face value: a device legitimately leaving the tailnet is
 * ordinary decommissioning, and `pulumi preview` is where that gets eyeballed.
 */
export function discoverServerKinds(globals: GlobalResources): pulumi.Output<Map<string, Set<ServiceKind>>> {
  return tailscale.getDevicesOutput({}, { provider: globals.tailscaleProvider }).apply(result => {
    const devices = result.devices ?? [];
    if (devices.length === 0) {
      throw new Error("The Tailscale API returned no devices at all — refusing to plan the tailnet egress Services, which would delete every one of them.");
    }

    const serverKinds = new Map<string, Set<ServiceKind>>();
    for (const device of devices) {
      for (const tag of device.tags ?? []) {
        const mapping = TAG_MAP[tag];
        if (!mapping) continue;
        const server = mapping.server(device.hostname);
        if (decommissionedServers.has(server)) continue;
        if (!serverKinds.has(server)) serverKinds.set(server, new Set());
        serverKinds.get(server)!.add(mapping.kind);
      }
    }

    if (serverKinds.size === 0) {
      throw new Error(
        `The Tailscale API returned ${devices.length} devices, but none carrying a known tag (${Object.keys(TAG_MAP).join(", ")}) — refusing to plan the tailnet egress Services. The OAuth client has most likely lost tag visibility.`,
      );
    }

    return serverKinds;
  });
}

export interface TailnetEgressArgs {
  globals: GlobalResources;
  /** Devices this run saw, already reduced by `discoverServerKinds`. */
  serverKinds: Map<string, Set<ServiceKind>>;
}

/** Create the egress Services, their blackbox Probes and their per-kind alerts. */
export function createTailnetEgressServices(args: TailnetEgressArgs, opts: pulumi.CustomResourceOptions & { parent: pulumi.Resource; provider: k8s.Provider }) {
  const { globals, serverKinds } = args;
  const created: pulumi.Resource[] = [];

  const meta = (name: string) => ({ name, namespace: NAMESPACE });
  const tailnetFqdn = (server: string, kind: ServiceKind) => pulumi.interpolate`${externalName(server, kind)}.${globals.tailscaleDomain}`;
  const probeFqdn = (server: string, kind: ServiceKind, port: PortDef) => (port.probeDomain ? pulumi.interpolate`${server}.${port.probeDomain}.${globals.searchDomain}` : tailnetFqdn(server, kind));

  const probeTarget = (server: string, kind: ServiceKind, port: PortDef): pulumi.Output<string> => {
    switch (port.probe) {
      case "ssh_banner":
        return pulumi.interpolate`${tailnetFqdn(server, kind)}:22`;
      case "http_2xx":
        // 443 is implicit in the scheme; anything else has to be spelled out.
        return port.port === 443 ? pulumi.interpolate`https://${probeFqdn(server, kind, port)}${port.probePath ?? ""}` : pulumi.interpolate`https://${probeFqdn(server, kind, port)}:${port.port}${port.probePath ?? ""}`;
      default:
        // tcp_connect and dns_soa take a bare host:port.
        return pulumi.interpolate`${probeFqdn(server, kind, port)}:${port.port}`;
    }
  };

  const probe = (name: string, module: string, target: pulumi.Input<string>, isRemote: boolean, parent: pulumi.Resource) =>
    new k8s.apiextensions.CustomResource(
      `tailnet-probe-${name}`,
      {
        apiVersion: "monitoring.coreos.com/v1",
        kind: "Probe",
        metadata: meta(name),
        spec: {
          interval: "2m",
          module,
          prober: { url: "blackbox-exporter.observability.svc.cluster.local:9115" },
          targets: {
            staticConfig: {
              static: [target],
              // The generic BlackboxProbeFailing rules select on remote!="true",
              // so an off-site probe does not page on a link flap.
              ...(isRemote ? { labels: { remote: "true" } } : {}),
            },
          },
        },
      },
      { ...opts, parent },
    );

  const alertRule = (name: string, rules: unknown[], parent: pulumi.Resource) =>
    new k8s.apiextensions.CustomResource(
      `tailnet-alerts-${name}`,
      {
        apiVersion: "monitoring.coreos.com/v1",
        kind: "PrometheusRule",
        metadata: meta(`${name}-alerts`),
        spec: { groups: [{ name, rules }] },
      },
      { ...opts, parent },
    );

  const sshAlert = (alert: string, what: string, server: string, probeName: string, forDuration: string) => ({
    alert,
    annotations: {
      description: `SSH connectivity to ${what} on ${server} has been lost.`,
      summary: `${what} ${server} SSH lost`,
    },
    expr: `probe_success{probe="${probeName}"} < 1\n`,
    for: forDuration,
    labels: { severity: "warning" },
  });

  for (const [server, kinds] of [...serverKinds.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const isRemote = remoteServers.has(server);
    // Off-site links flap. 2h means a real outage still pages and a blip does not.
    const forDuration = isRemote ? "2h" : "10m";

    for (const kind of [...kinds].sort()) {
      const name = serviceName(server, kind);
      if (carvedOutServices.has(name)) continue;

      const ports = [...defaultPorts[kind], ...(extraPorts[server]?.[kind] ?? [])];

      const service = new k8s.core.v1.Service(
        `tailnet-egress-${name}`,
        {
          metadata: {
            ...meta(name),
            annotations: {
              "tailscale.com/tailnet-fqdn": tailnetFqdn(server, kind),
              "tailscale.com/proxy-group": "tailnet-inbound",
            },
          },
          spec: {
            type: "ExternalName",
            externalName: externalName(server, kind),
            ports: ports.map(p => ({ name: p.name, port: p.port, targetPort: p.port, ...(p.protocol ? { protocol: p.protocol } : {}) })),
          },
        },
        // `spec.externalName` is OURS to seed and the OPERATOR'S to keep.
        //
        // An ExternalName Service must carry one to pass API validation, so the
        // tailnet name above is what we create it with -- but the moment the
        // tailscale operator adopts the Service it rewrites the field to point at
        // the proxy Service it generates for it
        // (`ts-<name>-<hash>.tailscale-system.svc.cluster.local`). That is not
        // drift, it is the whole mechanism: that rewrite is what makes the egress
        // work.
        //
        // Under server-side apply both managers then claim the field, and every
        // later run died on it -- not at create, but in the await-live step, so the
        // Services really did exist while the stack still reported failure:
        //
        //   "tailscale-system/dockge-skystar" failed to fully initialize or become
        //   live: server-side apply field conflict detected
        //   Apply failed with 1 conflict: conflict with "operator" using v1:
        //     .spec.externalName
        //
        // `ignoreChanges` is what Pulumi's own SSA guide prescribes for a field
        // another controller legitimately owns. `pulumi.com/patchForce` is the
        // other lever and is the WRONG one here -- the same guide warns it "is
        // likely to cause further conflicts if the operator expects to manage these
        // fields", which it does: forcing our value back would just be undone on
        // the next operator sync, every run, forever.
        { ...opts, ignoreChanges: ["spec.externalName"] },
      );
      created.push(service);

      for (const port of ports.filter(p => p.probe)) {
        // The kind's PRIMARY port probes under the bare service name; the rest are
        // suffixed. The per-kind alerts below reference the bare name, so this
        // naming is load-bearing, not cosmetic.
        const isPrimary = port.name === "pve" || port.name === "pbs" || port.name === "dns-tcp";
        created.push(probe(isPrimary ? name : `${name}-${port.name}`, port.probe!, probeTarget(server, kind, port), isRemote, service));
      }

      switch (kind) {
        case "dockge":
          created.push(alertRule(name, [sshAlert("DockgeSSHConnectivityLost", "Dockge", server, `${name}-ssh`, forDuration)], service));
          break;
        case "proxmox":
          created.push(
            alertRule(
              name,
              [
                {
                  alert: "ProxmoxServiceUnhealthy",
                  annotations: { description: `Proxmox VE on ${server} is unhealthy.`, summary: `Proxmox ${server} is unhealthy` },
                  expr: `probe_success{probe="${name}"} < 1\n`,
                  for: forDuration,
                  labels: { severity: "warning" },
                },
                ...(ports.some(p => p.name === "ssh") ? [sshAlert("ProxmoxSSHConnectivityLost", "Proxmox", server, `${name}-ssh`, forDuration)] : []),
              ],
              service,
            ),
          );
          break;
        case "pbs":
          created.push(alertRule(name, [sshAlert("PBSSSHConnectivityLost", "PBS", server, `${name}-ssh`, forDuration)], service));
          break;
        case "dns":
          created.push(
            alertRule(
              name,
              [
                {
                  alert: "TechnitiumDnsUnhealthy",
                  annotations: { description: `Technitium DNS on ${server} is not answering SOA queries.`, summary: `Technitium DNS ${server} unhealthy` },
                  expr: `probe_success{probe="${name}"} < 1\n`,
                  for: forDuration,
                  labels: { severity: "critical" },
                },
              ],
              service,
            ),
          );
          break;
      }
    }
  }

  // VIP-backed egress, named rather than discovered. Same Service shape as the
  // per-device ones; the difference is only that `externalName` is a tailnet
  // service rather than a machine.
  for (const vip of vipServices) {
    created.push(
      new k8s.core.v1.Service(
        `tailnet-egress-${vip.name}`,
        {
          metadata: {
            ...meta(vip.name),
            annotations: {
              "tailscale.com/tailnet-fqdn": pulumi.interpolate`${vip.name}.${globals.tailscaleDomain}`,
              "tailscale.com/proxy-group": "tailnet-inbound",
            },
          },
          spec: {
            type: "ExternalName",
            externalName: vip.name,
            ports: vip.ports.map(p => ({ name: p.name, port: p.port, targetPort: p.port, ...(p.protocol ? { protocol: p.protocol } : {}) })),
          },
        },
        // Same operator rewrite as the per-device Services above -- a VIP-backed
        // egress is the same object shape, so it hits the same SSA conflict.
        { ...opts, ignoreChanges: ["spec.externalName"] },
      ),
    );
  }

  return created;
}

export { carvedOutServices, decommissionedServers, defaultPorts, externalName, extraPorts, grantedPort, NAMESPACE, remoteServers, serviceName, TAG_MAP, vipServices };

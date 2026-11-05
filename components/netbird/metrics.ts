/**
 * NetBird metrics on the netbird-edge hosts (docs.netbird.io/selfhosted/observability).
 *
 * The combined server (management + signal) and the standalone relay each
 * serve Prometheus metrics on :9090 inside the compose network. Nothing in
 * Equestria can scrape them: the hosts are internet-facing and the tailnet
 * grants nothing inbound to them but SSH. So an `alloy` service in the same
 * compose project (compose.yaml, profile `metrics`) scrapes both over the
 * Docker network and remote-writes to Thanos over the tailnet, as the Proxmox
 * hosts' Alloy and the Dockge hosts' Prometheus do. The only grant this needs
 * is tag:netbird-edge -> svc:thanos-receive on 19291 (`netbird-edge-metrics`,
 * stacks/unifi-network/acl-manager.ts).
 *
 * The labels are the ones upstream's Grafana dashboards filter on (cluster,
 * environment, job, host; kubernetes/apps/observability/grafana/dashboards/netbird.yaml).
 * Two rewrites make the combined server's series match the dashboards, which
 * were drawn against the multi-container install:
 *   - signal's series carry a `signal_` prefix in the combined server
 *     (combined/cmd/root.go, v0.82.0: `signalServer.NewServer(..., "signal_")`)
 *     and none standalone, which is what signal.json queries. Management's own
 *     series are all `management_*`, so stripping the prefix touches signal only.
 *   - management's HTTP series label the route `endpoint`; management.json
 *     reads `exported_endpoint`, the name a Prometheus scrape gives it when the
 *     target already has an `endpoint` label.
 *
 * On a standby the fence keeps netbird-server stopped, so its target is down
 * (`up == 0`) and only the relay reports. That is the expected state there.
 *
 * Pure, with no Pulumi imports, so `node --test` covers it.
 */

/** The port both images serve /metrics on: the combined server's `server.metricsPort` (server.ts) and the relay's `--metrics-port` default. */
export const NETBIRD_METRICS_PORT = 9090;

/** The `cluster` label every series from these hosts carries. */
export const NETBIRD_METRICS_CLUSTER = "netbird-edge";

export interface AlloyConfigArgs {
  /** The tailnet name and the `host` label, e.g. `netbird-azure-eus2`. */
  host: string;
  /** `http://thanos-receive.<tailnet>:19291/api/v1/receive`. */
  remoteWriteUrl: string;
  /** The cloud region, for the `region` label. */
  region?: string;
  /** This host runs the standalone relay (compose profile `relay`). */
  relay: boolean;
}

/** An Alloy string literal. JSON's escaping is valid River syntax. */
const q = (value: string) => JSON.stringify(value);

/** `alloy.alloy` beside compose.yaml. No secrets: remote-write is unauthenticated on the tailnet. */
export function renderAlloyConfig(args: AlloyConfigArgs): string {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(args.host)) throw new Error(`Metrics host '${args.host}' is not a bare hostname`);
  if (!/^https?:\/\//.test(args.remoteWriteUrl)) throw new Error(`Remote-write URL '${args.remoteWriteUrl}' is not http(s)`);
  const target = (address: string, job: string) => `    {"__address__" = ${q(`${address}:${NETBIRD_METRICS_PORT}`)}, "job" = ${q(job)}, "host" = ${q(args.host)}},`;
  const targets = [target("netbird-server", "netbird-server"), ...(args.relay ? [target("netbird-relay", "netbird-relay")] : [])];
  return `// Rendered by stacks/netbird-edge (Pulumi), components/netbird/metrics.ts. Edits on the VM are overwritten.

prometheus.scrape "netbird" {
  targets = [
${targets.join("\n")}
  ]
  scrape_interval = "60s"
  forward_to      = [prometheus.relabel.netbird.receiver]
}

prometheus.relabel "netbird" {
  forward_to = [prometheus.remote_write.thanos.receiver]

  // signal_active_peers -> active_peers: the combined server prefixes signal's series.
  rule {
    source_labels = ["__name__"]
    regex         = "signal_(.+)"
    target_label  = "__name__"
    replacement   = "$1"
  }

  // management.json reads the HTTP route as exported_endpoint.
  rule {
    source_labels = ["endpoint"]
    regex         = "(.+)"
    target_label  = "exported_endpoint"
  }
  rule {
    action = "labeldrop"
    regex  = "endpoint"
  }

  // The scrape address is a container name; the host label already says where.
  rule {
    source_labels = ["host"]
    target_label  = "instance"
  }
}

prometheus.remote_write "thanos" {
  endpoint {
    url = ${q(args.remoteWriteUrl)}
    queue_config {
      max_samples_per_send = 10000
    }
  }
  external_labels = {
    cluster      = ${q(NETBIRD_METRICS_CLUSTER)},
    environment  = "homelab",
    region       = ${q(args.region ?? "unknown")},
    machine_type = "netbird-edge",
    hostname     = ${q(args.host)},
  }
}
`;
}

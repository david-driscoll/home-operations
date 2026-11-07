// biome-ignore-all lint/style/useTemplate: no template literals in this file. It ships as a ConfigMap, and Flux envsubst and the hk eso lint both read a dollar-brace as a variable.
/**
 * Whether a region exit's two overlays are connected, as the region picker
 * reports them on /status and /metrics (docs/plans/region-exits.md §D4, §D5).
 * Both reads are read-only by construction:
 *
 * Tailscale: tailscaled's LocalAPI, GET /localapi/v0/status, on its unix
 * socket, which the tailscale container shares through an emptyDir
 * (TS_SOCKET). tailscaled makes the socket 0666 and decides access from the
 * peer's uid (safesocket, ipnauth.IsReadonlyConn, v1.104): the picker runs as
 * uid 1000, neither root nor the daemon's uid, so it is read-only and cannot
 * change anything through it. Connected means BackendState "Running" and
 * Self.Online, i.e. logged in and in a live map poll with the control plane.
 *
 * NetBird: the daemon's socket is gRPC with no authorisation (whoever can
 * connect may `down` it or rewrite its config), so it is not shared. The
 * picker reads wt0's flags from sysfs in the pod's network namespace
 * instead: NetBird's engine creates wt0 when it connects and deletes it when
 * it stops, including when management has been unreachable long enough for
 * the client to give up and restart (client/internal/engine.go, v0.82.0).
 * Connected means wt0 exists and is IFF_UP. It does not see a stalled signal
 * connection; the management outage it does see is what takes peers away.
 * Why nothing stronger is read: docs/plans/region-exits.md §F.
 */

export interface OverlayState {
  tailscale: boolean;
  netbird: boolean;
}

export interface OverlayDeps {
  readFile: (path: string) => Promise<string>;
  /** A GET over a unix socket: its status and body. Throws when nothing listens. */
  unixGet: (socketPath: string, path: string, headers: Record<string, string>) => Promise<{ status: number; body: string }>;
}

export interface OverlayConfig {
  tailscaleSocket: string;
  netbirdFlagsPath: string;
}

/** The Host the LocalAPI insists on (apitype.LocalAPIHost); it refuses others. */
const LOCAL_API_HOST = "local-tailscaled.sock";
const IFF_UP = 0x1;

async function tailscaleConnected(config: OverlayConfig, deps: OverlayDeps): Promise<boolean> {
  try {
    const response = await deps.unixGet(config.tailscaleSocket, "/localapi/v0/status", { Host: LOCAL_API_HOST });
    if (response.status !== 200) return false;
    const status = JSON.parse(response.body) as { BackendState?: string; Self?: { Online?: boolean } };
    return status.BackendState === "Running" && status.Self?.Online === true;
  } catch {
    return false;
  }
}

async function netbirdConnected(config: OverlayConfig, deps: OverlayDeps): Promise<boolean> {
  try {
    const flags = Number.parseInt((await deps.readFile(config.netbirdFlagsPath)).trim(), 16);
    return Number.isFinite(flags) && (flags & IFF_UP) !== 0;
  } catch {
    return false;
  }
}

export type Overlay = keyof OverlayState;

/**
 * Whether family can use a region exit, the one verdict /status, the pages
 * and the overview share (docs/plans/region-exits.md §D4):
 *
 *   online       the tunnel is up and both overlays are connected
 *   degraded     the tunnel is up and one overlay is not (offlineOn); people
 *                on the other still get out, as for ~10 minutes on NetBird
 *                after a restart (§F)
 *   offline      the tunnel is down, so the kill switch lets nothing out
 *                (reason "tunnel"), or neither overlay is connected
 *                (reason "overlays")
 *   unreachable  its /status did not answer; only the overview sees this
 */
export type Availability = { state: "online" } | { state: "degraded"; offlineOn: Overlay } | { state: "offline"; reason: "tunnel" | "overlays" } | { state: "unreachable" };

export function availabilityOf(tunnelUp: boolean, overlays: OverlayState): Availability {
  if (!tunnelUp) return { state: "offline", reason: "tunnel" };
  if (overlays.tailscale && overlays.netbird) return { state: "online" };
  if (overlays.tailscale) return { state: "degraded", offlineOn: "netbird" };
  if (overlays.netbird) return { state: "degraded", offlineOn: "tailscale" };
  return { state: "offline", reason: "overlays" };
}

export async function overlayState(config: OverlayConfig, deps: OverlayDeps): Promise<OverlayState> {
  const [tailscale, netbird] = await Promise.all([tailscaleConnected(config, deps), netbirdConnected(config, deps)]);
  return { tailscale, netbird };
}

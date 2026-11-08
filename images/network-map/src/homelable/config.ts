/**
 * The Homelable sync's settings, from the CronJob's env
 * (kubernetes/apps/database/network-map/cronjob.yaml). Pure, as ../config.ts.
 *
 *   HOMELABLE_SYNC         `true` to run the sync after the collector
 *   HOMELABLE_URL          the backend's own Service, http://homelable-backend.equestria.svc.cluster.local:8000
 *   HOMELABLE_SERVICE_KEY  Homelable's MCP_SERVICE_KEY (its own ExternalSecret, network-map-homelable)
 */
type Env = Record<string, string | undefined>;

export type HomelableConfig = { enabled: false } | { enabled: true; url: string; serviceKey: string } | { enabled: true; problem: string };

export function loadHomelableConfig(env: Env): HomelableConfig {
  if ((env.HOMELABLE_SYNC ?? "").toLowerCase() !== "true") return { enabled: false };
  const missing = ["HOMELABLE_URL", "HOMELABLE_SERVICE_KEY"].filter(name => !env[name]);
  if (missing.length > 0) return { enabled: true, problem: `not configured: ${missing.join(", ")} not set` };
  return { enabled: true, url: env.HOMELABLE_URL as string, serviceKey: env.HOMELABLE_SERVICE_KEY as string };
}

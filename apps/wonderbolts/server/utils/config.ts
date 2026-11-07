/**
 * The region picker's runtime config, read per request so the HelmRelease's
 * NUXT_* env (nuxt.config.ts runtimeConfig) applies without a rebuild.
 */
import type { H3Event } from "h3";
import { type AgentConfig, namesFrom } from "./agent";
import { DEFAULT_MOVER_GROUPS } from "./viewer";

export function agentConfig(event: H3Event): AgentConfig {
  const config = useRuntimeConfig(event);
  return { regionExits: namesFrom(String(config.regionExits)), agentUrlTemplate: String(config.agentUrlTemplate) };
}

export function moverGroups(event: H3Event): string[] {
  const groups = namesFrom(String(useRuntimeConfig(event).moverGroups ?? ""));
  return groups.length > 0 ? groups : [...DEFAULT_MOVER_GROUPS];
}

/** The viewer of this request (viewer.ts). */
export function requestViewer(event: H3Event) {
  return viewerFrom(name => getRequestHeader(event, name), moverGroups(event));
}

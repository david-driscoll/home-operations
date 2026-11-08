/**
 * The Homelable sync (docs/adr/0006-network-map-neo4j-homelable-projection.md):
 * the network map in Neo4j -> four Homelable designs, each replaced in full.
 *
 * One run:
 *   1. project all four designs from one read of the graph (pure, ./project-*.ts);
 *   2. find each design by name, or create it. The UniFi design adopts the
 *      empty "Network Topology" design Homelable starts with, by renaming it;
 *   3. per design: read its current canvas, for the inventory row each node
 *      already points at and the viewport someone last left it at, then save
 *      the projection over it.
 *
 * Each design is its own outcome: one failing never stops another. A design
 * whose canvas cannot be read is not saved (a save without the device ids
 * would mint duplicate inventory rows). The caller's exit policy is
 * ../exit.ts: fail only when every design failed.
 *
 * Designs the sync does not own are never touched.
 */
import { type Canvas, type DesignName, savePayload } from "./canvas.ts";
import type { Design, HomelableClient } from "./client.ts";
import type { MapGraph } from "./graph.ts";
import { projectApps } from "./project-apps.ts";
import { projectNetbird, projectTailscale } from "./project-overlay.ts";
import { projectUnifi } from "./project-unifi.ts";

export interface DesignPlan {
  name: DesignName;
  /** A design to take over (rename) when `name` does not exist yet, if it is empty. */
  adopt?: string;
  project: (g: MapGraph) => Canvas;
}

export const DESIGNS: DesignPlan[] = [
  { name: "UniFi", adopt: "Network Topology", project: projectUnifi },
  { name: "Tailscale", project: projectTailscale },
  { name: "NetBird", project: projectNetbird },
  { name: "Apps", project: projectApps },
];

export interface DesignOutcome {
  design: DesignName;
  status: "ok" | "failed";
  error?: string;
  designId?: string;
  nodes?: number;
  edges?: number;
  drift?: number;
  created?: boolean;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isEmpty = (d: Design) => !d.node_count && !d.group_count && !d.text_count;

/** The design to save into, creating or adopting one when it is missing. */
async function ensureDesign(client: HomelableClient, existing: Design[], plan: DesignPlan): Promise<{ design: Design; created: boolean }> {
  // Oldest first (the API lists by created_at), so a duplicate name resolves the same way every run.
  const found = existing.find(d => d.name === plan.name);
  if (found) return { design: found, created: false };
  const adoptable = plan.adopt ? existing.find(d => d.name === plan.adopt && isEmpty(d)) : undefined;
  if (adoptable) {
    const renamed = await client.renameDesign(adoptable.id, plan.name);
    adoptable.name = plan.name;
    return { design: { ...adoptable, ...renamed }, created: true };
  }
  const created = await client.createDesign(plan.name);
  existing.push(created);
  return { design: created, created: true };
}

export async function syncHomelable(graph: MapGraph, client: HomelableClient, plans: DesignPlan[] = DESIGNS): Promise<DesignOutcome[]> {
  if (graph.find("Machine").length === 0) {
    // An empty observed layer (Neo4j just rebuilt) would wipe every design; leave them until the collector has run.
    return plans.map(p => ({ design: p.name, status: "failed", error: "the observed layer is empty; designs left as they were" }));
  }
  let existing: Design[];
  try {
    existing = await client.listDesigns();
  } catch (error) {
    return plans.map(p => ({ design: p.name, status: "failed", error: `listing designs: ${message(error)}` }));
  }

  const outcomes: DesignOutcome[] = [];
  for (const plan of plans) {
    try {
      const canvas = plan.project(graph);
      const { design, created } = await ensureDesign(client, existing, plan);
      const current = await client.loadCanvas(design.id);
      const deviceIds = new Map(current.nodes.filter(n => n.device_id).map(n => [n.id, n.device_id as string]));
      const body = savePayload(canvas, design.id, { deviceIds, viewport: current.viewport, customStyle: current.custom_style ?? null });
      await client.saveCanvas(body);
      outcomes.push({ design: plan.name, status: "ok", designId: design.id, created, nodes: body.nodes.length, edges: body.edges.length, drift: canvas.nodes.filter(n => n.drift).length });
    } catch (error) {
      outcomes.push({ design: plan.name, status: "failed", error: message(error) });
    }
  }
  return outcomes;
}

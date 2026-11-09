/**
 * The Homelable sync (docs/adr/0006-network-map-neo4j-homelable-projection.md):
 * the network map in Neo4j -> four Homelable designs, each replaced in full.
 *
 * One run:
 *   1. project all four designs from one read of the graph (pure, ./project-*.ts);
 *   2. find each design by name on a fresh list, or create it. The UniFi
 *      design adopts the empty "Network Topology" design Homelable starts
 *      with, by renaming it. Several designs with one name (two runs at once)
 *      resolve to one by `pickDesign`, and the EMPTY others are deleted
 *      (`ensureDesign` has the rules);
 *   3. per design: read its current canvas, for the inventory row each node
 *      already points at and the viewport someone last left it at, then save
 *      the projection over it;
 *   4. once every design has saved, delete the inventory rows the sync owns
 *      that no design draws any more (`cleanInventory`, called by
 *      ../homelable-sync.ts; its guards are on it below).
 *
 * Each design is its own outcome: one failing never stops another. A design
 * whose canvas cannot be read is not saved (a save without the device ids
 * would mint duplicate inventory rows). The caller's exit policy is
 * ../exit.ts: fail only when every design failed.
 *
 * Designs the sync does not own are never touched.
 */

import { HttpError } from "../http.ts";
import { type Canvas, type DesignName, isOwnedRow, savePayload } from "./canvas.ts";
import type { Design, HomelableClient, InventoryRow } from "./client.ts";
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
  /** Empty designs with this name the run deleted (left by a concurrent run). */
  duplicatesRemoved?: string[];
  /** Designs with this name it left alone: something is drawn on them. Worth a look by hand. */
  duplicatesKept?: string[];
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const contents = (d: Design) => (d.node_count ?? 0) + (d.group_count ?? 0) + (d.text_count ?? 0);
const isEmpty = (d: Design) => contents(d) === 0;

/**
 * Which of several designs sharing a name the sync uses: the one with the
 * most on it, then the oldest, then the lowest id. Every concurrent run
 * picks the same one from the same list, so two syncs that both created a
 * design converge on one of them.
 */
export function pickDesign(candidates: Design[]): Design {
  return [...candidates].sort((a, b) => contents(b) - contents(a) || (a.created_at ?? "").localeCompare(b.created_at ?? "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

export interface EnsuredDesign {
  design: Design;
  created: boolean;
  /** Empty duplicates of the name this run deleted. */
  removed: string[];
  /** Duplicates left alone because something is drawn on them, or whose delete failed. */
  kept: string[];
}

/**
 * The design to save into, from a FRESH list (not the run's first one: a
 * concurrent sync, or a manual Job started in the same second, may have
 * created it since). Missing, it is adopted or created, and the list read
 * again afterwards, so two runs that both created one resolve to the same
 * design by `pickDesign`.
 *
 * The other designs with the name are deleted only when they are empty, of
 * type network, and still empty on a fresh read of their canvas just before
 * the delete; a duplicate with anything on it is never deleted, only
 * reported in `kept`. A failed delete is reported the same way and never
 * fails the design.
 *
 * Why no lease: with this, concurrent runs converge on one design and each
 * writes the same full replace into it, and the duplicate inventory rows two
 * first saves can mint are owned, undrawn rows the next clean-up removes. A
 * lease would add a second store and an expiry to tune for no change in the
 * end state.
 */
async function ensureDesign(client: HomelableClient, plan: DesignPlan): Promise<EnsuredDesign> {
  let designs = await client.listDesigns();
  let created = false;
  if (!designs.some(d => d.name === plan.name)) {
    const adoptable = plan.adopt ? designs.find(d => d.name === plan.adopt && isEmpty(d)) : undefined;
    if (adoptable) await client.renameDesign(adoptable.id, plan.name);
    else await client.createDesign(plan.name);
    created = true;
    designs = await client.listDesigns();
  }
  const matches = designs.filter(d => d.name === plan.name);
  if (matches.length === 0) throw new Error(`design ${plan.name} is missing right after it was created`);
  const design = pickDesign(matches);
  const removed: string[] = [];
  const kept: string[] = [];
  for (const other of matches.filter(d => d.id !== design.id)) {
    if (!isEmpty(other) || other.design_type !== "network") {
      kept.push(other.id);
      continue;
    }
    try {
      const canvas = await client.loadCanvas(other.id);
      if (canvas.nodes.length > 0 || canvas.edges.length > 0) {
        kept.push(other.id);
        continue;
      }
      await client.deleteDesign(other.id);
      removed.push(other.id);
    } catch (error) {
      // 404: a concurrent run deleted it first, which is the outcome wanted.
      if (!(error instanceof HttpError && error.status === 404)) kept.push(other.id);
    }
  }
  return { design, created, removed, kept };
}

export async function syncHomelable(graph: MapGraph, client: HomelableClient, plans: DesignPlan[] = DESIGNS): Promise<DesignOutcome[]> {
  if (graph.find("Machine").length === 0) {
    // An empty observed layer (Neo4j just rebuilt) would wipe every design; leave them until the collector has run.
    return plans.map(p => ({ design: p.name, status: "failed", error: "the observed layer is empty; designs left as they were" }));
  }
  try {
    await client.listDesigns();
  } catch (error) {
    return plans.map(p => ({ design: p.name, status: "failed", error: `listing designs: ${message(error)}` }));
  }

  const outcomes: DesignOutcome[] = [];
  for (const plan of plans) {
    try {
      const canvas = plan.project(graph);
      const { design, created, removed, kept } = await ensureDesign(client, plan);
      const current = await client.loadCanvas(design.id);
      const deviceIds = new Map(current.nodes.filter(n => n.device_id).map(n => [n.id, n.device_id as string]));
      const body = savePayload(canvas, design.id, { deviceIds, viewport: current.viewport, customStyle: current.custom_style ?? null });
      await client.saveCanvas(body);
      outcomes.push({
        design: plan.name,
        status: "ok",
        designId: design.id,
        created,
        nodes: body.nodes.length,
        edges: body.edges.length,
        drift: canvas.nodes.filter(n => n.drift).length,
        duplicatesRemoved: removed.length > 0 ? removed : undefined,
        duplicatesKept: kept.length > 0 ? kept : undefined,
      });
    } catch (error) {
      outcomes.push({ design: plan.name, status: "failed", error: message(error) });
    }
  }
  return outcomes;
}

// ── Inventory clean-up ───────────────────────────────────────────────────

/** Never delete more than this share of the sync's own rows in one run. */
export const MAX_CLEANUP_SHARE = 0.25;
/** ...except that this many may always go, so a small inventory still sheds a departed machine. */
export const MIN_CLEANUP_ALLOWANCE = 3;

export interface CleanupOutcome {
  status: "ok" | "skipped" | "refused" | "failed";
  reason?: string;
  owned?: number;
  unreferenced?: number;
  deleted?: string[];
  errors?: string[];
}

/**
 * Deletes the inventory rows the sync owns that no design draws any more.
 *
 * Homelable never deletes a row when a canvas save drops its node, so every
 * machine that leaves the map would otherwise leave its row behind for good.
 * A row is a candidate only when it carries the sync's marker (./canvas.ts
 * OWNER_PROPERTY, exact key and value) AND the backend reports
 * `canvas_count: 0`. A row without the marker, or with no count, is never
 * touched: a scanner's or a person's rows are not the sync's to remove.
 *
 * Guards, so a bad run cannot empty the inventory:
 *   - nothing happens unless EVERY design loaded and saved this run: a
 *     design that failed may still draw rows that would look orphaned;
 *   - a run that would delete more than MAX_CLEANUP_SHARE of the owned rows
 *     (beyond MIN_CLEANUP_ALLOWANCE) deletes none, and says so.
 *
 * Hidden rows are not listed by the API, so a row someone hid stays. One
 * failed delete (409 while a rack mounts the row) is recorded and the rest
 * carry on. The outcome is logged; it never changes the exit code.
 */
export async function cleanInventory(client: HomelableClient, designs: DesignOutcome[]): Promise<CleanupOutcome> {
  const failed = designs.filter(d => d.status !== "ok").map(d => d.design);
  if (designs.length === 0 || failed.length > 0) return { status: "skipped", reason: `not every design saved this run (${failed.join(", ") || "none ran"})` };
  let rows: InventoryRow[];
  try {
    rows = await client.listInventory();
  } catch (error) {
    return { status: "failed", reason: `listing the inventory: ${message(error)}` };
  }
  const owned = rows.filter(r => isOwnedRow(r.properties));
  const unreferenced = owned.filter(r => r.canvas_count === 0).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const allowance = Math.max(MIN_CLEANUP_ALLOWANCE, Math.floor(owned.length * MAX_CLEANUP_SHARE));
  if (unreferenced.length > allowance) {
    return {
      status: "refused",
      reason: `${unreferenced.length} of ${owned.length} owned rows look unreferenced, more than the ${allowance} one run may delete`,
      owned: owned.length,
      unreferenced: unreferenced.length,
      deleted: [],
    };
  }
  const deleted: string[] = [];
  const errors: string[] = [];
  for (const row of unreferenced) {
    try {
      await client.deleteInventory(row.id);
      deleted.push(row.id);
    } catch (error) {
      errors.push(`${row.id}: ${message(error)}`);
    }
  }
  return { status: "ok", owned: owned.length, unreferenced: unreferenced.length, deleted, errors: errors.length > 0 ? errors : undefined };
}

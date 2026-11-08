/**
 * Deterministic layouts for the Homelable designs. Homelable stores whatever
 * `pos_x`/`pos_y` a save sends (default 0, no auto-layout), so the sync
 * places every node itself. Two shapes cover the four designs:
 *
 *   - a TREE, top-down, for the UniFi infrastructure (gateway -> switches ->
 *     APs): each leaf takes the next column, each parent sits centred over
 *     its children;
 *   - ZONES: a grid of nodes inside a group rectangle (positions relative to
 *     it, as Homelable nests `parent_id` children), and the zones packed
 *     left to right onto shelves that wrap at a maximum width.
 *
 * Same input, same output: callers hand everything over already sorted.
 */

/** Room for one device node and its label. */
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 64;
export const GAP_X = 40;
export const GAP_Y = 40;
/** A zone's inner margin, and the extra room at its top for its title. */
export const ZONE_PADDING = 30;
export const ZONE_HEADER = 40;
/** Space between zones, and between a design's sections. */
export const ZONE_GAP = 60;
/** Where a shelf of zones wraps. */
export const MAX_ROW_WIDTH = 2400;
/** Vertical distance between tree levels. */
export const TREE_LEVEL = NODE_HEIGHT + 100;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Columns for `count` nodes in one zone: roughly twice as wide as tall, at most 8. */
export function zoneColumns(count: number): number {
  if (count <= 1) return 1;
  return Math.min(8, Math.ceil(Math.sqrt(count * 2)));
}

/** Child positions inside a zone, row by row, relative to the zone's corner. */
export function gridPositions(count: number, columns = zoneColumns(count)): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: ZONE_PADDING + (i % columns) * (NODE_WIDTH + GAP_X),
    y: ZONE_HEADER + ZONE_PADDING + Math.floor(i / columns) * (NODE_HEIGHT + GAP_Y),
  }));
}

/** The zone that holds `count` nodes. An empty zone keeps one cell, so its title has room. */
export function zoneSize(count: number, columns = zoneColumns(count)): Size {
  const cols = Math.max(1, Math.min(columns, Math.max(count, 1)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return {
    width: 2 * ZONE_PADDING + cols * NODE_WIDTH + (cols - 1) * GAP_X,
    height: ZONE_HEADER + 2 * ZONE_PADDING + rows * NODE_HEIGHT + (rows - 1) * GAP_Y,
  };
}

/**
 * Shelf packing: each box goes right of the last until the shelf would pass
 * `maxWidth`, then a new shelf starts below the tallest box so far. Returns
 * each box's corner and the total height used.
 */
export function packShelves(sizes: Size[], origin: Point, maxWidth = MAX_ROW_WIDTH): { positions: Point[]; height: number } {
  const positions: Point[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const size of sizes) {
    if (x > 0 && x + size.width > maxWidth) {
      x = 0;
      y += shelf + ZONE_GAP;
      shelf = 0;
    }
    positions.push({ x: origin.x + x, y: origin.y + y });
    x += size.width + ZONE_GAP;
    shelf = Math.max(shelf, size.height);
  }
  return { positions, height: sizes.length === 0 ? 0 : y + shelf };
}

/**
 * A top-down tree. `children` must already be in display order; a node
 * reachable twice is placed under its first parent only, and a cycle is cut.
 */
export function treeLayout(roots: string[], children: (id: string) => string[], origin: Point = { x: 0, y: 0 }): { positions: Map<string, Point>; size: Size } {
  const positions = new Map<string, Point>();
  const seen = new Set<string>();
  let column = 0;
  let depthMax = 0;
  const place = (id: string, depth: number): number => {
    seen.add(id);
    depthMax = Math.max(depthMax, depth);
    const kids = children(id).filter(k => !seen.has(k));
    for (const k of kids) seen.add(k);
    let x: number;
    if (kids.length === 0) {
      x = column * (NODE_WIDTH + GAP_X);
      column += 1;
    } else {
      const xs = kids.map(k => place(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    positions.set(id, { x: origin.x + x, y: origin.y + depth * TREE_LEVEL });
    return x;
  };
  for (const root of roots) if (!seen.has(root)) place(root, 0);
  return {
    positions,
    size: positions.size === 0 ? { width: 0, height: 0 } : { width: column * (NODE_WIDTH + GAP_X) - GAP_X, height: depthMax * TREE_LEVEL + NODE_HEIGHT },
  };
}

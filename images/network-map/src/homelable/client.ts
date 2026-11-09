/**
 * The Homelable backend calls the sync makes, behind one small interface so
 * ./sync.ts is tested against `memoryHomelable` with no network.
 *
 *   GET    /api/v1/designs                  every design (id, name, node counts)
 *   POST   /api/v1/designs                  create one        {name, design_type}
 *   PUT    /api/v1/designs/<id>             rename one        {name}
 *   GET    /api/v1/canvas?design_id=<id>    one design's canvas (for the device_ids and viewport)
 *   POST   /api/v1/canvas/save              replace one design's canvas in full
 *   GET    /api/v1/scan/pending             the inventory: every row not hidden, with its
 *                                           properties and `canvas_count` (designs drawing it)
 *   DELETE /api/v1/scan/pending/<id>        delete one row (409 while a rack mounts it)
 *
 * The two inventory calls are backend/app/api/routes/scan.py in 3.6.0
 * (`list_pending`, `delete_pending`); ./sync.ts uses them for the clean-up.
 *
 * Authenticated by `X-MCP-Service-Key`, which bypasses OIDC (and its CSRF
 * check) on every endpoint (backend/app/api/deps.py). The sync calls the
 * backend's own Service, which a CiliumNetworkPolicy opens to this job only;
 * the frontend strips the header (kubernetes/apps/equestria/home/homelable).
 * The key never appears in an error or a log line.
 */
import { HttpError, joinUrl } from "../http.ts";
import type { CanvasSaveRequest, NodeProperty } from "./canvas.ts";

export interface Design {
  id: string;
  name: string;
  design_type: string;
  node_count?: number | null;
  group_count?: number | null;
  text_count?: number | null;
}

export interface CanvasState {
  nodes: { id: string; type: string; device_id?: string | null }[];
  edges: { id: string }[];
  viewport: Record<string, unknown>;
  custom_style?: Record<string, unknown> | null;
}

/** The fields of an `InventoryDeviceResponse` the clean-up reads. */
export interface InventoryRow {
  id: string;
  label?: string | null;
  ip?: string | null;
  properties?: NodeProperty[] | null;
  /** How many designs draw this row; computed by the backend from the nodes' device_id. */
  canvas_count?: number | null;
}

export interface HomelableClient {
  listDesigns(): Promise<Design[]>;
  createDesign(name: string): Promise<Design>;
  renameDesign(id: string, name: string): Promise<Design>;
  loadCanvas(designId: string): Promise<CanvasState>;
  saveCanvas(body: CanvasSaveRequest): Promise<void>;
  listInventory(): Promise<InventoryRow[]>;
  deleteInventory(id: string): Promise<void>;
}

export interface HomelableClientOptions {
  baseUrl: string;
  serviceKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function httpHomelableClient(options: HomelableClientOptions): HomelableClient {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const call = async <T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> => {
    const response = await doFetch(joinUrl(options.baseUrl, path), {
      method,
      headers: { Accept: "application/json", "X-MCP-Service-Key": options.serviceKey, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw new HttpError(`${method} ${path}: HTTP ${response.status}${text ? ` ${text.slice(0, 300)}` : ""}`, response.status);
    return (text ? JSON.parse(text) : undefined) as T;
  };
  return {
    listDesigns: () => call<Design[]>("GET", "/api/v1/designs"),
    createDesign: name => call<Design>("POST", "/api/v1/designs", { name, design_type: "network" }),
    renameDesign: (id, name) => call<Design>("PUT", `/api/v1/designs/${encodeURIComponent(id)}`, { name }),
    loadCanvas: designId => call<CanvasState>("GET", `/api/v1/canvas?design_id=${encodeURIComponent(designId)}`),
    saveCanvas: async body => {
      await call<unknown>("POST", "/api/v1/canvas/save", body);
    },
    listInventory: () => call<InventoryRow[]>("GET", "/api/v1/scan/pending"),
    deleteInventory: async id => {
      await call<unknown>("DELETE", `/api/v1/scan/pending/${encodeURIComponent(id)}`);
    },
  };
}

/**
 * An in-memory Homelable for tests: designs, canvases and inventory rows in
 * maps, saves applied as the backend applies them (full replace per design;
 * a node sent without a device_id gets a fresh row carrying its properties),
 * `canvas_count` computed from the canvases, every call recorded. `fail`
 * makes the named method throw.
 */
export function memoryHomelable(seed: { designs?: Design[]; canvases?: Record<string, CanvasState>; inventory?: InventoryRow[] } = {}) {
  const designs: Design[] = [...(seed.designs ?? [])];
  const canvases = new Map<string, CanvasState>(Object.entries(seed.canvases ?? {}));
  const inventory = new Map<string, InventoryRow>((seed.inventory ?? []).map(r => [r.id, structuredClone(r)]));
  const saves: CanvasSaveRequest[] = [];
  const calls: string[] = [];
  const deleted: string[] = [];
  const fail = new Map<string, (arg?: string) => boolean>();
  let nextId = 1;
  let nextDevice = 1;
  const check = (method: string, arg?: string) => {
    calls.push(arg === undefined ? method : `${method} ${arg}`);
    if (fail.get(method)?.(arg)) throw new HttpError(`${method}: HTTP 500 injected`, 500);
  };
  const canvasCount = (id: string) => [...canvases.values()].filter(c => c.nodes.some(n => n.device_id === id)).length;
  const client: HomelableClient = {
    listDesigns: async () => {
      check("listDesigns");
      return designs.map(d => ({ ...d, node_count: canvases.get(d.id)?.nodes.length ?? d.node_count ?? 0 }));
    },
    createDesign: async name => {
      check("createDesign", name);
      const d = { id: `design-${nextId++}`, name, design_type: "network", node_count: 0, group_count: 0, text_count: 0 };
      designs.push(d);
      return d;
    },
    renameDesign: async (id, name) => {
      check("renameDesign", id);
      const d = designs.find(x => x.id === id);
      if (!d) throw new HttpError("not found", 404);
      d.name = name;
      return d;
    },
    loadCanvas: async id => {
      check("loadCanvas", id);
      return structuredClone(canvases.get(id) ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, custom_style: null });
    },
    saveCanvas: async body => {
      check("saveCanvas", body.design_id);
      saves.push(structuredClone(body));
      canvases.set(body.design_id, {
        nodes: body.nodes.map(n => {
          if (n.type === "groupRect") return { id: n.id, type: n.type, device_id: null };
          const deviceId = n.device_id ?? `device-${nextDevice++}`;
          inventory.set(deviceId, { id: deviceId, label: n.label, ip: n.ip, properties: n.properties });
          return { id: n.id, type: n.type, device_id: deviceId };
        }),
        edges: body.edges.map(e => ({ id: e.id })),
        viewport: body.viewport,
        custom_style: body.custom_style,
      });
    },
    listInventory: async () => {
      check("listInventory");
      return [...inventory.values()].map(r => ({ ...structuredClone(r), canvas_count: canvasCount(r.id) }));
    },
    deleteInventory: async id => {
      check("deleteInventory", id);
      if (!inventory.delete(id)) throw new HttpError("Device not found", 404);
      deleted.push(id);
    },
  };
  return { client, designs, canvases, inventory, saves, calls, deleted, fail };
}

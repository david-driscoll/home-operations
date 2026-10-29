/**
 * One Jellyfin JSON configuration document -- `/System/Configuration/<key>` or
 * `/Plugins/<id>/Configuration` -- with a set of fields this stack owns.
 *
 * Jellyfin has no Pulumi provider, and every one of these endpoints is
 * whole-document: a POST replaces everything, including state the server or a
 * plugin writes for itself (the SSO plugin's saved account links, scripts
 * someone added in JavaScript Injector). So every write here is
 * read-modify-write: GET the live document, lay the owned fields over it, POST
 * the result back. Fields this resource does not name are carried through
 * untouched.
 *
 * `diff` compares against the LIVE document, not against last run's inputs, so
 * an owned field edited in Jellyfin's UI is put back on the next run, and a run
 * where everything already matches posts nothing.
 *
 * Deleting the resource leaves Jellyfin's configuration as it is.
 */
import * as pulumi from "@pulumi/pulumi";

/** A list in the document whose entries are matched by a key property, not by position. */
export interface JellyfinListUpsert {
  /** Top-level property holding the list, e.g. `CustomJavaScripts`. */
  property: string;
  /** Property identifying an entry, e.g. `Name`. */
  key: string;
  /** Entries to add, or to update in place. Entries with any other key are left alone. */
  items: Record<string, unknown>[];
}

export interface JellyfinConfigurationArgs {
  /** e.g. `http://jellyfin.equestria.svc.cluster.local:8096`. */
  baseUrl: pulumi.Input<string>;
  /** An admin-scoped Jellyfin API key. */
  apiKey: pulumi.Input<string>;
  /** Path of a GET/POST JSON configuration endpoint. */
  endpoint: pulumi.Input<string>;
  /** Fields to own. Objects merge recursively into the live document; arrays and scalars replace. */
  merge?: pulumi.Input<Record<string, unknown>>;
  /** Keyed lists to upsert into, after `merge`. */
  upserts?: pulumi.Input<JellyfinListUpsert[]>;
}

interface ProviderInputs {
  baseUrl: string;
  apiKey: string;
  endpoint: string;
  merge?: Record<string, unknown>;
  upserts?: JellyfinListUpsert[];
}

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lays `desired` over `live`: objects merge key by key, anything else replaces. */
export function mergeOwned(live: unknown, desired: unknown): unknown {
  if (!isPlainObject(live) || !isPlainObject(desired)) return desired;
  const merged: JsonObject = { ...live };
  for (const [key, value] of Object.entries(desired)) {
    merged[key] = mergeOwned(live[key], value);
  }
  return merged;
}

export function upsertList(document: JsonObject, upsert: JellyfinListUpsert): JsonObject {
  const current = document[upsert.property];
  const list = Array.isArray(current) ? [...current] : [];
  for (const item of upsert.items) {
    const index = list.findIndex(entry => isPlainObject(entry) && entry[upsert.key] === item[upsert.key]);
    if (index >= 0) list[index] = { ...(list[index] as JsonObject), ...item };
    else list.push(item);
  }
  return { ...document, [upsert.property]: list };
}

/** The document Jellyfin should hold: the live one with every owned field applied. */
export function applyOwned(live: JsonObject, inputs: Pick<ProviderInputs, "merge" | "upserts">): JsonObject {
  let document = mergeOwned(live, inputs.merge ?? {}) as JsonObject;
  for (const upsert of inputs.upserts ?? []) document = upsertList(document, upsert);
  return document;
}

/** Order-insensitive deep equality over JSON values. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => jsonEqual(value, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(key => jsonEqual(a[key], b[key]));
  }
  return a === b;
}

/** True when any value is still Pulumi's unknown sentinel (a `preview` before its inputs resolve). */
export function containsUnknown(value: unknown): boolean {
  if (typeof value === "string") return value === pulumi.runtime.unknownValue;
  if (Array.isArray(value)) return value.some(containsUnknown);
  if (isPlainObject(value)) return Object.values(value).some(containsUnknown);
  return false;
}

async function jellyfinRequest(inputs: ProviderInputs, method: "GET" | "POST", body?: JsonObject): Promise<JsonObject | undefined> {
  const url = `${inputs.baseUrl.replace(/\/+$/, "")}${inputs.endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      // Jellyfin 12 rejects the legacy `?api_key=` query parameter.
      Authorization: `MediaBrowser Token="${inputs.apiKey}"`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // A 404 on /Plugins/<id>/Configuration means the plugin is not installed.
    // Fail the run rather than skip it: the plugin is installed by hand once,
    // so a missing one afterwards is a fault worth seeing.
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`Jellyfin ${method} ${inputs.endpoint}: HTTP ${response.status} ${response.statusText} ${detail}`.trim());
  }
  if (method === "POST") return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new Error(`Jellyfin GET ${inputs.endpoint}: expected JSON, got ${contentType || "no content type"} (wrong base URL?)`);
  }
  const document = await response.json();
  if (!isPlainObject(document)) throw new Error(`Jellyfin GET ${inputs.endpoint}: expected a JSON object`);
  return document;
}

/** Returns whether a write was needed. */
async function reconcile(inputs: ProviderInputs): Promise<boolean> {
  const live = (await jellyfinRequest(inputs, "GET")) as JsonObject;
  const desired = applyOwned(live, inputs);
  if (jsonEqual(desired, live)) return false;
  await jellyfinRequest(inputs, "POST", desired);
  return true;
}

const jellyfinConfigurationProvider: pulumi.dynamic.ResourceProvider = {
  async diff(_id: string, _olds: ProviderInputs, news: ProviderInputs) {
    // During `preview` an input such as a not-yet-created OIDC client secret is
    // still the unknown sentinel. Say something may change; never send it.
    if (containsUnknown(news)) return { changes: true };
    const live = (await jellyfinRequest(news, "GET")) as JsonObject;
    return { changes: !jsonEqual(applyOwned(live, news), live) };
  },
  async create(inputs: ProviderInputs) {
    await reconcile(inputs);
    return { id: inputs.endpoint, outs: inputs };
  },
  async update(_id: string, _olds: ProviderInputs, news: ProviderInputs) {
    await reconcile(news);
    return { outs: news };
  },
  async delete() {
    // Intentionally nothing: removing this resource from the stack stops
    // managing the fields, it does not strip them out of a running server.
  },
};

export class JellyfinConfiguration extends pulumi.dynamic.Resource {
  constructor(name: string, args: JellyfinConfigurationArgs, opts?: pulumi.CustomResourceOptions) {
    super(jellyfinConfigurationProvider, name, args, {
      // `merge` can carry an OIDC client secret; `apiKey` always is one.
      additionalSecretOutputs: ["apiKey", "merge"],
      ...opts,
    });
  }
}

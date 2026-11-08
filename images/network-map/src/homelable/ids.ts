/**
 * Deterministic Homelable ids (docs/network-map/schema.md "Homelable
 * projection"): UUIDv5 of `<design>:<key>`.
 *
 * Homelable's node and edge ids are GLOBAL primary keys, not per design: a
 * `/canvas/save` whose node id already exists on another design moves that
 * node onto the design being saved. So every id is namespaced by its design,
 * and the same Machine drawn on two designs gets two ids. A UUID also meets the
 * backend's `[A-Za-z0-9_-]+` id rule.
 */
import { createHash } from "node:crypto";

/** RFC 4122's URL namespace, from which the network map's own namespace is derived. */
const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function parseUuid(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`not a UUID: ${uuid}`);
  return Buffer.from(hex, "hex");
}

/** RFC 4122 version 5: SHA-1 of namespace + name, with the version and variant bits set. */
export function uuidv5(name: string, namespace: string): string {
  const hash = createHash("sha1").update(parseUuid(namespace)).update(name, "utf8").digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The network map's namespace. Changing it re-ids every node, which a save treats as delete-all + create-all. */
export const NETWORK_MAP_NAMESPACE = uuidv5("network-map.homelable", URL_NAMESPACE);

/** The id of one node or edge on one design. */
export const homelableId = (design: string, key: string) => uuidv5(`${design}:${key}`, NETWORK_MAP_NAMESPACE);

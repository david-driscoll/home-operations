/**
 * 1Password item -> OpenBao KV v2 path and payload.
 *
 * Classification is a proposal, not a decision. Every item is emitted into
 * mapping.yaml for a human to review before anything is written, because the
 * title set contains things naive slugging gets wrong — `Cluster: Alpha Site`,
 * `Cloudflare (driscoll.tech)`, and four items addressed by UUID rather than
 * title. Anything this file is unsure about is flagged `review: true`.
 */

import { createHash } from "node:crypto";
import { CategoryEnum, type OPClient, TypeEnum } from "@components/op.ts";

export type OPItem = Awaited<ReturnType<OPClient["getItemByTitle"]>>;

/** KV v2 mounts. `docs` is separate so reference material never sits in `secrets`. */
export type Mount = "secrets" | "docs";

export interface MappingEntry {
  /** 1Password item title, verbatim. The join key back to the source. */
  title: string;
  uuid: string;
  tags: string[];
  mount: Mount;
  /** Path within the mount, no leading slash. */
  path: string;
  /** Field labels found on the item, for review. Values are never written here. */
  fields: string[];
  /** Fields typed Concealed in 1Password — recorded, not used for access control. */
  concealed: string[];
  files: string[];
  /** Why this path was chosen, so a reviewer can tell a rule from a guess. */
  rule: string;
  /** True when a human must confirm or correct the path before --apply. */
  review: boolean;
  /** Set to true by a reviewer to exclude an item (inventory, obsolete, personal). */
  skip?: boolean;
  /** Free-text note from the reviewer. Never read by the tooling. */
  note?: string;
}

/** lowercase, non-alphanumerics collapsed to a single dash, trimmed. */
export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 1Password's Concealed field type is the only signal we have for secrecy. */
function isConcealed(field: { type?: TypeEnum }): boolean {
  return field.type === TypeEnum.Concealed;
}

const CLUSTER_KEYS = ["equestria", "sgc", "celestia", "luna", "skystar", "alpha-site"];

/**
 * Tags that mark an item as cross-stack INVENTORY rather than a secret.
 *
 * These move to Pulumi stack outputs consumed via StackReference, not into
 * OpenBao — so they are mapped for visibility but default to skip. The one
 * exception is anything genuinely secret hanging off them (kubeconfig tokens,
 * tailscale auth keys), which a reviewer should split out by hand.
 */
const INVENTORY_TAGS = new Set(["backup-plan", "tailscale-export", "cluster-definition"]);

/**
 * Estate-level exclusions, decided 2026-08-07. Encoded here rather than as
 * hand edits to mapping.yaml so a --plan re-run reproduces them. Skipped items
 * are still emitted (with their would-be path) so the mapping stays a complete
 * record of the vault.
 */
const SKIP_POLICIES: Array<{ match: (title: string, tags: string[]) => boolean; reason: string }> = [
  // Generated credential families the Pulumi stacks will create directly in
  // OpenBao instead of copying out of 1Password.
  { match: t => t.endsWith("-oidc-credentials"), reason: "Pulumi stacks will create OIDC credentials in OpenBao directly" },
  { match: t => t.startsWith("Proxmox Backup Server"), reason: "Pulumi stacks will create PBS credentials in OpenBao directly" },
  // Case-insensitive: the live vault has "Luna PBS backup user" (lowercase b/u).
  // Unlike the "Proxmox Backup Server*" family above, NO Pulumi code generates
  // these — they are hand-created items (verified during Phase 8a). Estate
  // decision 2026-08-08: they stay in 1Password for now.
  { match: t => t.toLowerCase().endsWith("pbs backup user"), reason: "hand-created; stays in 1Password for now (estate decision 2026-08-08)" },
  // Excluded from migration scope by estate decision, 2026-08-07.
  { match: t => t === "Authentik Outputs", reason: "excluded from migration scope (estate decision 2026-08-07)" },
  { match: t => t.startsWith("B2 Database"), reason: "excluded from migration scope (estate decision 2026-08-07)" },
  { match: t => t.startsWith("B2 Backup"), reason: "excluded from migration scope (estate decision 2026-08-07)" },
  { match: t => t.startsWith("Backblaze"), reason: "excluded from migration scope (estate decision 2026-08-07)" },
  { match: t => t === "Backup Plan", reason: "inventory — moves to Pulumi stack outputs" },
  // Tailnet user entries stay in 1Password for now.
  { match: (_t, tags) => tags.includes("opossum-yo.ts.net/user"), reason: "user entries excluded for now (estate decision 2026-08-07)" },
  // Seal-chain and pre-auth material. INVENTORY.md §2: these can never live in
  // OpenBao — the unseal key unseals the thing that unseals OpenBao, and
  // Pulumi must authenticate before it can read anything. Their destination is
  // vault/bootstrap/openbao/*.sops.yaml, not a KV mount.
  { match: t => t === "OpenBao Alpha Site Static Unseal", reason: "seal chain — belongs in vault/bootstrap (INVENTORY §2), never inside the thing it unseals" },
  { match: t => t === "Pulumi Passphrase", reason: "pre-auth bootstrap — belongs in vault/bootstrap pulumi-approle.sops.yaml (INVENTORY §2)" },
  // Personal-scope, retained in 1Password by design (PLAN §G, Phase 11 notes).
  { match: t => t === "GitHub Personal Access Token", reason: "personal-scope — 1Password remains its home (PLAN §G)" },
];

export function classify(item: OPItem): Omit<MappingEntry, "fields" | "concealed" | "files"> {
  const entry = classifyPath(item);
  const policy = SKIP_POLICIES.find(p => p.match(item.title, item.tags ?? []));
  if (policy) {
    // review: false — the decision is already made; there is nothing to review.
    return { ...entry, skip: true, review: false, rule: `${entry.rule} — SKIP: ${policy.reason}` };
  }
  return entry;
}

function classifyPath(item: OPItem): Omit<MappingEntry, "fields" | "concealed" | "files"> {
  const title = item.title;
  const tags = item.tags ?? [];
  const base = { title, uuid: item.id, tags };

  // Generated per-app families. Matching these first keeps them out of the
  // shared/ dump, and they are by far the highest-cardinality group.
  const oidc = /^(.+?)-(.+)-oidc-credentials$/.exec(title);
  if (oidc && CLUSTER_KEYS.includes(oidc[1])) {
    return { ...base, mount: "secrets", path: `clusters/${oidc[1]}/apps/${slug(oidc[2])}/oidc`, rule: "oidc-credentials", review: false };
  }
  const pg = /^(.+?)-(.+)-postgres$/.exec(title);
  if (pg && CLUSTER_KEYS.includes(pg[1])) {
    return { ...base, mount: "secrets", path: `clusters/${pg[1]}/apps/${slug(pg[2])}/postgres`, rule: "postgres-credentials", review: false };
  }

  // Tag-driven groups. These replace findItemsByTag(), which has no KV v2
  // equivalent — the path prefix plus LIST is what reproduces it.
  if (tags.includes("dockge")) {
    return { ...base, mount: "secrets", path: `hosts/dockge/${slug(title)}`, rule: "tag:dockge", review: false };
  }
  if (tags.includes("pbs")) {
    return { ...base, mount: "secrets", path: `hosts/pbs/${slug(title)}`, rule: "tag:pbs", review: false };
  }
  const inventoryTag = tags.find(t => INVENTORY_TAGS.has(t));
  if (inventoryTag) {
    return {
      ...base,
      mount: "secrets",
      path: `clusters/_inventory/${slug(title)}`,
      rule: `tag:${inventoryTag} — INVENTORY, moves to Pulumi stack outputs`,
      review: true,
      skip: true,
    };
  }

  // Titles that are UUIDs rather than names. Four of these exist and every one
  // needs a human to say what it actually is.
  if (/^[a-z0-9]{26}$/.test(title)) {
    return { ...base, mount: "secrets", path: `shared/UNRESOLVED-${title}`, rule: "uuid-addressed item — name it", review: true };
  }

  // Secure notes with no concealed field are usually reference material rather
  // than a credential. Flagged either way: "usually" is not "always".
  const hasConcealed = Object.values(item.fields ?? {}).some(isConcealed);
  if (item.category === CategoryEnum.SecureNote && !hasConcealed) {
    return { ...base, mount: "docs", path: slug(title), rule: "SecureNote with no concealed field — likely a document", review: true };
  }

  return { ...base, mount: "secrets", path: `shared/${slug(title)}`, rule: "default", review: true };
}

export function describe(item: OPItem): Pick<MappingEntry, "fields" | "concealed" | "files"> {
  const rootFields = Object.entries(item.fields ?? {});
  const sectionFields = Object.entries(item.sections ?? {}).flatMap(([s, sec]) =>
    Object.entries(sec.fields ?? {}).map(([k, v]) => [`${s}.${k}`, v] as const),
  );
  const all = [...rootFields, ...sectionFields];
  return {
    fields: all.map(([k]) => k).sort((a, b) => a.localeCompare(b)),
    concealed: all.filter(([, v]) => isConcealed(v)).map(([k]) => k).sort((a, b) => a.localeCompare(b)),
    files: Object.keys(item.files ?? {}).sort((a, b) => a.localeCompare(b)),
  };
}

export interface Payload {
  data: Record<string, unknown>;
  customMetadata: Record<string, string>;
}

/**
 * Flatten a 1Password item into the KV v2 shape.
 *
 * Root fields become top-level keys and sections become nested objects. The
 * "add more" pseudo-section is already hoisted to root by OPClient.mapItem, so
 * it does not exist by the time we get here.
 *
 * Files carry their bytes, so they become {content_b64, filename, sha256}
 * under a `files` key. The encoding marker lives in DATA, not custom_metadata:
 * vals cannot read metadata, so anything a consumer needs must be in data.
 */
export function toPayload(item: OPItem, migratedAt: string): Payload {
  const data: Record<string, unknown> = {};

  for (const [label, field] of Object.entries(item.fields ?? {})) {
    if (field.value === undefined) continue;
    data[label] = field.value;
  }

  for (const [sectionKey, section] of Object.entries(item.sections ?? {})) {
    const nested: Record<string, unknown> = {};
    for (const [label, field] of Object.entries(section.fields ?? {})) {
      if (field.value === undefined) continue;
      nested[label] = field.value;
    }
    if (Object.keys(nested).length > 0) data[sectionKey] = nested;
  }

  const files: Record<string, unknown> = {};
  for (const [name, file] of Object.entries(item.files ?? {})) {
    if (file.content === undefined) continue;
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content));
    files[name] = {
      filename: file.name ?? name,
      content_b64: buf.toString("base64"),
      sha256: createHash("sha256").update(buf).digest("hex"),
    };
  }
  if (Object.keys(files).length > 0) data.files = files;

  const { concealed } = describe(item);
  const customMetadata: Record<string, string> = {
    source_title: item.title,
    source_uuid: item.id,
    migrated_at: migratedAt,
    contains_secrets: String(concealed.length > 0),
  };
  if ((item.tags ?? []).length > 0) customMetadata.source_tags = item.tags.join(",");
  if (concealed.length > 0) customMetadata.concealed_fields = concealed.join(",");

  // OpenBao rejects the whole write if any value exceeds 512 chars, so trim
  // rather than lose the migration record over a long tag list.
  for (const [k, v] of Object.entries(customMetadata)) {
    if (v.length > 512) customMetadata[k] = `${v.slice(0, 509)}...`;
  }

  return { data, customMetadata };
}

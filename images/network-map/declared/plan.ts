/**
 * The declared layer's graph plan: what the repo on main says, as labelled
 * nodes and typed relationships (docs/network-map/schema.md). Each reader in
 * this directory adds to one `DeclaredPlan`; ./cypher.ts writes it.
 *
 * The same labels and keys as the observed layer, so a declared node and the
 * observed one it stands for differ only in `layer` (../src/declares.ts joins
 * them). Plus `Zone`, which only the declared layer has.
 */
import type { Prop } from "../src/model.ts";

export type DeclaredLabel = "Machine" | "Network" | "Group" | "Route" | "App" | "Zone" | "Policy";
export type DeclaredRelType = "HOSTED_ON" | "RUNS" | "MEMBER_OF" | "REACHES" | "ROUTES_TO" | "IN_ZONE";

export const DECLARED_LABELS: DeclaredLabel[] = ["Machine", "Network", "Group", "Route", "App", "Zone", "Policy"];
export const DECLARED_REL_TYPES: DeclaredRelType[] = ["HOSTED_ON", "RUNS", "MEMBER_OF", "REACHES", "ROUTES_TO", "IN_ZONE"];

/** Each label's key property: the observed layer's (../src/cypher.ts KEY_PROPERTY), plus Zone's. */
export const DECLARED_KEY_PROPERTY: Record<DeclaredLabel, string> = {
  Machine: "machineId",
  Network: "networkId",
  Group: "groupId",
  Route: "routeId",
  App: "appId",
  Zone: "zoneId",
  Policy: "policyId",
};

export interface DeclaredNode {
  label: DeclaredLabel;
  key: string;
  props: Record<string, Prop>;
}

export interface DeclaredRel {
  type: DeclaredRelType;
  from: { label: DeclaredLabel; key: string };
  to: { label: DeclaredLabel; key: string };
  /** Distinguishes parallel edges of one type between the same pair (REACHES via two policies). */
  mergeKey: string;
  props: Record<string, Prop>;
}

/** Collects nodes and edges from every reader. Later puts of the same node fill gaps; they never overwrite. */
export class DeclaredPlan {
  readonly nodes = new Map<string, DeclaredNode>();
  readonly rels = new Map<string, DeclaredRel>();
  /** Things a reader could not resolve (a `${VAR}` with no value, a stack with no compose file). Logged, never fatal. */
  readonly problems: string[] = [];

  node(label: DeclaredLabel, key: string, props: Record<string, Prop> = {}): void {
    const id = `${label}|${key}`;
    const existing = this.nodes.get(id);
    if (!existing) {
      this.nodes.set(id, { label, key, props: { ...props } });
      return;
    }
    for (const [k, v] of Object.entries(props)) {
      const current = existing.props[k];
      if (current === undefined || current === null) existing.props[k] = v;
      else if (Array.isArray(current) && Array.isArray(v)) existing.props[k] = [...new Set([...(current as string[]), ...(v as string[])])];
    }
  }

  rel(type: DeclaredRelType, from: DeclaredRel["from"], to: DeclaredRel["to"], props: Record<string, Prop> = {}, mergeKey = ""): void {
    const id = `${type}|${from.label}|${from.key}|${to.label}|${to.key}|${mergeKey}`;
    if (!this.rels.has(id)) this.rels.set(id, { type, from, to, mergeKey, props });
  }

  has(label: DeclaredLabel, key: string): boolean {
    return this.nodes.has(`${label}|${key}`);
  }

  /** The nodes, and the edges whose two ends are both in the plan. A dangling edge is a problem, not a write. */
  finish(): { nodes: DeclaredNode[]; rels: DeclaredRel[]; problems: string[] } {
    const rels: DeclaredRel[] = [];
    const problems = [...this.problems];
    for (const rel of this.rels.values()) {
      const missing = [rel.from, rel.to].filter(end => !this.has(end.label, end.key));
      if (missing.length > 0) problems.push(`${rel.type} ${rel.from.label}:${rel.from.key} -> ${rel.to.label}:${rel.to.key}: no ${missing.map(m => `${m.label}:${m.key}`).join(", ")}`);
      else rels.push(rel);
    }
    return { nodes: [...this.nodes.values()], rels, problems };
  }
}

/**
 * Runs one source's read. A missing, renamed or unparsable source file is a
 * problem (`<what>: <why>; skipped`) and yields `fallback`, so one source
 * going away never stops the rest of the declared layer from loading.
 */
export async function attempt<T>(problems: string[], what: string, fallback: T, read: () => Promise<T> | T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === "ENOENT" ? "not found" : error instanceof Error ? error.message : String(error);
    problems.push(`${what}: ${reason}; skipped`);
    return fallback;
  }
}

/** A declared Machine's key: one per hostname, whichever file declares it. */
export const machineKey = (hostname: string) => `repo:${hostname.toLowerCase()}`;

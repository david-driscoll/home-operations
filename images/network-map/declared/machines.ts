/**
 * Declared machines, from three places in the repo:
 *
 *   - the Pulumi site stacks (stacks/home, stacks/gulf-of-mexico,
 *     stacks/ocracoke): each `new ProxmoxHost(...)`, `new DockgeLxc(...)`,
 *     `new TalosVm(...)` and `new TruenasVm(...)`. Those programs cannot be
 *     imported (importing one RUNS it), so their source is parsed with the
 *     TypeScript compiler and only the literal arguments are read: names,
 *     addresses, VM ids, MACs, `host:` references and Tailscale route args.
 *     Anything computed (a random VM id, a `cluster` object) is skipped;
 *   - talos/talconfig.yaml: Equestria's nodes, with their LAN address and MAC;
 *   - clusters/*.yaml: which cluster each Dockge host serves, and where it is.
 *
 * One declared Machine per hostname (`repo:<hostname>`, ./plan.ts), however
 * many of those places name it: milky-way is both a TalosVm and a Talos node.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { parse as parseYaml } from "yaml";
import type { Prop } from "../src/model.ts";
import { type DeclaredPlan, machineKey } from "./plan.ts";

/** The constructors read, and the Machine kind each declares. */
export const MACHINE_CLASSES = { ProxmoxHost: "physical", DockgeLxc: "lxc", TalosVm: "vm", TruenasVm: "vm" } as const;
export type MachineClass = keyof typeof MACHINE_CLASSES;

/** The stacks that construct them. */
export const SITE_STACKS = ["home", "gulf-of-mexico", "ocracoke"];

/** A literal value read from source, or a reference to another constructed resource. */
export type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal } | { ref: string };

export interface ConstructedResource {
  /** The variable it is assigned to, qualified by its file (`stacks/home/index.ts#celestiaHost`). */
  variable?: string;
  className: MachineClass;
  /** The Pulumi resource name, the first argument. */
  name: string;
  /** The literal properties of the args object; anything not literal is absent. */
  args: Record<string, Literal>;
}

/** Objects the parser may read property paths of (`Tailscale.subnets.home`). */
export type Scope = Record<string, unknown>;

function evaluate(node: ts.Expression, scope: Scope, variables: Map<string, string>): Literal | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) return evaluate(node.expression, scope, variables);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map(e => (ts.isSpreadElement(e) ? undefined : evaluate(e, scope, variables)));
    return items.every(i => i !== undefined) ? (items as Literal[]) : undefined;
  }
  if (ts.isObjectLiteralExpression(node)) return objectLiteral(node, scope, variables);
  if (ts.isIdentifier(node)) return variables.has(node.text) ? { ref: variables.get(node.text) as string } : undefined;
  if (ts.isPropertyAccessExpression(node)) {
    const path: string[] = [];
    let cursor: ts.Expression = node;
    while (ts.isPropertyAccessExpression(cursor)) {
      path.unshift(cursor.name.text);
      cursor = cursor.expression;
    }
    if (!ts.isIdentifier(cursor) || !(cursor.text in scope)) return undefined;
    let value: unknown = scope[cursor.text];
    for (const key of path) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
  }
  // `pulumi.output("10.10.10.10")`: the literal it wraps.
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "output" && node.arguments.length === 1) {
    return evaluate(node.arguments[0], scope, variables);
  }
  return undefined;
}

function objectLiteral(node: ts.ObjectLiteralExpression, scope: Scope, variables: Map<string, string>): Record<string, Literal> {
  const out: Record<string, Literal> = {};
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
      const value = evaluate(prop.initializer, scope, variables);
      if (value !== undefined) out[prop.name.text] = value;
    } else if (ts.isShorthandPropertyAssignment(prop) && variables.has(prop.name.text)) {
      out[prop.name.text] = { ref: variables.get(prop.name.text) as string };
    }
  }
  return out;
}

/** Every `new <MachineClass>("<name>", {...})` in a stack's source, in order. */
export function parseStackSource(source: string, scope: Scope = {}, fileName = "index.ts"): ConstructedResource[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: { node: ts.NewExpression; variable?: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text in MACHINE_CLASSES) {
      const parent = node.parent;
      found.push({ node, variable: ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : undefined });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Qualified by file: two stacks both call their ProxmoxHost `host`.
  const qualify = (v: string) => `${fileName}#${v}`;
  const variables = new Map(found.flatMap(f => (f.variable ? [[f.variable, qualify(f.variable)] as const] : [])));
  return found.flatMap(({ node, variable }) => {
    const [nameArg, argsArg] = node.arguments ?? [];
    if (!nameArg || !(ts.isStringLiteral(nameArg) || ts.isNoSubstitutionTemplateLiteral(nameArg))) return [];
    const args = argsArg && ts.isObjectLiteralExpression(argsArg) ? objectLiteral(argsArg, scope, variables) : {};
    return [{ variable: variable && qualify(variable), className: (node.expression as ts.Identifier).text as MachineClass, name: nameArg.text, args }];
  });
}

export interface TalosNode {
  hostname: string;
  ipAddress?: string;
  controlPlane?: boolean;
  macs: string[];
}

/** talconfig.yaml's `nodes`: hostname, address, role and every `hardwareAddr` under it. */
export function parseTalconfig(text: string): TalosNode[] {
  const doc = parseYaml(text) as { nodes?: Record<string, unknown>[] } | null;
  const macsIn = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(macsIn);
    if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => (k === "hardwareAddr" && typeof v === "string" ? [v.toLowerCase()] : macsIn(v)));
    return [];
  };
  return (doc?.nodes ?? [])
    .filter(n => typeof n.hostname === "string")
    .map(n => ({
      hostname: n.hostname as string,
      ipAddress: typeof n.ipAddress === "string" ? n.ipAddress : undefined,
      controlPlane: typeof n.controlPlane === "boolean" ? n.controlPlane : undefined,
      macs: [...new Set(macsIn(n.networkInterfaces))],
    }));
}

export interface ClusterFile {
  key: string;
  title?: string;
  type: string;
  location?: string;
  domainPrefix?: string;
}

export function parseClusterFile(text: string): ClusterFile {
  const doc = parseYaml(text) as ClusterFile;
  if (!doc?.key || !doc.type) throw new Error("a cluster file needs `key` and `type`");
  return { key: doc.key, title: doc.title, type: doc.type, location: doc.location, domainPrefix: doc.domainPrefix };
}

const str = (v: Literal | undefined) => (typeof v === "string" ? v : undefined);
const refOf = (v: Literal | undefined) => (v && typeof v === "object" && !Array.isArray(v) && "ref" in v ? (v.ref as string) : undefined);

/** One Dockge host: the LXC, the Proxmox host it runs on, and the `${host}` its stacks are rendered with. */
export interface DockgeHost {
  /** The LXC's name, which is also its hostname (`celestia-dockge`). */
  name: string;
  /** The Proxmox host's name, which names its docker/<dir> and its cluster file (`celestia`). */
  hostName: string;
  /** `${host}` in docker/: the Proxmox host's shortName, else its name. */
  shortName: string;
}

/** The Dockge hosts the stacks construct: each DockgeLxc and the ProxmoxHost its `host:` names. */
export function dockgeHosts(resources: ConstructedResource[]): DockgeHost[] {
  const byVariable = new Map(resources.filter(r => r.variable).map(r => [r.variable as string, r]));
  return resources
    .filter(r => r.className === "DockgeLxc")
    .flatMap(r => {
      const host = byVariable.get(refOf(r.args.host) ?? "");
      if (!host) return [];
      return [{ name: r.name, hostName: host.name, shortName: str(host.args.shortName) ?? host.name }];
    });
}

/** The constructed resources and Talos nodes -> declared Machines, HOSTED_ON, and Tailscale routes their hosts advertise. */
export function addMachines(plan: DeclaredPlan, input: { resources: ConstructedResource[]; talos: TalosNode[]; clusters: ClusterFile[] }): void {
  const byVariable = new Map(input.resources.filter(r => r.variable).map(r => [r.variable as string, r]));
  const clusterOf = new Map(input.clusters.map(c => [c.key, c]));
  for (const r of input.resources) {
    const a = r.args;
    const ips = [str(a.internalIpAddress), str(a.ipAddress), str(a.tailscaleIpAddress)].filter((ip): ip is string => !!ip);
    const mac = str(a.macAddress)?.toLowerCase();
    // A Proxmox host is named for its cluster (celestia), and its Dockge LXC
    // serves the same one. A VM on it does not: milky-way is Equestria's
    // (its Talos node, below, says so), whatever it is hosted on.
    const host = r.className === "ProxmoxHost" ? r : byVariable.get(refOf(a.host) ?? "");
    const hostCluster = host ? clusterOf.get(host.name) : undefined;
    const cluster = r.className === "ProxmoxHost" || r.className === "DockgeLxc" ? hostCluster : undefined;
    const props: Record<string, Prop> = {
      name: r.name,
      hostname: r.name.toLowerCase(),
      kind: MACHINE_CLASSES[r.className],
      declaredAs: r.className,
      title: str(a.title),
      ips,
      macs: mac ? [mac] : undefined,
      vmId: typeof a.vmId === "number" ? a.vmId : undefined,
      cluster: cluster?.key,
      location: hostCluster?.location,
      remote: typeof a.remote === "boolean" ? a.remote : undefined,
    };
    plan.node("Machine", machineKey(r.name), props);
    if (r.className !== "ProxmoxHost" && host) plan.rel("HOSTED_ON", { label: "Machine", key: machineKey(r.name) }, { label: "Machine", key: machineKey(host.name) });

    // Tailscale routes a host advertises (ProxmoxHost tailscaleSubnetRoutes / tailscaleArgs.advertiseExitNode).
    const routes = Array.isArray(a.tailscaleSubnetRoutes) ? a.tailscaleSubnetRoutes.filter((x): x is string => typeof x === "string") : [];
    const tsArgs = a.tailscaleArgs && typeof a.tailscaleArgs === "object" && !Array.isArray(a.tailscaleArgs) ? (a.tailscaleArgs as Record<string, Literal>) : {};
    for (const cidr of routes) plan.node("Route", `tailscale:${cidr}`, { system: "tailscale", cidr, exit: false, advertisedBy: [r.name] });
    if (tsArgs.advertiseExitNode === true) {
      for (const cidr of ["0.0.0.0/0", "::/0"]) plan.node("Route", `tailscale:${cidr}`, { system: "tailscale", cidr, exit: true, advertisedBy: [r.name] });
    }
  }
  for (const n of input.talos) {
    plan.node("Machine", machineKey(n.hostname), {
      name: n.hostname,
      hostname: n.hostname.toLowerCase(),
      declaredAs: "TalosNode",
      ips: n.ipAddress ? [n.ipAddress] : undefined,
      macs: n.macs.length > 0 ? n.macs : undefined,
      cluster: "equestria",
      role: n.controlPlane === undefined ? undefined : n.controlPlane ? "control-plane" : "worker",
    });
  }
}

/** Reads the three places from a checkout. `scope` holds the constants the stacks reference (`Tailscale`). */
export async function readMachineSources(root: string, scope: Scope): Promise<{ resources: ConstructedResource[]; talos: TalosNode[]; clusters: ClusterFile[] }> {
  const resources = (await Promise.all(SITE_STACKS.map(async stack => parseStackSource(await readFile(join(root, "stacks", stack, "index.ts"), "utf8"), scope, `stacks/${stack}/index.ts`)))).flat();
  const talos = parseTalconfig(await readFile(join(root, "talos", "talconfig.yaml"), "utf8"));
  const files = (await readdir(join(root, "clusters"))).filter(f => f.endsWith(".yaml")).sort();
  const clusters = await Promise.all(files.map(async f => parseClusterFile(await readFile(join(root, "clusters", f), "utf8"))));
  return { resources, talos, clusters };
}

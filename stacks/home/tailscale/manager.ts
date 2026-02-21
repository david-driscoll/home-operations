import * as tailscale from "@pulumi/tailscale";
import * as pulumi from "@pulumi/pulumi";
import {
  PolicyFile,
  TailscaleAutoApprovers,
  TailscaleAutogroups,
  TailscaleCidr,
  TailscaleGrant,
  TailscaleGroups,
  TailscaleNetworkCapability,
  TailscaleNodeAttr,
  TailscalePolicyFile,
  TailscaleSelector,
  TailscaleService,
  TailscaleSshRule,
  TailscaleSshTest,
  TailscaleSshUser,
  TailscaleTagOwners,
  TailscaleTags,
  TailscaleTest,
  TailscaleTestSelector,
} from "@openapi/tailscale-grants.js";
import * as parser from "jsonc-parser";
import { awaitOutput } from "@components/helpers.ts";

type TailscaleTestFactory<T, R> = (grant: T) => R[];
export type TailscaleTestInput = { accept: pulumi.Input<string[]>; deny?: pulumi.Input<string[]> } | { accept?: pulumi.Input<string[]>; deny: pulumi.Input<string[]> };
export type TailscaleSshTestInputItem =
  | { accept: pulumi.Input<TailscaleSshUser[]>; deny?: pulumi.Input<TailscaleSshUser[]>; check?: pulumi.Input<TailscaleSshUser[]> }
  | { accept?: pulumi.Input<TailscaleSshUser[]>; deny: pulumi.Input<TailscaleSshUser[]>; check?: pulumi.Input<TailscaleSshUser[]> }
  | { accept?: pulumi.Input<TailscaleSshUser[]>; deny?: pulumi.Input<TailscaleSshUser[]>; check: pulumi.Input<TailscaleSshUser[]> };
type TailscaleSshTestInput = Record<TailscaleSshUser, TailscaleSshTestInputItem>;

export const subnets = {
  internal: "10.10.0.0/16" as TailscaleCidr,
};
export const ports = {
  any: ["*"] as TailscaleNetworkCapability[],
  web: ["tcp:443", "tcp:80", "udp:443", "udp:80"] as TailscaleNetworkCapability[],
  dns: ["tcp:53", "udp:53", "tcp:853", "udp:853", "udp:784", "tcp:443"] as TailscaleNetworkCapability[],
  ssh: ["tcp:22", "udp:22"] as TailscaleNetworkCapability[],
  dockge: ["tcp:80", "tcp:443"] as TailscaleNetworkCapability[],
  dockgeManagement: ["tcp:5001", "udp:5001", "tcp:9595", "tcp:2022", "udp:2022", "tcp:2375", "udp:2375"] as TailscaleNetworkCapability[],
  observability: ["tcp:9093", "tcp:19291", "tcp:9090", "tcp:3100", "tcp:8266", "udp:8266", "tcp:1883", "udp:1883", "tcp:8080", "udp:8080"] as TailscaleNetworkCapability[],
  nut: ["tcp:3493", "udp:3493"] as TailscaleNetworkCapability[],
  proxmox: ["tcp:80", "tcp:443"] as TailscaleNetworkCapability[],
  proxmoxManagement: ["tcp:8006", "tcp:8007"] as TailscaleNetworkCapability[],
};
export const autogroups = {
  member: "autogroup:member" as TailscaleAutogroups,
  self: "autogroup:self" as TailscaleAutogroups,
  tagged: "autogroup:tagged" as TailscaleAutogroups,
  shared: "autogroup:shared" as TailscaleAutogroups,
  internet: "autogroup:internet" as TailscaleAutogroups,
  admin: "autogroup:admin" as TailscaleAutogroups,
  owner: "autogroup:owner" as TailscaleAutogroups,
  iiAdmin: "autogroup:it-admin" as TailscaleAutogroups,
  networkAdmin: "autogroup:network-admin" as TailscaleAutogroups,
  billingAdmin: "autogroup:billing-admin" as TailscaleAutogroups,
  auditor: "autogroup:auditor" as TailscaleAutogroups,
};
export const groups = {
  me: "group:me" as TailscaleGroups,
  admins: "group:admins" as TailscaleGroups,
  mediaManagers: "group:media-managers" as TailscaleGroups,
  family: "group:family" as TailscaleGroups,
  friends: "group:friends" as TailscaleGroups,
};
export const tag = {
  exitNode: "tag:exit-node" as TailscaleTags,
  mediaDevice: "tag:media-device" as TailscaleTags,
  sgc: "tag:sgc" as TailscaleTags,
  k8s: "tag:k8s" as TailscaleTags,
  equestria: "tag:equestria" as TailscaleTags,
  operator: "tag:operator" as TailscaleTags,
  recorder: "tag:recorder" as TailscaleTags,
  proxmox: "tag:proxmox" as TailscaleTags,
  dockge: "tag:dockge" as TailscaleTags,
  apps: "tag:apps" as TailscaleTags,
  sharedDrive: "tag:shared-drive" as TailscaleTags,
  egress: "tag:egress" as TailscaleTags,
  ingress: "tag:ingress" as TailscaleTags,
  management: "tag:management" as TailscaleTags,
  observability: "tag:observability" as TailscaleTags,
};

class TailscaleAclContext {
  _acls: string;
  _policy?: TailscalePolicyFile;
  constructor(acls: string) {
    this._acls = acls;
  }

  public get acls() {
    return this._acls;
  }

  public get policy() {
    if (!this._policy) {
      this._policy = parser.parse(this._acls) as TailscalePolicyFile;
    }
    return this._policy;
  }
}

type TestsData = {
  taggedDevices: string[];
  dockgeDevices: string[];
  kubernetesDevices: string[];
  proxmoxDevices: string[];
};

type TestsDataPopulated = TestsData & {
  knownNormalUsers: string[];
  knownAdminUsers: string[];
};

export class TailscaleAclManager {
  acls: string;
  updates: ((context: TailscaleAclContext) => pulumi.Output<string>)[] = [];
  testData: TestsDataPopulated;
  constructor(acls: string, hosts: { [key: string]: pulumi.Input<string> }, testData: TestsData) {
    this.acls = acls;
    this.updates.push(({ acls }) => {
      return pulumi.output(hosts).apply((hosts) => {
        return Object.entries(hosts).reduce((acc, [key, value]) => applyAllEdits(acc, ["hosts", key], value), acls);
      });
    });

    const context = new TailscaleAclContext(acls);
    const knownAdminUsers = context.policy.groups?.[groups.admins] ?? [];
    const knownNormalUsers = context.policy.groups?.[groups.family] ?? [];

    // parser.findNodeAtLocation
    this.testData = { ...testData, knownNormalUsers: knownNormalUsers.filter((z) => !knownAdminUsers.includes(z)), knownAdminUsers };
  }

  public setGrant(name: string, grant: pulumi.Input<TailscaleGrant>, tests: TailscaleTestFactory<TailscaleGrant, TailscaleTest> | TailscaleTestInput): TailscaleAclManager;
  public setGrant(grant: pulumi.Input<TailscaleGrant>, tests: TailscaleTestFactory<TailscaleGrant, TailscaleTest> | TailscaleTestInput): TailscaleAclManager;
  public setGrant(
    name: string | pulumi.Input<TailscaleGrant> | undefined,
    grant: pulumi.Input<TailscaleGrant> | TailscaleTestFactory<TailscaleGrant, TailscaleTest> | TailscaleTestInput,
    tests?: TailscaleTestFactory<TailscaleGrant, TailscaleTest> | TailscaleTestInput,
  ) {
    this.updates.push((context) =>
      pulumi
        .all([typeof name === "string" ? name : undefined, typeof name !== "string" ? name! : grant!, typeof name !== "string" ? grant! : tests!])
        .apply((data) => buildGrant(data as any, context)),
    );
    return this;

    function buildGrant(data: [string | undefined, TailscaleGrant, TailscaleTestFactory<TailscaleGrant, TailscaleTest> | pulumi.UnwrappedObject<TailscaleTestInput>], context: TailscaleAclContext) {
      let items: {
        name: string;
        grant: TailscaleGrant;
        tests: TailscaleTestFactory<TailscaleGrant, TailscaleTest>;
      };
      if (typeof data[0] !== "string") {
        items = { name: getGrantName(data[1]), grant: data[1], tests: data[2] as any };
      } else {
        items = { name: data[0], grant: data[1], tests: data[2] as any };
      }
      if (typeof data[2] !== "function") {
        const testSources = data[2];
        items.tests = (grant) => {
          if (!grant.dst || !grant.ip) return [];

          const { dst, ip } = grant;

          const destinations = (p: string, user: string | undefined) => {
            return dst
              .map((u) => u.replace(/^host\:/, ""))
              .filter((dest) => dest !== autogroups.internet)
              .map((d) => (d === autogroups.internet ? d : `${d}:${p ?? "443"}`));
          };

          return [
            ...(testSources.accept ?? [])
              .map((u) => u.replace(/^host\:/, ""))
              .flatMap((user) =>
                ip.map((port) => {
                  const [proto, p] = port.toString().split(":");
                  return {
                    src: user,
                    proto: proto === "*" ? "tcp" : (proto as TailscaleTest["proto"]),
                    accept: destinations(p, user),
                  } as TailscaleTest;
                }),
              ),
            ...(testSources.deny ?? [])
              .map((u) => u.replace(/^host\:/, ""))
              .flatMap((user) =>
                ip.map((port) => {
                  const [proto, p] = port.toString().split(":");
                  return {
                    src: user,
                    proto: proto === "*" ? "tcp" : (proto as TailscaleTest["proto"]),
                    deny: destinations(p, user),
                  } as TailscaleTest;
                }),
              ),
          ].filter((z) => (z.accept?.length ?? 0) + (z.deny?.length ?? 0) > 0);
        };
      }
      return setGrant(context, items.name, items.grant, items.tests);
    }
  }

  public setTagOwner(owner: TailscaleTags, tags: TailscaleTags[]): TailscaleAclManager;
  public setTagOwner(owner: TailscaleTags): TailscaleAclManager;
  public setTagOwner(owner: TailscaleTags, tags?: TailscaleTags[]) {
    this.updates.push((context) => pulumi.output(setTagOwner(context, owner, [...(tags ?? [])])));
    return this;
  }

  public setNodeAttr(value: TailscaleNodeAttr) {
    this.updates.push((context) => pulumi.output(setNodeAttr(context, value)));
    return this;
  }

  public setGroup(owner: TailscaleGroups, tags: TailscaleSelector[]): TailscaleAclManager;
  public setGroup(owner: TailscaleGroups): TailscaleAclManager;
  public setGroup(owner: TailscaleGroups, tags?: TailscaleSelector[]) {
    this.updates.push((context) => pulumi.output(setGroup(context, owner, [...(tags ?? [])])));
    return this;
  }

  // Append SSH rule (policy.ssh array). We rely on tailnet policy evaluation rather than updating snapshot.
  public setSshRule(rule: pulumi.Input<TailscaleSshRule>, tests: TailscaleTestFactory<TailscaleGrant, TailscaleSshTest> | TailscaleSshTestInput) {
    if (typeof tests !== "function") {
      const testSources = tests;
      tests = (grant) => {
        if (!grant.dst) return [];

        return Object.entries(testSources).map(([key, value]) => {
          return {
            src: key,
            dst: grant.dst,
            accept: value.accept,
            check: value.check,
            deny: value.deny,
          } as TailscaleSshTest;
        });
      };
    }
    this.updates.push((context) => pulumi.all([rule]).apply(([r]) => setSshRule(context, r, tests)));
    return this;
  }

  public setExitNode(tag: TailscaleTags) {
    this.updates.push((context) => pulumi.output(setExitNode(context, tag)));
    return this;
  }

  public setRoute(cidr: TailscaleCidr, approvers: TailscaleTags[]) {
    this.updates.push((context) => pulumi.output(setRoute(context, cidr, approvers)));
    return this;
  }

  public setService(service: TailscaleTags | TailscaleService, approvers: TailscaleTags[]) {
    this.updates.push((context) => pulumi.output(setService(context, service, approvers)));
    return this;
  }

  public async getJson() {
    let acls = this.acls;
    for (const update of this.updates) {
      try {
        acls = await awaitOutput(update(new TailscaleAclContext(acls)));
      } catch (e) {
        console.error("Error applying update:", e);
        throw e;
      }
    }
    return acls;
  }

  public getJsonParsed() {
    return pulumi.output(this.getJson()).apply((acls) => parser.parse(acls) as TailscalePolicyFile);
  }
}

function setSshRule({ acls, policy }: TailscaleAclContext, rule: TailscaleSshRule, tests: TailscaleTestFactory<TailscaleGrant, TailscaleSshTest>) {
  let current = policy.ssh ?? [];
  const name = getSshGrantName(rule);
  const index = current.findIndex((r) => getSshGrantName(r) === name);
  acls = applyAllEdits(acls, ["ssh", index === -1 ? current.length : index], rule);

  for (const test of tests(rule)) {
    acls = setSshTest(new TailscaleAclContext(acls), test);
  }

  return acls;
}

function setRoute({ acls, policy }: TailscaleAclContext, cidr: TailscaleCidr, approvers: TailscaleTags[]) {
  let current = policy.autoApprovers?.routes?.[cidr] || [];
  current.push(...approvers);
  current = Array.from(new Set(current));
  return applyAllEdits(acls, ["autoApprovers", "routes", cidr], current);
}

function setExitNode({ acls, policy }: TailscaleAclContext, tag: TailscaleTags) {
  let current = policy.autoApprovers?.exitNode || [];
  current.push(tag);
  current = Array.from(new Set(current));
  return applyAllEdits(acls, ["autoApprovers", "exitNode"], current);
}

function setTagOwner({ acls, policy }: TailscaleAclContext, owner: TailscaleSelector, tags: TailscaleSelector[]) {
  let current = policy.tagOwners ?? {};
  if (current[owner] === undefined) {
    current[owner] = [];
    acls = applyAllEdits(acls, ["tagOwners", owner], Array.from(new Set(current[owner].sort())));
  }
  for (const tag of tags!) {
    const owners = (current[tag] = current[tag] ?? []);
    owners.push(owner);
    acls = applyAllEdits(acls, ["tagOwners", tag], Array.from(new Set(owners.sort())));
  }
  return acls;
}
function setNodeAttr({ acls, policy }: TailscaleAclContext, value: TailscaleNodeAttr) {
  const current = policy.nodeAttrs ?? [];
  const name = getNodeAttrName(value);
  const index = current.findIndex((tt) => getNodeAttrName(tt) === name);
  const existing = index > -1 ? current[index] : undefined;
  return applyAllEdits(acls, ["nodeAttrs", index === -1 ? current.length : index], {
    target: value.target,
    app: { ...(existing?.app ?? {}), ...(value.app ?? {}) },
    attr: Array.from(new Set([...(existing?.attr ?? []), ...(value.attr ?? [])])),
  });
}

function setGroup({ acls, policy }: TailscaleAclContext, group: TailscaleGroups, members: TailscaleSelector[]) {
  let current = policy.groups ?? {};
  const currentMembers = current[group] || [];
  currentMembers.push(...members);
  return applyAllEdits(acls, ["groups", group], Array.from(new Set(currentMembers)));
}

function setGrant({ acls, policy }: TailscaleAclContext, name: string | undefined, grant: TailscaleGrant, tests: TailscaleTestFactory<TailscaleGrant, TailscaleTest>) {
  name ??= getGrantName(grant);

  const current = policy.grants ?? [];
  const autoGroupInternetDoesNotAllowAppScopes = grant.dst?.includes(autogroups.internet);

  const index = current.findIndex((g) => getGrantName(g) === name);
  if (!autoGroupInternetDoesNotAllowAppScopes) {
    grant.app ??= {};
    grant.app["driscoll.dev/name"] = [name];
  }
  acls = applyAllEdits(acls, ["grants", index === -1 ? current.length : index], grant);

  for (const test of tests(grant)) {
    acls = setGrantTest(new TailscaleAclContext(acls), test);
  }

  return acls;
}

function setService({ acls, policy }: TailscaleAclContext, service: TailscaleTags | TailscaleService, approvers: TailscaleTags[]) {
  let current = policy.autoApprovers?.services?.[service] || [];
  current.push(...approvers);
  current = Array.from(new Set(current));
  return applyAllEdits(acls, ["autoApprovers", "services", service], current);
}

function setGrantTest({ acls, policy }: TailscaleAclContext, test: TailscaleTest) {
  const current = policy.tests ?? [];
  const name = getTestName(test);
  const index = current.findIndex((tt) => getTestName(tt) === name);
  return applyAllEdits(acls, ["tests", index === -1 ? current.length : index], test);
}

function setSshTest({ acls, policy }: TailscaleAclContext, test: TailscaleSshTest) {
  const current = policy.sshTests ?? [];
  const name = getSshTestName(test);
  const index = current.findIndex((tt) => getSshTestName(tt) === name);
  return applyAllEdits(acls, ["sshTests", index === -1 ? current.length : index], test);
}
function getGrantName(grant: TailscaleGrant) {
  if (grant.app?.["driscoll.dev/name"]) {
    return grant.app["driscoll.dev/name"][0];
  }

  const nameParts = [];
  nameParts.push("grant");
  nameParts.push(...grant.src);
  if (grant.dst) {
    nameParts.push("to");
    nameParts.push(...grant.dst);
  }
  if (grant.app) {
    nameParts.push("app");
    nameParts.push(
      ...Object.keys(grant.app)
        .filter((k) => k !== "driscoll.dev/name")
        .map((k) => k.replace("tailscale.com/cap/", "")),
    );
  }
  return nameParts.join("-");
}

function getSshGrantName(rule: TailscaleSshRule) {
  const nameParts = [];
  nameParts.push("ssh");
  nameParts.push(...rule.src);
  if (rule.dst) {
    nameParts.push("to");
    nameParts.push(...rule.dst);
  }
  return nameParts.join("-");
}

function getTestName(rule: TailscaleTest) {
  const nameParts = [];
  nameParts.push("test");
  nameParts.push(...rule.src);
  return nameParts.join("-");
}

function getNodeAttrName(rule: TailscaleNodeAttr) {
  const nameParts = [];
  nameParts.push("nodeAttr");
  nameParts.push(...rule.target);
  return nameParts.join("-");
}

function getSshTestName(rule: TailscaleSshTest) {
  const nameParts = [];
  nameParts.push("ssh");
  nameParts.push(...rule.src);
  return nameParts.join("-");
}

export function applyAllEdits<Key extends keyof PolicyFile>(json: string, path: Extract<Key, string>[], value: PolicyFile[Key]): string;
export function applyAllEdits(json: string, path: (string | number)[], value: any): string;
export function applyAllEdits(json: string, path: (string | number)[], value: any): string {
  return parser.applyEdits(json, parser.modify(json, path, value, { formattingOptions: { insertSpaces: true } }));
}

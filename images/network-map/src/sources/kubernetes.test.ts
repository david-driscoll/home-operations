/**
 * node --test images/network-map/src/sources/kubernetes.test.ts
 *
 * Workloads -> observed Apps keyed like the declared layer, merged with the
 * route-derived App; scaled-to-zero and suspended handling; paging; and the
 * 429 retry. No network: fixtureClient and a scripted client answer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ApiClient, fixtureClient, HttpError } from "../http.ts";
import type { PlainNode } from "../model.ts";
import { collectKubernetes, type K8sHttpRoute, type K8sWorkload, listAll, parseKubernetes, WORKLOAD_LISTS, workloadAppId, workloadAppIds, workloadRunning } from "./kubernetes.ts";

const OPTIONS = { cluster: "equestria", site: "home" };
const NAME = "app.kubernetes.io/name";

const deployment = (name: string, namespace: string, labels: Record<string, string> | undefined, extra: Partial<K8sWorkload["spec"]> = {}, podLabels?: Record<string, string>): K8sWorkload => ({
  kind: "Deployment",
  metadata: { name, namespace, labels },
  spec: { replicas: 1, template: podLabels ? { metadata: { labels: podLabels } } : undefined, ...extra },
});

const parse = (workloads: K8sWorkload[], routes: K8sHttpRoute[] = []) => parseKubernetes({ nodes: [], services: [], routes, gateways: [], workloads }, OPTIONS);
const app = (apps: PlainNode[], key: string) => apps.find(a => a.key === key);

describe("workload -> App", () => {
  it("keys the App by the workload's app.kubernetes.io/name, as the declared layer keys the ks's APP", () => {
    const { apps } = parse([deployment("temporal", "database", { [NAME]: "temporal", "app.kubernetes.io/controller": "temporal" })]);
    assert.deepEqual(app(apps, "temporal")?.props, {
      name: "temporal",
      cluster: "equestria",
      observedVia: ["workload"],
      namespaces: ["database"],
      hostnames: [],
      routes: [],
      workloadKinds: ["Deployment"],
      workloads: ["database/Deployment/temporal"],
      running: true,
    });
  });

  it("falls back to the pod template's label, and for a CronJob to its job template's", () => {
    assert.equal(workloadAppId(deployment("x", "ns", undefined, {}, { [NAME]: "from-pod" })), "from-pod");
    const cron: K8sWorkload = { kind: "CronJob", metadata: { name: "nightly", namespace: "ns" }, spec: { jobTemplate: { spec: { template: { metadata: { labels: { [NAME]: "from-job" } } } } } } };
    assert.equal(workloadAppId(cron), "from-job");
  });

  it("skips a workload with neither label", () => {
    const { apps } = parse([deployment("coredns", "kube-system", { "k8s-app": "kube-dns" }, {}, { "k8s-app": "kube-dns" })]);
    assert.equal(apps.length, 0);
  });

  it("makes one App of a multi-controller release, with every kind and namespace", () => {
    const { apps } = parse([
      deployment("paperless", "home", { [NAME]: "paperless", "app.kubernetes.io/controller": "main" }),
      { kind: "StatefulSet", metadata: { name: "paperless-redis", namespace: "home", labels: { [NAME]: "paperless" } }, spec: { replicas: 1 } },
      { kind: "CronJob", metadata: { name: "paperless-export", namespace: "home", labels: { [NAME]: "paperless" } }, spec: {} },
    ]);
    assert.equal(apps.length, 1);
    assert.deepEqual(app(apps, "paperless")?.props.workloadKinds, ["CronJob", "Deployment", "StatefulSet"]);
    assert.deepEqual(app(apps, "paperless")?.props.namespaces, ["home"]);
  });

  it("merges with the App the HTTPRoute makes for the same key", () => {
    const route: K8sHttpRoute = {
      metadata: { name: "karakeep", namespace: "home", labels: { [NAME]: "karakeep" } },
      spec: { hostnames: ["Karakeep.example.test"], parentRefs: [{ name: "internal", namespace: "network" }] },
    };
    const { apps, servedBy } = parse([deployment("karakeep", "home", { [NAME]: "karakeep" })], [route]);
    assert.equal(apps.length, 1);
    const props = app(apps, "karakeep")?.props;
    assert.deepEqual(props?.observedVia, ["route", "workload"]);
    assert.deepEqual(props?.hostnames, ["karakeep.example.test"]);
    assert.deepEqual(props?.routes, ["home/karakeep"]);
    assert.deepEqual(props?.workloads, ["home/Deployment/karakeep"]);
    assert.equal(props?.running, true);
    assert.deepEqual(servedBy, [{ app: "karakeep", entryPoint: "gateway:network/internal", name: "karakeep.example.test" }]);
  });

  it("leaves running unset on a route-only App", () => {
    const route: K8sHttpRoute = { metadata: { name: "ext", namespace: "network", labels: { [NAME]: "ext" } }, spec: { hostnames: ["ext.example.test"] } };
    assert.equal(app(parse([], [route]).apps, "ext")?.props.running, undefined);
  });
});

describe("Flux owner aliases", () => {
  const HELM = "helm.toolkit.fluxcd.io/name";
  const KS = "kustomize.toolkit.fluxcd.io/name";

  it("also observes a workload under its HelmRelease's name when that differs from its name label", () => {
    const { apps } = parse([
      deployment("crowdsec-lapi", "network", { [NAME]: "crowdsec-lapi", [HELM]: "crowdsec" }),
      { kind: "DaemonSet", metadata: { name: "crowdsec-agent", namespace: "network", labels: { [NAME]: "crowdsec-agent", [HELM]: "crowdsec" } } },
    ]);
    assert.deepEqual(apps.map(a => a.key).sort(), ["crowdsec", "crowdsec-agent", "crowdsec-lapi"]);
    assert.deepEqual(app(apps, "crowdsec")?.props.workloads, ["network/DaemonSet/crowdsec-agent", "network/Deployment/crowdsec-lapi"]);
    assert.deepEqual(app(apps, "crowdsec")?.props.workloadKinds, ["DaemonSet", "Deployment"]);
  });

  it("makes no second App when the helm name equals the name label (app-template)", () => {
    assert.deepEqual(workloadAppIds(deployment("temporal", "database", { [NAME]: "temporal", [HELM]: "temporal" })), ["temporal"]);
  });

  it("observes a workload with only the helm label under it", () => {
    assert.deepEqual(workloadAppIds(deployment("x", "ns", { [HELM]: "release" })), ["release"]);
  });

  it("keys a CNPG Cluster by its HelmRelease, else its Kustomization, else its name", () => {
    const cluster = (labels: Record<string, string>): K8sWorkload => ({ kind: "CnpgCluster", metadata: { name: "pg-cluster", namespace: "database", labels: { [NAME]: "ignored", ...labels } }, spec: { instances: 3 } });
    assert.deepEqual(workloadAppIds(cluster({ [HELM]: "postgres", [KS]: "postgres-ks" })), ["postgres"]);
    assert.deepEqual(workloadAppIds(cluster({ [KS]: "immich" })), ["immich"]);
    assert.deepEqual(workloadAppIds(cluster({})), ["pg-cluster"]);
    const { apps } = parse([cluster({ [HELM]: "postgres" })]);
    assert.deepEqual(app(apps, "postgres")?.props.workloadKinds, ["CnpgCluster"]);
    assert.equal(app(apps, "postgres")?.props.running, true);
  });

  it("reads a hibernated or zero-instance CNPG cluster as not running", () => {
    const meta = { name: "pg", namespace: "database" };
    assert.equal(workloadRunning({ kind: "CnpgCluster", metadata: { ...meta, annotations: { "cnpg.io/hibernation": "on" } }, spec: { instances: 3 } }), false);
    assert.equal(workloadRunning({ kind: "CnpgCluster", metadata: meta, spec: { instances: 0 } }), false);
    assert.equal(workloadRunning({ kind: "CnpgCluster", metadata: meta, spec: {} }), true);
  });
});

describe("scaled to zero and suspended", () => {
  it("still observes a Deployment at replicas 0 (the nightly downscaler), as running: false", () => {
    const { apps } = parse([deployment("readarr-audio", "books", { [NAME]: "readarr-audio" }, { replicas: 0 })]);
    assert.equal(app(apps, "readarr-audio")?.props.running, false);
  });

  it("still observes a suspended CronJob, as running: false", () => {
    const { apps } = parse([{ kind: "CronJob", metadata: { name: "backup", namespace: "ns", labels: { [NAME]: "backup" } }, spec: { suspend: true } }]);
    assert.equal(app(apps, "backup")?.props.running, false);
  });

  it("is running when any one of the app's workloads is", () => {
    const { apps } = parse([deployment("a", "ns", { [NAME]: "mixed" }, { replicas: 0 }), { kind: "StatefulSet", metadata: { name: "b", namespace: "ns", labels: { [NAME]: "mixed" } }, spec: { replicas: 2 } }]);
    assert.equal(app(apps, "mixed")?.props.running, true);
  });

  it("reads replicas absent as one, and a DaemonSet scheduled nowhere as not running", () => {
    assert.equal(workloadRunning({ kind: "StatefulSet", metadata: { name: "s" }, spec: {} }), true);
    assert.equal(workloadRunning({ kind: "DaemonSet", metadata: { name: "d" }, status: { desiredNumberScheduled: 0 } }), false);
    assert.equal(workloadRunning({ kind: "DaemonSet", metadata: { name: "d" }, status: { desiredNumberScheduled: 3 } }), true);
    assert.equal(workloadRunning({ kind: "CronJob", metadata: { name: "c" }, spec: { suspend: false } }), true);
  });
});

const BASE_FIXTURES = {
  "/api/v1/nodes?limit=500": { items: [] },
  "/api/v1/services?limit=500": { items: [] },
  "/apis/gateway.networking.k8s.io/v1/httproutes?limit=500": { items: [] },
  "/apis/gateway.networking.k8s.io/v1/gateways?limit=500": { items: [] },
};

describe("collectKubernetes", () => {
  it("lists every workload kind, one request at a time, and sets each item's kind", async () => {
    const fixtures: Record<string, unknown> = { ...BASE_FIXTURES };
    for (const { path } of WORKLOAD_LISTS) fixtures[`${path}?limit=500`] = { items: [] };
    fixtures["/apis/apps/v1/daemonsets?limit=500"] = { items: [{ metadata: { name: "agent", namespace: "network", labels: { [NAME]: "agent" } }, status: { desiredNumberScheduled: 3 } }] };
    fixtures["/apis/batch/v1/cronjobs?limit=500"] = { items: [{ metadata: { name: "network-map-collector", namespace: "database", labels: { [NAME]: "network-map" } }, spec: { suspend: false } }] };
    const client = fixtureClient(fixtures);
    const result = await collectKubernetes(client, OPTIONS);
    assert.deepEqual(app(result.apps, "agent")?.props.workloadKinds, ["DaemonSet"]);
    assert.deepEqual(app(result.apps, "network-map")?.props.workloadKinds, ["CronJob"]);
    assert.equal(client.calls.length, 4 + WORKLOAD_LISTS.length);
    assert.deepEqual(result.errors, []);
  });

  it("keeps the route-derived Apps when a workload list fails, and reports the source partial", async () => {
    const route = { metadata: { name: "neo4j", namespace: "database", labels: { [NAME]: "neo4j" } }, spec: { hostnames: ["neo4j.example.test"] } };
    const fixtures: Record<string, unknown> = { ...BASE_FIXTURES, "/apis/gateway.networking.k8s.io/v1/httproutes?limit=500": { items: [route] } };
    for (const { path } of WORKLOAD_LISTS) fixtures[`${path}?limit=500`] = new HttpError(`GET ${path}: HTTP 403`, 403);
    const result = await collectKubernetes(fixtureClient(fixtures), OPTIONS);
    assert.ok(app(result.apps, "neo4j"));
    assert.equal(result.errors.length, WORKLOAD_LISTS.length);
    assert.match(result.errors[0], /^Deployment list: .*HTTP 403/);
  });

  it("pages a list with limit and continue", async () => {
    const client = fixtureClient({
      "/apis/apps/v1/deployments?limit=2": { items: [{ n: 1 }, { n: 2 }], metadata: { continue: "tok/en=" } },
      "/apis/apps/v1/deployments?limit=2&continue=tok%2Fen%3D": { items: [{ n: 3 }], metadata: { continue: "" } },
    });
    assert.deepEqual(await listAll(client, "/apis/apps/v1/deployments", 2), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  });
});

/** Answers each path from a queue of outcomes: an HttpError to throw, or a body. */
function scriptedClient(script: Record<string, unknown[]>): ApiClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getJson: async <T>(path: string) => {
      calls.push(path);
      const queue = script[path] ?? [{ items: [] }];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return structuredClone(next) as T;
    },
    getText: async () => "",
  };
}

describe("APF throttling (HTTP 429)", () => {
  const throttled = (retryAfterMs?: number) => new HttpError("GET /apis/gateway.networking.k8s.io/v1/gateways: HTTP 429", 429, retryAfterMs);
  const GATEWAYS = "/apis/gateway.networking.k8s.io/v1/gateways?limit=500";

  it("retries a 429 and then succeeds, honouring Retry-After", async () => {
    const waits: number[] = [];
    const client = scriptedClient({ [GATEWAYS]: [throttled(3_000), throttled(), { items: [{ metadata: { name: "internal", namespace: "network" } }] }] });
    const result = await collectKubernetes(client, { ...OPTIONS, retry: { sleep: async ms => void waits.push(ms) } });
    assert.deepEqual(waits, [3_000, 2_000], "Retry-After first, then the doubled backoff for the second try");
    assert.equal(client.calls.filter(c => c === GATEWAYS).length, 3);
    assert.deepEqual(result.errors, []);
  });

  it("gives up after the configured attempts and fails the source", async () => {
    const waits: number[] = [];
    const client = scriptedClient({ [GATEWAYS]: [throttled()] });
    await assert.rejects(collectKubernetes(client, { ...OPTIONS, retry: { attempts: 3, sleep: async ms => void waits.push(ms) } }), /HTTP 429/);
    assert.deepEqual(waits, [1_000, 2_000]);
    assert.equal(client.calls.filter(c => c === GATEWAYS).length, 3);
  });
});

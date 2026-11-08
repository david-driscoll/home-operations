/**
 * node --test images/network-map/declared/apps.test.ts
 *
 * definition.yaml parsing and variable resolution, for a Kubernetes app (its
 * ks.yaml's substitutions and components) and a Dockge stack (Traefik rules).
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the `${VAR}` strings are Flux and DockgeLxc substitutions under test, not JS templates.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { addDockerStack, addKubernetesApp, composeRouters, kustomizationFor, parseDefinitions, readAppServiceRule, readDockerStacks, readKubernetesApps, traefikHosts, urlHost } from "./apps.ts";
import type { ClusterFile, DockgeHost } from "./machines.ts";
import { DeclaredPlan } from "./plan.ts";

const domains = { root: "example.test", tailnet: "tail0.ts.net" };
const services = await readAppServiceRule();
const equestria: ClusterFile = { key: "equestria", title: "Equestria", type: "kubernetes", location: "home", domainPrefix: "equestria" };
const celestia: ClusterFile = { key: "celestia", title: "Celestia", type: "dockge", location: "home", domainPrefix: "celestia" };
const celestiaHost: DockgeHost = { name: "celestia-dockge", hostName: "celestia", shortName: "celestia" };

const definition = `---
apiVersion: driscoll.dev/v1
kind: ApplicationDefinition
metadata:
  name: \${APP}
spec:
  name: Immich
  category: \${CLUSTER_TITLE}
  url: https://photos.\${ROOT_DOMAIN}
  access_policy:
    groups:
      - family
      - editors
`;

const ks = `---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: &app immich
  namespace: &namespace equestria
spec:
  targetNamespace: *namespace
  path: ./kubernetes/apps/equestria/home/immich
  components:
    - ../../../../components/tailscale
  postBuild:
    substitute:
      APP: *app
      TAILSCALE_HOST: photos
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: immich-db
spec:
  path: ./kubernetes/apps/equestria/home/immich/db
  postBuild:
    substitute:
      APP: immich-db
`;

describe("kustomizationFor", () => {
  it("picks the Kustomization whose path is the definition's directory", () => {
    assert.equal(kustomizationFor(ks, "kubernetes/apps/equestria/home/immich")?.metadata?.name, "immich");
    assert.equal(kustomizationFor(ks, "kubernetes/apps/equestria/home/immich/db")?.metadata?.name, "immich-db");
  });
});

describe("addKubernetesApp", () => {
  it("resolves the ks's substitutions and the cluster's, and derives all three names", () => {
    const plan = new DeclaredPlan();
    addKubernetesApp(plan, { dir: "kubernetes/apps/equestria/home/immich", definitionText: definition, ksText: ks }, equestria, domains, services);
    const { nodes, rels, problems } = plan.finish();
    assert.deepEqual(problems, []);
    const app = nodes.find(n => n.label === "App");
    assert.equal(app?.key, "immich");
    assert.equal(app?.props.category, "Equestria");
    assert.equal(app?.props.namespace, "equestria");
    assert.equal(app?.props.appRoute, "photos.example.test");
    // TAILSCALE_HOST, not APP: the tailnet and NetBird names are `photos`.
    assert.equal(app?.props.tailnetRoute, "photos.tail0.ts.net");
    assert.equal(app?.props.appService, "photos.nb.example.test");
    // Both groups reach it through the access policy; NetBird only knows family.
    assert.deepEqual(
      rels.filter(r => r.type === "REACHES").map(r => [r.from.key, r.to.key, r.props.via]),
      [
        ["authentik:family", "immich", "authentik:access-policy:immich"],
        ["authentik:editors", "immich", "authentik:access-policy:immich"],
      ],
    );
    assert.ok(nodes.some(n => n.label === "Policy" && n.key === "authentik:access-policy:immich"));
  });

  it("gives an app without the tailscale component no tailnet route and no app service", () => {
    const plain = ks.replace("    - ../../../../components/tailscale\n", "    - ../../../../components/volsync\n");
    const plan = new DeclaredPlan();
    addKubernetesApp(plan, { dir: "kubernetes/apps/equestria/home/immich", definitionText: definition, ksText: plain }, equestria, domains, services);
    const app = plan.finish().nodes.find(n => n.label === "App");
    assert.equal(app?.props.tailnetRoute, undefined);
    assert.equal(app?.props.appService, undefined);
  });

  it("keeps an unresolved variable out of the names and records it", () => {
    const plan = new DeclaredPlan();
    addKubernetesApp(plan, { dir: "kubernetes/apps/equestria/home/immich", definitionText: definition, ksText: ks }, equestria, {});
    const app = plan.finish().nodes.find(n => n.label === "App");
    assert.equal(app?.props.appRoute, undefined);
    assert.equal(app?.props.tailnetRoute, undefined);
    assert.deepEqual(app?.props.unresolved, ["ROOT_DOMAIN"]);
  });

  it("reports a definition with no ks.yaml, and one whose name stays unresolved", () => {
    const plan = new DeclaredPlan();
    addKubernetesApp(plan, { dir: "kubernetes/apps/x/y", definitionText: definition }, equestria, domains);
    const { nodes, problems } = plan.finish();
    assert.equal(nodes.filter(n => n.label === "App").length, 0);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /no ks\.yaml/);
    assert.match(problems[1], /unresolved; skipped/);
  });
});

describe("parseDefinitions", () => {
  it("reads every ApplicationDefinition document and nothing else", () => {
    const text = `${definition.replace("${APP}", "a")}---\nkind: ConfigMap\nmetadata: {name: x}\n---\nkind: ApplicationDefinition\nmetadata: {name: b}\nspec: {name: B, category: c}\n`;
    assert.deepEqual(
      parseDefinitions(text).map(d => d.metadata.name),
      ["a", "b"],
    );
  });
});

describe("urlHost", () => {
  it("is the lowercased host, or undefined for no URL or one still holding a variable", () => {
    assert.equal(urlHost("https://Git.example.test/x"), "git.example.test");
    assert.equal(urlHost("https://${APP}.example.test"), undefined);
    assert.equal(urlHost(undefined), undefined);
  });
});

const compose = `services:
  zot:
    labels:
      traefik.enable: true
      traefik.http.routers.\${APP}.rule: Host(\`registry.\${searchDomain}\`)
      traefik.http.routers.\${APP}-tailscale.rule: Host(\`\${APP}-\${host}.\${tailscaleDomain}\`)
      traefik.tcp.routers.sftp.rule: HostSNI(\`*\`)
  other:
    labels:
      - "traefik.http.routers.dns.rule=Host(\`\${CLUSTER_KEY}.dns.\${ROOT_DOMAIN}\`) && Path(\`/dns-query\`)"
`;

describe("traefikHosts / composeRouters", () => {
  it("reads Host() matchers from map and list labels, skipping TCP routers and wildcards", () => {
    assert.deepEqual(traefikHosts("Host(`a.x`) || Host(`B.x`, `c.x`) && HostSNI(`*`)"), ["a.x", "b.x", "c.x"]);
    const routers = composeRouters(compose.replaceAll("${APP}", "zot").replaceAll("${searchDomain}", "example.test"));
    assert.deepEqual([...routers.keys()].sort(), ["dns", "zot", "zot-tailscale"]);
    assert.deepEqual(routers.get("zot"), ["registry.example.test"]);
  });
});

describe("addDockerStack", () => {
  it("names a stack by its routers, substituted as DockgeLxc does, and RUNS it on the host's LXC", () => {
    const plan = new DeclaredPlan();
    plan.node("Machine", "repo:celestia-dockge", { name: "celestia-dockge" });
    addDockerStack(
      plan,
      {
        stack: "zot",
        host: celestiaHost,
        cluster: celestia,
        composeText: compose,
        definitionText: "kind: ApplicationDefinition\nmetadata: {name: zot}\nspec: {name: Zot, category: x, access_policy: {groups: [admins]}}\n",
      },
      domains,
    );
    const { nodes, rels, problems } = plan.finish();
    assert.deepEqual(problems, []);
    const app = nodes.find(n => n.label === "App");
    assert.equal(app?.key, "zot");
    assert.equal(app?.props.cluster, "celestia");
    assert.deepEqual(app?.props.appRoutes, ["registry.example.test", "celestia.dns.example.test"]);
    assert.deepEqual(app?.props.tailnetRoutes, ["zot-celestia.tail0.ts.net"]);
    assert.ok(rels.some(r => r.type === "RUNS" && r.from.key === "repo:celestia-dockge" && r.to.key === "zot"));
    assert.ok(rels.some(r => r.type === "REACHES" && r.from.key === "authentik:admins" && r.to.key === "zot"));
  });

  it("uses the Proxmox host's shortName for ${host}", () => {
    const plan = new DeclaredPlan();
    plan.node("Machine", "repo:alpha-site-dockge", {});
    addDockerStack(plan, { stack: "zot", host: { name: "alpha-site-dockge", hostName: "alpha-site", shortName: "as" }, cluster: { ...celestia, key: "alpha-site", domainPrefix: "as" }, composeText: compose }, domains);
    assert.deepEqual(plan.finish().nodes.find(n => n.label === "App")?.props.tailnetRoutes, ["zot-as.tail0.ts.net"]);
  });
});

describe("readKubernetesApps", () => {
  it("reports a checkout with no kubernetes/apps instead of throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "nm-declared-"));
    try {
      const problems: string[] = [];
      assert.deepEqual(await readKubernetesApps(root, problems), []);
      assert.deepEqual(problems, ["kubernetes/apps: no definition.yaml found; no Kubernetes apps declared"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("readDockerStacks", () => {
  it("takes the host's stacks and _common's, drops ignored ones, and prefers the host's files", async () => {
    const root = await mkdtemp(join(tmpdir(), "nm-declared-"));
    try {
      const put = async (path: string, text = "x") => {
        await mkdir(join(root, path, ".."), { recursive: true });
        await writeFile(join(root, path), text);
      };
      await put("docker/_common/traefik/compose.yaml", "common");
      await put("docker/_common/llama/compose.yaml");
      await put("docker/_common/llama/.ignore");
      await put("docker/_common/garage/compose.yaml");
      await put("docker/celestia/garage/.ignore");
      await put("docker/celestia/traefik/compose.yaml", "own");
      await put("docker/celestia/zot/compose.yaml");
      await put("docker/celestia/.keep");
      const stacks = await readDockerStacks(root, celestiaHost, celestia);
      assert.deepEqual(
        stacks.map(s => s.stack),
        ["traefik", "zot"],
      );
      assert.equal(stacks.find(s => s.stack === "traefik")?.composeText, "own");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

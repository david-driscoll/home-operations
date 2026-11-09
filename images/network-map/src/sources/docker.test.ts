/**
 * node --test images/network-map/src/sources/docker.test.ts
 *
 * Containers -> Apps: one per compose project, routed or not, merged with
 * the Traefik-derived one and across hosts. No network: fixtureClient answers.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixtureClient } from "../http.ts";
import { collectDocker, type DockerContainer, parseDocker } from "./docker.ts";

const LUNA = { name: "luna", host: "dockge-luna.example.test", site: "home" };
const CELESTIA = { name: "celestia", host: "dockge-celestia.example.test", site: "home" };
const project = (p: string) => ({ "com.docker.compose.project": p });
const container = (id: string, name: string, state: string, labels: Record<string, string>): DockerContainer => ({ Id: id, Names: [`/${name}`], State: state, Labels: labels });

describe("parseDocker apps", () => {
  const containers = [
    container("a1", "autoheal", "running", project("autoheal")),
    container("b1", "bao-standby", "exited", project("bao-standby")),
    container("w1", "wyoming-piper", "exited", project("wyoming")),
    container("w2", "wyoming-whisper", "running", project("wyoming")),
    container("t1", "backrest", "running", { ...project("backrest"), "traefik.http.routers.backrest.rule": "Host(`backrest.example.test`)" }),
    container("t2", "backrest-sidecar", "running", project("backrest")),
    container("l1", "loose", "running", {}),
    container("l2", "loose-routed", "running", { "traefik.http.routers.x.rule": "Host(`x.example.test`)" }),
  ];
  const result = parseDocker(LUNA, {}, [], containers);
  const app = (key: string) => result.apps.find(a => a.key === key);

  it("observes every compose project, routed or not, keyed by the project", () => {
    assert.deepEqual(result.apps.map(a => a.key).sort(), ["autoheal", "backrest", "bao-standby", "loose-routed", "wyoming"]);
    assert.deepEqual(app("autoheal")?.props, { name: "autoheal", cluster: "luna", clusters: ["luna"], observedVia: ["docker"], containers: ["luna/autoheal"], running: true });
  });

  it("counts a stopped project as observed, with running: false, and running when any container runs", () => {
    assert.equal(app("bao-standby")?.props.running, false);
    assert.equal(app("wyoming")?.props.running, true);
    assert.deepEqual(app("wyoming")?.props.containers, ["luna/wyoming-piper", "luna/wyoming-whisper"]);
  });

  it("makes the routed project one App with all its containers, served by the host's Traefik", () => {
    assert.deepEqual(app("backrest")?.props.containers, ["luna/backrest", "luna/backrest-sidecar"]);
    assert.ok(result.servedBy.some(s => s.app === "backrest" && s.entryPoint === "traefik:luna"));
    assert.ok(result.entryPoints.some(e => e.key === "traefik:luna"));
    assert.ok(result.runs.some(r => r.app === "autoheal" && r.machine === "docker:host:luna"));
  });

  it("draws no Traefik entry point for a host where nothing is routed", () => {
    assert.deepEqual(parseDocker(LUNA, {}, [], [container("a1", "autoheal", "running", project("autoheal"))]).entryPoints, []);
  });
});

describe("collectDocker across hosts", () => {
  it("merges a _common stack on two hosts into one App", async () => {
    const host = (containers: DockerContainer[]) => fixtureClient({ "/info": {}, "/networks": [], "/containers/json?all=true": containers });
    const result = await collectDocker([
      { target: LUNA, client: host([container("p1", "docker-prune", "exited", project("docker-prune"))]) },
      { target: CELESTIA, client: host([container("p2", "docker-prune", "running", project("docker-prune"))]) },
    ]);
    assert.equal(result.apps.length, 1);
    assert.deepEqual(result.apps[0].props, {
      name: "docker-prune",
      cluster: "luna",
      clusters: ["celestia", "luna"],
      observedVia: ["docker"],
      containers: ["celestia/docker-prune", "luna/docker-prune"],
      running: true,
    });
  });
});

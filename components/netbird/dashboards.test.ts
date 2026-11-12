/**
 * node --test components/netbird/dashboards.test.ts
 *
 * NetBird's Grafana dashboards (kubernetes/apps/observability/grafana/dashboards/netbird.yaml)
 * must come from the release the servers run, or the panels query metric
 * names the servers no longer export. All three are URLs at the release tag,
 * and a regex customManager in .github/renovate.json5 reports each URL as the
 * netbirdio/netbird-server image itself, so Renovate rewrites them on the
 * branch that bumps the image (the NetBird group). These tests fail if that
 * link breaks: a URL off the server's release, or a URL the manager misses.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const repo = new URL("../../", import.meta.url);
const dashboardsYaml = readFileSync(new URL("kubernetes/apps/observability/grafana/dashboards/netbird.yaml", repo), "utf8");
const SERVER_IMAGE = "netbirdio/netbird-server";
const BOARDS = ["management", "signal", "relay"];

/** `0.82.1`, from the netbird-server image in compose.yaml. A regex, not a YAML parse: CI runs this without `npm ci`. */
function serverRelease(): string {
  const compose = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");
  const images = [...compose.matchAll(/^\s*image: netbirdio\/netbird-server:(\d+\.\d+\.\d+)(@\S+)?\s*$/gm)];
  assert.equal(images.length, 1, "expected exactly one netbirdio/netbird-server image in compose.yaml");
  return images[0][1];
}

/** The `url:` of each GrafanaDashboard in netbird.yaml, in file order. */
function dashboardUrls(): string[] {
  return [...dashboardsYaml.matchAll(/^\s*url: (\S+)\s*$/gm)].map(m => m[1]);
}

/**
 * The customManager whose description starts "NetBird dashboards". Its strings
 * are double-quoted JSON5, which JSON.parse reads as-is (json5 itself is not
 * installed in CI).
 */
function dashboardsManager(): { matchString: string; depName: string; datasource: string } {
  const renovate = readFileSync(new URL(".github/renovate.json5", repo), "utf8");
  const block = renovate.match(/description: "NetBird dashboards[^"]*",([\s\S]*?)\n {4}\},/);
  assert.ok(block, 'no customManager described "NetBird dashboards ..." in .github/renovate.json5');
  const field = (name: string): string => {
    const m = block[1].match(new RegExp(`${name}: (?:\\[\\s*)?("(?:[^"\\\\]|\\\\.)*")`));
    assert.ok(m, `the NetBird dashboards manager has no ${name}`);
    return JSON.parse(m[1]);
  };
  return { matchString: field("matchStrings"), depName: field("depNameTemplate"), datasource: field("datasourceTemplate") };
}

describe("NetBird dashboards", () => {
  const release = serverRelease();

  it("pins Management, Signal and Relay to the server's release", () => {
    assert.deepEqual(
      dashboardUrls(),
      BOARDS.map(b => `https://raw.githubusercontent.com/netbirdio/netbird/v${release}/infrastructure_files/observability/grafana/dashboards/${b}.json`),
    );
  });

  it("fills Management's DS_EXPRESSION input with Grafana's expression datasource", () => {
    // Upstream's "Percentage of Recreated channels" names its expression
    // datasource `${DS_EXPRESSION}`, an input nothing fills. The operator's
    // `datasources` mapping replaces `${inputName}` with `datasourceName` in
    // the fetched JSON (controllers/content/resolver.go), so the uid becomes
    // `__expr__`.
    const management = dashboardsYaml.match(/name: netbird-management\n[\s\S]*?(?=\n---|$)/);
    assert.ok(management, "no netbird-management GrafanaDashboard");
    assert.match(management[0], /- datasourceName: __expr__\n\s+inputName: DS_EXPRESSION\n/);
  });

  it("has Renovate bump every dashboard URL as the netbird-server image", () => {
    const manager = dashboardsManager();
    // Same depName and datasource as the image in compose.yaml, so Renovate
    // puts the URLs on the image's branch, inside the NetBird group.
    assert.equal(manager.depName, SERVER_IMAGE);
    assert.equal(manager.datasource, "docker");
    // Renovate runs matchStrings with the 'g' flag and not 'm'.
    const found = [...dashboardsYaml.matchAll(new RegExp(manager.matchString, "g"))].map(m => m.groups?.currentValue);
    assert.deepEqual(
      found,
      BOARDS.map(() => release),
    );
  });
});

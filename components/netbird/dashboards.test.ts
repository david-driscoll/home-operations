/**
 * node --test components/netbird/dashboards.test.ts
 *
 * NetBird's Grafana dashboards (kubernetes/apps/observability/grafana/dashboards/netbird.yaml)
 * must come from the release the servers run, or the panels query metric
 * names the servers no longer export. Renovate bumps the images in
 * compose.yaml; this fails until the dashboards follow: refresh the vendored
 * Management JSON (upstream's file at the new tag, with the one uid patch
 * below) and the Signal/Relay URLs.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const repo = new URL("../../", import.meta.url);
const dashboards = new URL("kubernetes/apps/observability/grafana/dashboards/", repo);

/** `0.82.1`, from the netbird-server image in compose.yaml. A regex, not a YAML parse: CI runs this without `npm ci`. */
function serverRelease(): string {
  const compose = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");
  const images = [...compose.matchAll(/^\s*image: netbirdio\/netbird-server:(\d+\.\d+\.\d+)(@\S+)?\s*$/gm)];
  assert.equal(images.length, 1, "expected exactly one netbirdio/netbird-server image in compose.yaml");
  return images[0][1];
}

describe("NetBird dashboards", () => {
  const release = serverRelease();
  const vendored = new URL(`netbird/management-v${release}.json`, dashboards);

  it("vendors Management at the server's release", () => {
    assert.ok(existsSync(vendored), `missing ${vendored.pathname}: fetch upstream's management.json at v${release} and re-apply the __expr__ patch`);
    const kustomization = readFileSync(new URL("kustomization.yaml", dashboards), "utf8");
    assert.match(kustomization, new RegExp(`management\\.json=\\./netbird/management-v${release.replaceAll(".", "\\.")}\\.json`));
  });

  it("keeps the expression datasource patch, so no panel depends on an unfilled input", () => {
    const json = readFileSync(vendored, "utf8");
    assert.doesNotMatch(json, /\$\{DS_EXPRESSION\}/);
    const expressions = [...json.matchAll(/"type": "__expr__",\s*"uid": "([^"]+)"/g)].map(m => m[1]);
    assert.ok(expressions.length > 0, "the expression target is gone: check whether the patch is still needed");
    assert.ok(
      expressions.every(uid => uid === "__expr__"),
      `${expressions}`,
    );
  });

  it("pins the Signal and Relay URLs to the server's release", () => {
    const urls = [...readFileSync(new URL("netbird.yaml", dashboards), "utf8").matchAll(/url: (\S+)/g)].map(m => m[1]);
    assert.equal(urls.length, 2, `${urls}`);
    for (const url of urls) assert.match(url, new RegExp(`/netbirdio/netbird/v${release.replaceAll(".", "\\.")}/`));
  });
});

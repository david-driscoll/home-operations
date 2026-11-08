/**
 * node --test images/network-map/src/config.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig, proxmoxTokenVar } from "./config.ts";

const base = { NEO4J_URI: "bolt://neo4j:7687", NEO4J_USERNAME: "neo4j", NEO4J_PASSWORD: "pw" };

describe("loadConfig", () => {
  it("builds every source block from a full env", () => {
    const config = loadConfig({
      ...base,
      UNIFI_URL: "https://unifi.example.test",
      UNIFI_API_KEY: "k",
      TAILSCALE_CLIENT_ID: "id",
      TAILSCALE_CLIENT_SECRET: "s",
      NETBIRD_URL: "https://netbird.example.test",
      NETBIRD_TOKEN: "t",
      KUBERNETES_SERVICE_HOST: "10.43.0.1",
      KUBERNETES_SERVICE_PORT: "443",
      PROXMOX_TARGETS: JSON.stringify([
        { name: "luna", url: "https://luna.tailnet.example:8006", site: "home", token: "main" },
        { name: "alpha-site", url: "https://alpha-site.tailnet.example:8006", site: "home", token: "alpha-site" },
      ]),
      PROXMOX_TOKEN_MAIN: "root@pam!collector=abc",
      PROXMOX_TOKEN_ALPHA_SITE: "root@pam!as=def",
      DOCKER_TARGETS: JSON.stringify([{ name: "luna", host: "dockge-luna.example.test", site: "home" }]),
    });
    assert.deepEqual(config.problems, {});
    assert.equal(config.kubernetes?.url, "https://10.43.0.1:443");
    assert.deepEqual(
      config.proxmox?.targets.map(t => t.authorization),
      ["PVEAPIToken=root@pam!collector=abc", "PVEAPIToken=root@pam!as=def"],
    );
    assert.equal(config.docker?.targets[0].url, "http://dockge-luna.example.test:2375");
    assert.equal(config.retentionDays, 30);
    assert.equal(config.tailscale?.tailnet, "-");
  });

  it("names what is missing instead of dropping the source", () => {
    const config = loadConfig({ ...base, PROXMOX_TARGETS: "[{" });
    assert.equal(config.unifi, undefined);
    assert.match(config.problems.unifi ?? "", /UNIFI_URL is not set/);
    assert.match(config.problems.proxmox ?? "", /JSON/);
    assert.match(config.problems.kubernetes ?? "", /KUBERNETES_SERVICE_HOST/);
  });

  it("refuses to start without Neo4j", () => {
    assert.throws(() => loadConfig({}), /NEO4J_URI/);
  });

  it("maps a token name to its variable", () => {
    assert.equal(proxmoxTokenVar("alpha-site"), "PROXMOX_TOKEN_ALPHA_SITE");
  });
});

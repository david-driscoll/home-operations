/**
 * node --test images/network-map/src/declares.test.ts
 *
 * The DECLARES join: which declared node links to which observed one, by
 * which key, and that both writers run the same idempotent statements.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KEY_PROPERTY } from "./cypher.ts";
import { DECLARED_LAYER, DECLARED_SOURCE, linkRules, linkStatements, OBSERVED_LAYER, SAME_KEY_LABELS } from "./declares.ts";

describe("linkStatements", () => {
  const statements = linkStatements();

  it("starts by dropping every DECLARES edge, so a join whose rule stopped holding goes", () => {
    assert.equal(statements[0].text, "MATCH ()-[r:DECLARES]->() DELETE r");
  });

  it("MERGEs (never CREATEs) every edge, from declared to observed, so a rerun changes nothing", () => {
    for (const s of statements.slice(1)) {
      assert.match(s.text, /MATCH \(d:\w+ \{layer: \$declared/);
      assert.match(s.text, /MATCH \(o:\w+ \{layer: \$observed/);
      assert.match(s.text, /MERGE \(d\)-\[r:DECLARES\]->\(o\)/);
      assert.doesNotMatch(s.text, /CREATE|DELETE/);
      assert.deepEqual(s.params, { declared: DECLARED_LAYER, observed: OBSERVED_LAYER, source: DECLARED_SOURCE });
    }
    assert.equal(DECLARED_LAYER, "declared");
    assert.equal(OBSERVED_LAYER, "observed");
  });
});

describe("linkRules", () => {
  const rules = linkRules();

  it("joins App, Group, Route and Network on the key both layers share", () => {
    for (const { label, key } of SAME_KEY_LABELS) {
      assert.equal(KEY_PROPERTY[label], key, `${label}'s key is the collector's`);
      assert.ok(
        rules.some(r => r.by === "key" && r.text.includes(`MATCH (o:${label} {layer: $observed, ${key}: d.${key}})`)),
        label,
      );
    }
  });

  it("joins UniFi networks by name and NetBird policies by the stack's policy name", () => {
    assert.ok(rules.some(r => r.text.includes("(d:Network {layer: $declared, system: 'unifi'})") && r.text.includes("o.name = d.name")));
    assert.ok(rules.some(r => r.text.includes("(d:Policy {layer: $declared, system: 'netbird'})") && r.text.includes("o.name STARTS WITH d.policyName + '/'")));
  });

  it("joins machines by MAC, then IP, then hostname, each weaker tier only for machines still unlinked", () => {
    const tiers = rules.filter(r => r.text.includes("(d:Machine")).map(r => r.by);
    assert.deepEqual(tiers, ["mac", "ip", "hostname"]);
    const [mac, ip, hostname] = rules.filter(r => r.text.includes("(d:Machine"));
    assert.doesNotMatch(mac.text, /NOT EXISTS/);
    assert.match(ip.text, /NOT EXISTS \{ MATCH \(d\)-\[:DECLARES\]->\(\) \}/);
    assert.match(hostname.text, /NOT EXISTS \{ MATCH \(d\)-\[:DECLARES\]->\(\) \}/);
    assert.match(mac.text, /o\.mac IN d\.macs/);
    assert.match(mac.text, /i\.mac IN d\.macs/);
    assert.match(ip.text, /ip IN d\.ips/);
    assert.match(hostname.text, /d\.hostname IN coalesce\(o\.hostnames, \[\]\)/);
  });

  it("records which rule made each edge", () => {
    for (const r of rules) assert.match(r.text, new RegExp(`r\\.by = '${r.by}'`));
  });
});

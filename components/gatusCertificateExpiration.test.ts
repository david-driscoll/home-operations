/**
 * npx tsx --test components/gatusCertificateExpiration.test.ts
 *
 * addUptimeGatus runs every endpoint it writes through withCertificateExpiration,
 * so these cases are the whole estate's certificate coverage: which endpoints
 * gain the check, and which must come through untouched.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CERTIFICATE_EXPIRATION_CONDITION, withCertificateExpiration } from "./gatusCertificateExpiration.ts";

describe("withCertificateExpiration", () => {
  it("appends the certificate check to an https endpoint", () => {
    const endpoint = withCertificateExpiration({ url: "https://app.example.com", conditions: ["[STATUS] == 200"] });
    assert.deepEqual(endpoint.conditions, ["[STATUS] == 200", CERTIFICATE_EXPIRATION_CONDITION]);
  });

  it("matches the scheme case-insensitively", () => {
    const endpoint = withCertificateExpiration({ url: "HTTPS://app.example.com", conditions: ["[STATUS] == 200"] });
    assert.deepEqual(endpoint.conditions, ["[STATUS] == 200", CERTIFICATE_EXPIRATION_CONDITION]);
  });

  it("does not mutate the endpoint it was given", () => {
    const original = { url: "https://app.example.com", conditions: ["[STATUS] == 200"] as [string, ...string[]] };
    withCertificateExpiration(original);
    assert.deepEqual(original.conditions, ["[STATUS] == 200"]);
  });

  it("keeps an endpoint's own threshold instead of adding a second one", () => {
    const conditions: [string, ...string[]] = ["[STATUS] == 200", "[CERTIFICATE_EXPIRATION] > 72h"];
    assert.deepEqual(withCertificateExpiration({ url: "https://app.example.com", conditions }).conditions, conditions);
  });

  it("leaves non-https endpoints alone", () => {
    for (const url of ["http://app.example.com", "10.10.0.1", "icmp://10.10.0.1", "tcp://10.10.0.1:22", "ssh://10.10.0.1:22"]) {
      assert.deepEqual(withCertificateExpiration({ url, conditions: ["[CONNECTED] == true"] }).conditions, ["[CONNECTED] == true"], url);
    }
  });

  it("leaves an endpoint with no conditions alone", () => {
    const empty = { url: "https://app.example.com", conditions: [] as unknown as [string, ...string[]] };
    assert.deepEqual(withCertificateExpiration(empty).conditions, []);
    assert.equal(withCertificateExpiration({ url: "https://app.example.com" }).conditions, undefined);
  });
});

/**
 * npx tsx --test components/kubernetes-secret.test.ts
 *
 * Only the decode step — the REST call needs a cluster. The behaviour worth pinning is that a
 * Secret which exists but has not been issued yet (cert-manager creates it empty-handed while a
 * DNS-01 order is pending) reads as "no certificate" rather than as two empty strings, because
 * an empty key pushed to `pvenode cert set` would fail on the host.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeTlsSecret } from "./kubernetes-secret.ts";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("decodeTlsSecret", () => {
  it("decodes tls.crt and tls.key", () => {
    // Not PEM on purpose: decoding is just base64, and a PEM private-key header in a fixture trips
    // the detect-private-key pre-commit check.
    const secret = { data: { "tls.crt": b64("certificate line 1\nline 2\n"), "tls.key": b64("key line 1\nline 2\n") } };
    assert.deepEqual(decodeTlsSecret(secret), { certificate: "certificate line 1\nline 2\n", key: "key line 1\nline 2\n" });
  });

  it("reads a Secret with no data as not issued", () => {
    assert.equal(decodeTlsSecret({}), undefined);
  });

  it("reads a Secret missing either half as not issued", () => {
    assert.equal(decodeTlsSecret({ data: { "tls.crt": b64("only a cert") } }), undefined);
    assert.equal(decodeTlsSecret({ data: { "tls.key": b64("only a key") } }), undefined);
  });

  it("reads empty values as not issued", () => {
    assert.equal(decodeTlsSecret({ data: { "tls.crt": "", "tls.key": "" } }), undefined);
  });
});

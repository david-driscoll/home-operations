/**
 * node --test components/patchmon.test.ts
 *
 * The enrollment script is a TypeScript template rendering POSIX sh, so the
 * failure worth catching is an escape that renders wrong: a `\${` that
 * interpolated, a `\\n` that lost its backslash. `sh -n` parses without
 * executing, and the string checks pin the lines that would still parse but
 * do the wrong thing.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { patchmonEnrollScript, patchmonSkipScript } from "./patchmon.ts";

const args = { url: "https://patchmon.example.ts.net/", friendlyName: "alpha-site", tokenKey: "patchmon_ae_0123", tokenSecret: "s3cr'et" };

function parses(script: string) {
  execFileSync("sh", ["-n"], { input: script });
}

describe("patchmonEnrollScript", () => {
  it("renders a script sh can parse", () => {
    parses(patchmonEnrollScript(args));
  });

  it("drops a trailing slash from the URL so it compares equal to the agent's config", () => {
    assert.match(patchmonEnrollScript(args), /^PATCHMON_URL='https:\/\/patchmon\.example\.ts\.net'$/m);
  });

  it("quotes a secret containing a single quote", () => {
    const script = patchmonEnrollScript(args);
    assert.match(script, /^AUTO_ENROLLMENT_SECRET='s3cr'\\''et'$/m);
    const value = execFileSync("sh", ["-c", `${script.split("\n").find(l => l.startsWith("AUTO_ENROLLMENT_SECRET="))}; printf %s "$AUTO_ENROLLMENT_SECRET"`]).toString();
    assert.equal(value, "s3cr'et");
  });

  it("keeps shell parameter expansions that the template must not interpolate", () => {
    assert.match(patchmonEnrollScript(args), /configured_server=\$\{configured_server%\/\}/);
  });

  it("never puts the enrollment secret in a URL or on curl's command line", () => {
    const script = patchmonEnrollScript(args);
    assert.doesNotMatch(script, /token_secret=/);
    for (const line of script.split("\n").filter(l => l.includes("curl "))) {
      assert.doesNotMatch(line, /AUTO_ENROLLMENT_SECRET|api_key/);
    }
  });

  it("refuses a friendly name that would need JSON escaping", () => {
    assert.throws(() => patchmonEnrollScript({ ...args, friendlyName: 'a"b' }), /friendly name/);
  });
});

describe("patchmonSkipScript", () => {
  it("runs and says why nothing happened", () => {
    const out = execFileSync("sh", ["-s"], { input: patchmonSkipScript("celestia") }).toString();
    assert.match(out, /no enrollment token.*celestia/);
  });
});

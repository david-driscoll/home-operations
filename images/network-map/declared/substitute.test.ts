/**
 * node --test images/network-map/declared/substitute.test.ts
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the `${VAR}` strings are what is being substituted, not JS templates.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { substitute } from "./substitute.ts";

describe("substitute", () => {
  it("replaces known variables and reports the unknown ones, left in place", () => {
    const out = substitute("https://${APP}.${ROOT_DOMAIN}/${SECRET}", { APP: "jellyfin", ROOT_DOMAIN: "example.test" });
    assert.equal(out.text, "https://jellyfin.example.test/${SECRET}");
    assert.deepEqual(out.unresolved, ["SECRET"]);
  });

  it("applies envsubst defaults, nested", () => {
    assert.equal(substitute("${TAILSCALE_HOST:=${APP}}", { APP: "immich" }).text, "immich");
    assert.equal(substitute("${TAILSCALE_HOST:=${APP}}", { APP: "immich", TAILSCALE_HOST: "photos" }).text, "photos");
    assert.equal(substitute("${X:-fallback}", {}).text, "fallback");
    // `:=` treats empty as unset; `=` does not.
    assert.equal(substitute("${X:=d}", { X: "" }).text, "d");
    assert.equal(substitute("${X=d}", { X: "" }).text, "");
  });

  it("keeps an unresolved inner variable inside a resolved default", () => {
    const out = substitute("${HOST:=${APP}}.${TAILSCALE_DOMAIN}", {});
    assert.equal(out.text, "${APP}.${TAILSCALE_DOMAIN}");
    assert.deepEqual(out.unresolved, ["APP", "TAILSCALE_DOMAIN"]);
  });

  it("leaves text without variables alone", () => {
    assert.deepEqual(substitute("plain: $HOME and $(cmd)", {}), { text: "plain: $HOME and $(cmd)", unresolved: [] });
  });
});

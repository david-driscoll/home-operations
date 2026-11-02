/**
 * node --test dynamic/jellyfin/JellyfinConfiguration.test.ts
 *
 * The read-modify-write merge. Every Jellyfin configuration POST replaces the
 * whole document, so anything this resource does not own -- the SSO plugin's
 * saved account links, someone else's JavaScript Injector script -- survives
 * only because the merge carries it through.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as pulumi from "@pulumi/pulumi";
import { applyOwned, containsUnknown, jsonEqual, mergeOwned, upsertList } from "./JellyfinConfiguration.ts";

describe("mergeOwned", () => {
  it("keeps the plugin's saved links when owning the rest of the provider", () => {
    const live = {
      EnforceSsoOnly: true,
      OidConfigs: {
        authentik: {
          OidClientId: "old",
          CanonicalLinks: { "sub-1": "guid-1" },
          UsernameMappings: { nat: "Nat" },
        },
        other: { OidClientId: "untouched" },
      },
    };
    const merged = mergeOwned(live, {
      EnforceSsoOnly: false,
      OidConfigs: { authentik: { OidClientId: "new", AdminRoles: ["admins"] } },
    });
    assert.deepEqual(merged, {
      EnforceSsoOnly: false,
      OidConfigs: {
        authentik: {
          OidClientId: "new",
          AdminRoles: ["admins"],
          CanonicalLinks: { "sub-1": "guid-1" },
          UsernameMappings: { nat: "Nat" },
        },
        other: { OidClientId: "untouched" },
      },
    });
  });

  it("creates the provider when the plugin has none", () => {
    assert.deepEqual(mergeOwned({ OidConfigs: {} }, { OidConfigs: { authentik: { Enabled: true } } }), {
      OidConfigs: { authentik: { Enabled: true } },
    });
  });

  it("replaces arrays instead of merging them", () => {
    assert.deepEqual(mergeOwned({ AdminRoles: ["a", "b"] }, { AdminRoles: ["admins"] }), { AdminRoles: ["admins"] });
  });

  it("does not mutate the live document", () => {
    const live = { OidConfigs: { authentik: { Enabled: false } } };
    mergeOwned(live, { OidConfigs: { authentik: { Enabled: true } } });
    assert.equal(live.OidConfigs.authentik.Enabled, false);
  });
});

describe("upsertList", () => {
  const ours = { Name: "SSO return (managed by Pulumi)", Script: "v2", Enabled: true };

  it("adds the entry and leaves other scripts alone", () => {
    const live = { CustomJavaScripts: [{ Name: "KefinTweaks", Script: "x", Enabled: false }] };
    assert.deepEqual(upsertList(live, { property: "CustomJavaScripts", key: "Name", items: [ours] }).CustomJavaScripts, [{ Name: "KefinTweaks", Script: "x", Enabled: false }, ours]);
  });

  it("updates the entry in place, keeping its position and unowned fields", () => {
    const live = {
      CustomJavaScripts: [
        { Name: "SSO return (managed by Pulumi)", Script: "v1", Enabled: false, Module: false },
        { Name: "KefinTweaks", Script: "x" },
      ],
    };
    assert.deepEqual(upsertList(live, { property: "CustomJavaScripts", key: "Name", items: [ours] }).CustomJavaScripts, [
      { Name: "SSO return (managed by Pulumi)", Script: "v2", Enabled: true, Module: false },
      { Name: "KefinTweaks", Script: "x" },
    ]);
  });

  it("creates the list when it is missing", () => {
    assert.deepEqual(upsertList({}, { property: "CustomJavaScripts", key: "Name", items: [ours] }), { CustomJavaScripts: [ours] });
  });
});

describe("applyOwned + jsonEqual", () => {
  it("is a no-op once the live document already matches", () => {
    const live = { LoginDisclaimer: "<form></form>", CustomCss: "a{}", SplashscreenEnabled: false };
    assert.equal(jsonEqual(applyOwned(live, { merge: { LoginDisclaimer: "<form></form>", CustomCss: "a{}" } }), live), true);
  });

  it("sees a field Jellyfin omits (a null it never serialised) as a change", () => {
    const live = { CustomCss: "", SplashscreenEnabled: false };
    assert.equal(jsonEqual(applyOwned(live, { merge: { LoginDisclaimer: "<form></form>" } }), live), false);
  });

  it("sees a settings-page edit to an owned field as drift", () => {
    const live = { OidConfigs: { authentik: { AdminRoles: ["everyone"], CanonicalLinks: {} } } };
    const desired = applyOwned(live, { merge: { OidConfigs: { authentik: { AdminRoles: ["admins"] } } } });
    assert.equal(jsonEqual(desired, live), false);
  });

  it("ignores key order", () => {
    assert.equal(jsonEqual({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }), true);
  });
});

describe("containsUnknown", () => {
  it("finds a not-yet-created client secret nested in the provider", () => {
    assert.equal(containsUnknown({ OidConfigs: { authentik: { OidSecret: pulumi.runtime.unknownValue } } }), true);
  });

  it("is false for fully known inputs", () => {
    assert.equal(containsUnknown({ OidConfigs: { authentik: { OidSecret: "s", Roles: [] } } }), false);
  });
});

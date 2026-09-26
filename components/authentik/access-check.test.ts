/**
 * `createAccessCheckAccount` builds an authentik identity that a pod holds a
 * token for, so what it may do is the point. These tests pin it: exactly one
 * GLOBAL view_user permission, a service account, a non-expiring API token,
 * and an OpenBao write that conceals the token.
 *
 *   npx tsx --test components/authentik/access-check.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as pulumi from "@pulumi/pulumi";
import { Provider as VaultProvider } from "@pulumi/vault";
import { ACCESS_CHECK_PERMISSION, createAccessCheckAccount } from "./access-check.ts";

const created: { type: string; name: string; inputs: Record<string, unknown> }[] = [];
pulumi.runtime.setMocks({
  newResource: args => {
    created.push({ type: args.type, name: args.name, inputs: args.inputs });
    // What the real providers return: authentik ids are numeric strings for
    // users, uuids for roles; a Token's key is only readable with retrieveKey.
    const state: Record<string, unknown> = { ...args.inputs };
    if (args.type === "authentik:index/user:User") state.userId = "42";
    if (args.type === "authentik:index/rbacRole:RbacRole") state.rbacRoleId = "role-uuid";
    if (args.type === "authentik:index/token:Token") state.key = "secret-token-value";
    return { id: `${args.name}-id`, state };
  },
  call: args => args.inputs,
});

const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const ofType = (suffix: string) => created.filter(r => r.type.endsWith(suffix));
const outputValue = <T>(o: pulumi.Output<T>) => new Promise<T>(resolve => o.apply(v => resolve(v)));

describe("createAccessCheckAccount", () => {
  it("creates a view_user-only service account and publishes it to OpenBao", async () => {
    created.length = 0;
    const parent = new pulumi.ComponentResource("test:index:Parent", "parent");
    const baoProvider = new VaultProvider("bao", { address: "http://bao.test:8200" });
    const result = createAccessCheckAccount(
      {
        clusterKey: "equestria",
        appName: "supersync",
        displayName: "SuperSync",
        resourceName: "equestria-supersync",
        groups: ["family"],
        authentikUrl: "https://auth.example.test",
        baoProvider,
      },
      { parent },
    );
    await outputValue(result.token.key);
    await settle();

    const permissions = ofType("rbacPermissionRole:RbacPermissionRole");
    assert.equal(permissions.length, 1, "exactly one permission");
    assert.equal(permissions[0].inputs.permission, ACCESS_CHECK_PERMISSION);
    assert.equal(ACCESS_CHECK_PERMISSION, "authentik_core.view_user");
    assert.equal(permissions[0].inputs.model, undefined, "global, not object-scoped");
    assert.equal(permissions[0].inputs.role, "role-uuid");

    const [user] = ofType("user:User");
    assert.equal(user.inputs.type, "service_account");
    assert.equal(user.inputs.username, "equestria-supersync-access-check");
    assert.deepEqual(user.inputs.roles, ["role-uuid"]);
    assert.equal(user.inputs.isActive, undefined);
    assert.ok(!("groups" in user.inputs) || user.inputs.groups === undefined, "no group memberships -- a group could carry more roles");

    const [token] = ofType("token:Token");
    assert.equal(token.inputs.intent, "api");
    assert.equal(token.inputs.expiring, false);
    assert.equal(token.inputs.retrieveKey, true);
    assert.equal(token.inputs.user, 42);

    const [secret] = ofType("kv/secretV2:SecretV2");
    assert.equal(secret.inputs.mount, "secrets");
    assert.equal(secret.inputs.name, "clusters/equestria/apps/supersync/authentik-access");
    // baoKvSecret wraps dataJson in pulumi.secret(); mocks see the wire form
    // { <sig>: <secret-sig>, value }. That it arrives wrapped is itself the point.
    const dataJson = secret.inputs.dataJson as { value: string } | string;
    assert.equal(typeof dataJson, "object", "dataJson must be marked secret");
    const data = JSON.parse((dataJson as { value: string }).value);
    assert.deepEqual(data, { url: "https://auth.example.test", token: "secret-token-value", groups: "family" });
    const metadata = (secret.inputs.customMetadata as { data: Record<string, string> }).data;
    assert.equal(metadata.concealed_fields, "token");
    assert.equal(metadata.contains_secrets, "true");
  });

  it("skips the OpenBao write when the run has no OpenBao credentials", async () => {
    created.length = 0;
    const parent = new pulumi.ComponentResource("test:index:Parent", "parent-nobao");
    const result = createAccessCheckAccount(
      {
        clusterKey: "equestria",
        appName: "supersync",
        displayName: "SuperSync",
        resourceName: "equestria-supersync",
        groups: ["family"],
        authentikUrl: "https://auth.example.test",
      },
      { parent },
    );
    await settle();
    assert.equal(result.secret, undefined);
    assert.equal(ofType("kv/secretV2:SecretV2").length, 0);
    assert.equal(ofType("token:Token").length, 1, "the account is still created");
  });
});

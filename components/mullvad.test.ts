/**
 * node --test components/mullvad.test.ts
 *
 * The MullvadDevice dynamic provider against a mocked HTTP layer: no Pulumi
 * engine, no network, never Mullvad's live API. The fake below answers the
 * three calls the provider makes, in the shapes mullvad-api uses
 * (github.com/mullvad/mullvadvpn-app, mullvad-api/src/{access,device}.rs).
 */

import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, diffieHellman } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";
import { generateWireguardKeypair, MULLVAD_API, mullvadDeviceProvider } from "./mullvad.ts";

const ACCOUNT = "1234567890123456";
const TOKEN = "mva_test_token";

interface Call {
  method: string;
  url: string;
  authorization?: string;
  body?: unknown;
}

function json(status: number, body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

/** A fake Mullvad API. `routes` answers device calls; the token call always succeeds for ACCOUNT. */
function fakeMullvad(routes: (call: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      authorization: headers.get("authorization") ?? undefined,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    if (call.method === "POST" && call.url === `${MULLVAD_API}/auth/v1/token`) {
      return (call.body as { account_number?: string }).account_number === ACCOUNT
        ? json(200, { access_token: TOKEN, expiry: "2026-11-07T00:00:00Z" })
        : json(400, { code: "INVALID_ACCOUNT", detail: "Invalid account number" });
    }
    return routes(call) ?? json(404, { code: "NOT_FOUND" });
  });
  return calls;
}

afterEach(() => mock.restoreAll());

/** Is `publicKey` the X25519 public half of `privateKey`? Both WireGuard base64. */
async function isKeypair(privateKey: string, publicKey: string): Promise<boolean> {
  const priv = createPrivateKey({ key: { kty: "OKP", crv: "X25519", d: Buffer.from(privateKey, "base64").toString("base64url"), x: Buffer.from(publicKey, "base64").toString("base64url") }, format: "jwk" });
  const pub = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: Buffer.from(publicKey, "base64").toString("base64url") }, format: "jwk" });
  // A keypair agrees with itself: the shared secret with a fresh peer matches both ways.
  const peer = await generateWireguardKeypair();
  const peerPriv = createPrivateKey({ key: { kty: "OKP", crv: "X25519", d: Buffer.from(peer.privateKey, "base64").toString("base64url"), x: Buffer.from(peer.publicKey, "base64").toString("base64url") }, format: "jwk" });
  const peerPub = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: Buffer.from(peer.publicKey, "base64").toString("base64url") }, format: "jwk" });
  return diffieHellman({ privateKey: priv, publicKey: peerPub }).equals(diffieHellman({ privateKey: peerPriv, publicKey: pub }));
}

describe("generateWireguardKeypair", () => {
  it("returns 32-byte base64 keys, as `wg genkey | wg pubkey` would", async () => {
    const { privateKey, publicKey } = await generateWireguardKeypair();
    assert.equal(Buffer.from(privateKey, "base64").length, 32);
    assert.equal(Buffer.from(publicKey, "base64").length, 32);
    assert.match(privateKey, /^[A-Za-z0-9+/]{43}=$/);
    assert.ok(await isKeypair(privateKey, publicKey));
  });
});

describe("MullvadDevice create", () => {
  it("registers a fresh public key and returns the device Mullvad assigns", async () => {
    const calls = fakeMullvad(call =>
      call.method === "POST" && call.url === `${MULLVAD_API}/accounts/v1/devices`
        ? json(201, {
            id: "dev-1",
            name: "happy otter",
            pubkey: (call.body as { pubkey: string }).pubkey,
            ipv4_address: "10.64.1.2/32",
            ipv6_address: "fc00:bbbb:bbbb:bb01::1:102/128",
            hijack_dns: false,
            created: "2026-11-06T12:00:00Z",
          })
        : undefined,
    );

    const result = await mullvadDeviceProvider.create({ accountNumber: ACCOUNT, label: "spitfire" });

    const register = calls.find(c => c.url.endsWith("/accounts/v1/devices"));
    assert.ok(register, "no POST /accounts/v1/devices");
    assert.equal(register.authorization, `Bearer ${TOKEN}`);
    const sent = register.body as { pubkey: string; hijack_dns: boolean };
    assert.equal(sent.hijack_dns, false);

    assert.equal(result.id, "dev-1");
    assert.equal(result.outs.deviceId, "dev-1");
    assert.equal(result.outs.deviceName, "happy otter");
    assert.equal(result.outs.ipv4Address, "10.64.1.2/32");
    assert.equal(result.outs.publicKey, sent.pubkey);
    assert.ok(await isKeypair(result.outs.privateKey, sent.pubkey), "privateKey is not the half of the registered pubkey");
    // The private key never leaves the process.
    assert.ok(!JSON.stringify(calls).includes(result.outs.privateKey));
  });
});

describe("MullvadDevice create on a full account", () => {
  it("names MAX_DEVICES_REACHED and says to revoke a device", async () => {
    // The {code, detail} shape the app's own mock API answers with
    // (android/test/mockapi .../util/JsonUtils.kt tooManyDevicesJsonResponse, HTTP 400).
    fakeMullvad(call => (call.method === "POST" && call.url.endsWith("/accounts/v1/devices") ? json(400, { code: "MAX_DEVICES_REACHED", detail: "This account already has the maximum number of devices." }) : undefined));
    await assert.rejects(mullvadDeviceProvider.create({ accountNumber: ACCOUNT, label: "spitfire" }), /MAX_DEVICES_REACHED.*Revoke a stale one/);
  });

  it("recognises the problem+json form, whose `type` replaces `code`", async () => {
    fakeMullvad(call => (call.method === "POST" && call.url.endsWith("/accounts/v1/devices") ? json(400, { type: "MAX_DEVICES_REACHED" }, "application/problem+json") : undefined));
    await assert.rejects(mullvadDeviceProvider.create({ accountNumber: ACCOUNT, label: "spitfire" }), /Revoke a stale one/);
  });

  it("does not put the account number in the error", async () => {
    fakeMullvad(() => undefined);
    const error = await mullvadDeviceProvider.create({ accountNumber: "9999888877776666", label: "spitfire" }).catch((e: Error) => e);
    assert.ok(error instanceof Error);
    assert.match(error.message, /INVALID_ACCOUNT/);
    assert.ok(!error.message.includes("9999888877776666"));
  });
});

const OLDS = { accountNumber: ACCOUNT, label: "spitfire", deviceId: "dev-1", deviceName: "happy otter", ipv4Address: "10.64.1.2/32", publicKey: "pub", privateKey: "priv" };

describe("MullvadDevice delete", () => {
  it("revokes the device, freeing its slot", async () => {
    const calls = fakeMullvad(call => (call.method === "DELETE" && call.url === `${MULLVAD_API}/accounts/v1/devices/dev-1` ? new Response(null, { status: 204 }) : undefined));
    await mullvadDeviceProvider.delete("dev-1", OLDS);
    const revoke = calls.find(c => c.method === "DELETE");
    assert.ok(revoke, "no DELETE");
    assert.equal(revoke.authorization, `Bearer ${TOKEN}`);
  });

  it("treats a device already revoked by hand as gone", async () => {
    fakeMullvad(call => (call.method === "DELETE" ? json(404, { code: "DEVICE_NOT_FOUND" }) : undefined));
    await mullvadDeviceProvider.delete("dev-1", OLDS);
  });

  it("fails on any other error, so state keeps the device", async () => {
    fakeMullvad(call => (call.method === "DELETE" ? json(500, { code: "INTERNAL" }) : undefined));
    await assert.rejects(mullvadDeviceProvider.delete("dev-1", OLDS), /HTTP 500/);
  });
});

describe("MullvadDevice diff", () => {
  it("is a no-op when nothing changed", async () => {
    const diff = await mullvadDeviceProvider.diff("dev-1", OLDS, { accountNumber: ACCOUNT, label: "spitfire" });
    assert.equal(diff.changes, false);
  });

  it("replaces delete-first on a new account or label: the account has no spare slot", async () => {
    for (const news of [
      { accountNumber: "6543210987654321", label: "spitfire" },
      { accountNumber: ACCOUNT, label: "soarin" },
    ]) {
      const diff = await mullvadDeviceProvider.diff("dev-1", OLDS, news);
      assert.equal(diff.changes, true);
      assert.equal(diff.replaces.length, 1);
      assert.equal(diff.deleteBeforeReplace, true);
    }
  });
});

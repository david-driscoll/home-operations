/**
 * A Mullvad WireGuard device as a Pulumi resource (region exits,
 * docs/plans/region-exits.md §C1, ADR 0005).
 *
 * Create generates an X25519 keypair in-process and registers the public half
 * with Mullvad's device API; the private key never leaves this process except
 * as a secret output. Delete revokes the device, which frees its slot on the
 * account. The account holds five devices and the five region exits use all
 * of them, so a replace deletes first.
 *
 * The API, as the official app's `mullvad-api` crate uses it
 * (github.com/mullvad/mullvadvpn-app, mullvad-api/src/access.rs, device.rs,
 * lib.rs, rest.rs):
 *
 *   POST   https://api.mullvad.net/auth/v1/token          {account_number}      -> {access_token, expiry}
 *   POST   https://api.mullvad.net/accounts/v1/devices     {pubkey, hijack_dns}  -> 201 {id, name, pubkey, ipv4_address, ipv6_address, ...}
 *   DELETE https://api.mullvad.net/accounts/v1/devices/<id>                      -> 204
 *
 * Device calls carry `Authorization: Bearer <access_token>`. Errors are JSON
 * `{code, detail}`, or `application/problem+json` whose `type` replaces
 * `code`. A full account answers the create with `MAX_DEVICES_REACHED`.
 */
import * as pulumi from "@pulumi/pulumi";

export const MULLVAD_API = "https://api.mullvad.net";

/** Error codes from mullvad-api/src/lib.rs. */
const MAX_DEVICES_REACHED = "MAX_DEVICES_REACHED";
const DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND";

export interface WireguardKeypair {
  /** Standard base64 of the 32-byte X25519 private key, as `wg genkey` prints it. */
  privateKey: string;
  /** Standard base64 of the 32-byte public key, as `wg pubkey` prints it. */
  publicKey: string;
}

/**
 * WebCrypto rather than `node:crypto`: Pulumi serializes the dynamic provider's
 * closure, and a global is simpler to carry across than a captured import.
 */
export async function generateWireguardKeypair(): Promise<WireguardKeypair> {
  const pair = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d || !jwk.x) throw new Error("X25519 key export has no d/x");
  return { privateKey: Buffer.from(jwk.d, "base64url").toString("base64"), publicKey: Buffer.from(jwk.x, "base64url").toString("base64") };
}

/** The device fields Mullvad returns that this resource keeps (mullvad-api `DeviceResponse`). */
interface DeviceResponse {
  id: string;
  name: string;
  pubkey: string;
  ipv4_address: string;
}

export class MullvadApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  constructor(what: string, status: number, code: string) {
    super(`Mullvad ${what}: HTTP ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

async function apiError(what: string, response: Response): Promise<MullvadApiError> {
  // Never echo the body wholesale: the token endpoint's request carried the
  // account number, and the error path must not be where it leaks.
  let code = response.statusText || "error";
  try {
    const body = (await response.json()) as { code?: string; type?: string };
    code = body.code ?? body.type ?? code;
  } catch {
    // Not JSON: keep the status text.
  }
  return new MullvadApiError(what, response.status, code);
}

async function accessToken(accountNumber: string): Promise<string> {
  const response = await fetch(`${MULLVAD_API}/auth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ account_number: accountNumber }),
  });
  if (!response.ok) throw await apiError("POST /auth/v1/token", response);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Mullvad POST /auth/v1/token: response has no access_token");
  return body.access_token;
}

async function registerDevice(accountNumber: string, publicKey: string): Promise<DeviceResponse> {
  const token = await accessToken(accountNumber);
  const response = await fetch(`${MULLVAD_API}/accounts/v1/devices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    // hijack_dns false, as the app sends it.
    body: JSON.stringify({ pubkey: publicKey, hijack_dns: false }),
  });
  if (!response.ok) {
    const error = await apiError("POST /accounts/v1/devices", response);
    if (error.code.endsWith(MAX_DEVICES_REACHED)) {
      throw new Error(`${error.message}: the Mullvad account already holds its maximum number of devices. Revoke a stale one (mullvad.net account page, Devices) and run again.`);
    }
    throw error;
  }
  const device = (await response.json()) as Partial<DeviceResponse>;
  if (!device.id || !device.name || !device.ipv4_address) throw new Error("Mullvad POST /accounts/v1/devices: response has no id, name or ipv4_address");
  return device as DeviceResponse;
}

export interface MullvadDeviceArgs {
  /** The Mullvad account number. Secret. From GlobalResources.mullvadCredential. */
  accountNumber: pulumi.Input<string>;
  /** Our name for the device (the region exit). Mullvad assigns its own `deviceName`. */
  label: pulumi.Input<string>;
}

interface ProviderInputs {
  accountNumber: string;
  label: string;
}

export interface MullvadDeviceOutputs extends ProviderInputs {
  deviceId: string;
  deviceName: string;
  ipv4Address: string;
  publicKey: string;
  privateKey: string;
}

async function revokeDevice(accountNumber: string, deviceId: string): Promise<void> {
  const token = await accessToken(accountNumber);
  const path = `/accounts/v1/devices/${encodeURIComponent(deviceId)}`;
  const response = await fetch(`${MULLVAD_API}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (response.ok) return;
  const error = await apiError(`DELETE ${path}`, response);
  // Already revoked by hand (or by the app): the slot is free, nothing to do.
  if (error.status === 404 || error.code.endsWith(DEVICE_NOT_FOUND)) return;
  throw error;
}

/** Exported for components/mullvad.test.ts; stacks use `MullvadDevice`. */
export const mullvadDeviceProvider = {
  /**
   * A new account or label is a different device. Delete first: the five
   * region exits fill the account, so create-before-delete would hit
   * MAX_DEVICES_REACHED.
   */
  async diff(_id: string, olds: MullvadDeviceOutputs, news: ProviderInputs): Promise<{ changes: boolean; replaces: string[]; deleteBeforeReplace: boolean }> {
    const replaces = (["accountNumber", "label"] as const).filter(key => olds[key] !== news[key]);
    return { changes: replaces.length > 0, replaces, deleteBeforeReplace: true };
  },
  async delete(id: string, olds: MullvadDeviceOutputs): Promise<void> {
    await revokeDevice(olds.accountNumber, id);
  },
  async update(_id: string, olds: MullvadDeviceOutputs, news: ProviderInputs): Promise<{ outs: MullvadDeviceOutputs }> {
    // diff replaces on every input that matters, so nothing reaches here but
    // a no-op; keep the device as it is.
    return { outs: { ...olds, ...news } };
  },
  async create(inputs: ProviderInputs): Promise<{ id: string; outs: MullvadDeviceOutputs }> {
    const keypair = await generateWireguardKeypair();
    const device = await registerDevice(inputs.accountNumber, keypair.publicKey);
    return {
      id: device.id,
      outs: { ...inputs, deviceId: device.id, deviceName: device.name, ipv4Address: device.ipv4_address, publicKey: keypair.publicKey, privateKey: keypair.privateKey },
    };
  },
};

export class MullvadDevice extends pulumi.dynamic.Resource {
  /** Mullvad's device id. */
  public declare readonly deviceId: pulumi.Output<string>;
  /** The name Mullvad assigns (two words, e.g. "happy otter"); shown on the account page. */
  public declare readonly deviceName: pulumi.Output<string>;
  /** The tunnel address, CIDR (`10.x.y.z/32`): gluetun's WIREGUARD_ADDRESSES. */
  public declare readonly ipv4Address: pulumi.Output<string>;
  public declare readonly publicKey: pulumi.Output<string>;
  /** gluetun's WIREGUARD_PRIVATE_KEY. Secret. */
  public declare readonly privateKey: pulumi.Output<string>;

  constructor(name: string, args: MullvadDeviceArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      mullvadDeviceProvider,
      name,
      { ...args, deviceId: undefined, deviceName: undefined, ipv4Address: undefined, publicKey: undefined, privateKey: undefined },
      { additionalSecretOutputs: ["accountNumber", "privateKey"], ...opts },
    );
  }
}

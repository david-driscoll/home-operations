import { GlobalResources } from "./globals.ts";
import { awaitOutput } from "./helpers.ts";
import { AuthLoginWithApiKeyRequest, TrueNASClient, TrueNASResourceManager } from "./truenas/index.ts";
import { OPClient } from "@components/op.ts";

// Create a simple function that doesn't capture complex objects
export async function getTruenasClient(globals: GlobalResources, credentialTitle: string) {
  const item = await awaitOutput(globals.store.getSecretByTitle<{ domain: string; credential: string }>(credentialTitle));

  // Create the new JSON-RPC client instance
  const truenasClient = new TrueNASClient(item.domain, {
    ssl: true,
    port: 443,
    reconnectOnClose: true,
    maxReconnectAttempts: 3,
  });
  const connection = await truenasClient.connection;

  // Try API key first, then fall back to username/password
  const apiKey = item.credential;
  const auth = await connection.sendRequest(AuthLoginWithApiKeyRequest, apiKey);
  if (!auth) {
    throw new Error("Failed to authenticate to TrueNAS with provided API key");
  }
  return truenasClient;
}

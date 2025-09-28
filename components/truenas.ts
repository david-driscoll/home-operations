import { TrueNASClient, TrueNASResourceManager } from "./truenas/index.ts";
import { OPClient } from "@components/op.ts";

// Create a simple function that doesn't capture complex objects
export async function getTruenasClient(credentialTitle: string) {
  const item = await new OPClient().getItemByTitle(credentialTitle);

  // Create the new JSON-RPC client instance
  const truenasClient = new TrueNASClient(item.fields["domain"].value!, {
    ssl: true,
    port: 443,
    reconnectOnClose: true,
    maxReconnectAttempts: 3,
  });
  await truenasClient.connection;

  // Try API key first, then fall back to username/password
  const apiKey = item.fields["credential"].value!;
  const auth = await truenasClient.auth.loginWithApiKey(apiKey);
  if (!auth) {
    throw new Error("Failed to authenticate to TrueNAS with provided API key");
  }
  return truenasClient;
}

import { op } from "./op.ts";
import { createTypedTrueNASClient } from "./truenas/index.ts";

export async function createTruenasClient(credentialTitle: string) {
  const truenasCredential = await op.getItemByTitle(credentialTitle);

  // Create the new JSON-RPC client instance
  const client = createTypedTrueNASClient(truenasCredential.fields["domain"].value!, { ssl: true, port: 443, reconnectOnClose: true, maxReconnectAttempts: 3 });
  await client.connect();

  // Try API key first, then fall back to username/password
  const apiKey = truenasCredential.fields["credential"].value!;
  if (!(await client.authenticateWithApiKey(apiKey))) {
    throw new Error("Failed to authenticate to TrueNAS with provided API key");
  }
  return client;
}

/**
 * TrueNAS JSON-RPC API Client Library
 *
 * This library provides a TypeScript client for the TrueNAS JSON-RPC 2.0 API
 * over WebSocket. It replaces the deprecated REST API with the new WebSocket-based
 * JSON-RPC implementation.
 *
 * @example
 * ```typescript
 * import { createTypedTrueNASClient } from './api';
 *
 * const client = createTypedTrueNASClient('truenas.local', {
 *   ssl: true,
 *   port: 443
 * });
 *
 * await client.connect();
 * await client.authenticate('admin', 'password');
 *
 * const systemInfo = await client.getSystemInfo();
 * const pools = await client.getPools();
 * ```
 */

// Export the base client
export { TrueNASClient, createTrueNASClient } from "./truenas-client.js";

// Export the typed client
export { TypedTrueNASClient, createTypedTrueNASClient } from "./typed-truenas-client.js";

// Export all type definitions
export * from "./truenas-types.js";

// Re-export the main client as default
export { createTypedTrueNASClient as default } from "./typed-truenas-client.js";

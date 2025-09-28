/**
 * TrueNAS JSON-RPC API Client Library
 *
 * This library provides a TypeScript client for the TrueNAS JSON-RPC 2.0 API
 * over WebSocket. It replaces the deprecated REST API with the new WebSocket-based
 * JSON-RPC implementation.
 *
 * @example
 * ```typescript
 * import { createTrueNASClient } from './index.js';
 *
 * const client = createTrueNASClient('truenas.local', {
 *   ssl: true,
 *   port: 443
 * });
 *
 * await client.connect();
 * await client.authenticate('admin', 'password');
 *
 * const systemInfo = await client.system.info();
 * const pools = await client.pool.query();
 * ```
 */

// Export the base client
export * from "./truenas-client.js";

// Export all type definitions
export * from "./truenas-types.js";

// Export the manager
export * from "./truenas-manager.js";

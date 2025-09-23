# TrueNAS JSON-RPC API Client

A TypeScript client library for the TrueNAS JSON-RPC 2.0 API over WebSocket. This replaces the deprecated REST API with the new WebSocket-based JSON-RPC implementation introduced in TrueNAS v25.04.2.

## Features

- ✅ **TypeScript Support**: Fully typed API with IntelliSense support
- ✅ **WebSocket Communication**: Real-time bidirectional communication
- ✅ **JSON-RPC 2.0**: Standards-compliant JSON-RPC implementation
- ✅ **Event Notifications**: Receive real-time notifications from TrueNAS
- ✅ **Authentication**: Support for username/password and API key auth
- ✅ **Connection Management**: Automatic reconnection and error handling
- ✅ **Comprehensive API**: Full coverage of TrueNAS API methods

## Installation

The required dependency `rpc-websocket-client` is already installed in this project.

## Quick Start

```typescript
import { createTypedTrueNASClient } from "./api";

const client = createTypedTrueNASClient("your-truenas-host", {
  ssl: true,
  port: 443,
});

// Connect to TrueNAS
await client.connect();

// Authenticate
await client.authenticate("admin", "your-password");
// or with API key
// await client.authenticateWithApiKey('your-api-key');

// Get system information
const systemInfo = await client.getSystemInfo();
console.log("TrueNAS Version:", systemInfo.version);

// Get all pools
const pools = await client.getPools();
console.log(
  "Pools:",
  pools.map((p) => p.name)
);

// Get all datasets
const datasets = await client.getDatasets();
console.log(
  "Datasets:",
  datasets.map((d) => d.name)
);

// Subscribe to notifications
client.onCollectionUpdate = (notification) => {
  console.log("Collection updated:", notification);
};

await client.subscribe("pool.dataset");

// Disconnect when done
client.disconnect();
```

## API Methods

### System Methods

- `system.info()` - Get system information
- `system.version()` - Get TrueNAS version
- `system.reboot(delay?)` - Reboot the system
- `system.shutdown(delay?)` - Shutdown the system
- `system.time()` - Get system time
- `system.timezone()` - Get system timezone
- `system.hostname()` - Get system hostname

### Pool Methods

- `pool.query(filters?, options?)` - Query pools
- `pool.get_instance(id)` - Get specific pool
- `pool.create(pool_data)` - Create new pool
- `pool.update(id, pool_data)` - Update pool
- `pool.delete(id, options?)` - Delete pool
- `pool.export(id, options?)` - Export pool
- `pool.import(pool_data)` - Import pool

### Dataset Methods

- `pool.dataset.query(filters?, options?)` - Query datasets
- `pool.dataset.get_instance(id)` - Get specific dataset
- `pool.dataset.create(dataset_data)` - Create new dataset
- `pool.dataset.update(id, dataset_data)` - Update dataset
- `pool.dataset.delete(id, options?)` - Delete dataset

### User & Group Methods

- `user.query(filters?, options?)` - Query users
- `user.create(user_data)` - Create user
- `user.update(id, user_data)` - Update user
- `user.delete(id)` - Delete user
- `group.query(filters?, options?)` - Query groups
- `group.create(group_data)` - Create group
- `group.update(id, group_data)` - Update group
- `group.delete(id)` - Delete group

### Sharing Methods

- `sharing.nfs.query(filters?, options?)` - Query NFS shares
- `sharing.nfs.create(share_data)` - Create NFS share
- `sharing.nfs.update(id, share_data)` - Update NFS share
- `sharing.nfs.delete(id)` - Delete NFS share
- `sharing.smb.query(filters?, options?)` - Query SMB shares
- `sharing.smb.create(share_data)` - Create SMB share
- `sharing.smb.update(id, share_data)` - Update SMB share
- `sharing.smb.delete(id)` - Delete SMB share

### Authentication Methods

- `auth.login(username, password)` - Login with credentials
- `auth.login_with_api_key(api_key)` - Login with API key
- `auth.logout()` - Logout
- `auth.me()` - Get current user session
- `auth.check_user(username, password)` - Verify credentials

### Core Methods

- `core.subscribe(name)` - Subscribe to notifications
- `core.unsubscribe(name)` - Unsubscribe from notifications
- `core.get_jobs(filters?, options?)` - Get jobs
- `core.get_job(id)` - Get specific job
- `core.job_abort(id)` - Abort job

## Convenience Methods

The typed client also provides convenience methods with better naming:

```typescript
// Instead of client['system.info']()
const info = await client.getSystemInfo();

// Instead of client['pool.query']()
const pools = await client.getPools();

// Instead of client['pool.dataset.query']()
const datasets = await client.getDatasets();

// Instead of client['user.query']()
const users = await client.getUsers();
```

## Event Handling

```typescript
// Handle collection updates
client.onCollectionUpdate = (notification) => {
  console.log("Collection:", notification.collection);
  console.log("Event:", notification.event);
  console.log("Data:", notification.fields);
};

// Handle unsubscribe notifications
client.onNotifyUnsubscribed = (notification) => {
  console.log("Unsubscribed from:", notification.collection);
  console.log("Error:", notification.error);
};

// Subscribe to specific collections
await client.subscribe("pool.dataset");
await client.subscribe("sharing.nfs");
await client.subscribe("system.general");
```

## Query Filters and Options

```typescript
// Query with filters
const adminUsers = await client.getUsers([{ field: "username", operator: "=", value: "admin" }]);

// Query with options
const firstTenPools = await client.getPools([], {
  limit: 10,
  offset: 0,
  order_by: ["name"],
});

// Get only specific fields
const poolNames = await client.getPools([], {
  select: ["id", "name", "status"],
});
```

## Error Handling

```typescript
try {
  await client.connect();
  await client.authenticate("admin", "wrong-password");
} catch (error) {
  if (error.code === -32001) {
    console.error("Method call error:", error.message);
    console.error("Details:", error.data);
  } else {
    console.error("Connection error:", error);
  }
}
```

## Migration from REST API

If you're migrating from the deprecated REST API, here are the key differences:

1. **Protocol**: WebSocket instead of HTTP
2. **Format**: JSON-RPC 2.0 instead of REST
3. **Real-time**: Bidirectional communication with notifications
4. **Authentication**: Session-based instead of per-request

### Before (REST API)

```typescript
// Old REST API approach
const response = await fetch("/api/v2.0/pool/", {
  headers: { Authorization: `Bearer ${token}` },
});
const pools = await response.json();
```

### After (JSON-RPC API)

```typescript
// New JSON-RPC API approach
const client = createTypedTrueNASClient("truenas.local");
await client.connect();
await client.authenticate("admin", "password");
const pools = await client.getPools();
```

## Type Definitions

The library includes comprehensive TypeScript type definitions for all API responses:

- `SystemInfo` - System information structure
- `Pool` - Storage pool data
- `Dataset` - Dataset information
- `User` - User account data
- `Group` - Group information
- `NFSShare` - NFS share configuration
- `SMBShare` - SMB share configuration
- `Job` - Background job status
- And many more...

## Error Codes

The library handles standard JSON-RPC 2.0 error codes plus TrueNAS-specific codes:

- `-32000`: Too many concurrent calls
- `-32001`: Method call error
- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

# Component API Reference

Condensed reference for all reusable Pulumi `ComponentResource` classes in `components/`.

## ComponentResource Hierarchy

```
ComponentResource Hierarchy:
├── ProxmoxHost              (components/ProxmoxHost.ts)
│   ├── tailscale integration
│   ├── DNS configuration (StandardDns)
│   └── LXC/VM provisioning
├── DockgeLxc                (components/DockgeLxc.ts)
│   ├── Docker runtime
│   ├── Service discovery
│   └── Docker Compose stacks
├── TruenasVm                (components/TruenasVm.ts)
│   ├── NFS exports
│   ├── SMB shares
│   └── S3 (Minio)
├── ProxmoxBackupServerLxc   (components/ProxmoxBackupServerLxc.ts)
│   └── Proxmox backup targets
├── StandardDns              (components/StandardDns.ts)
│   └── Cloudflare DNS zones
└── Helper Modules
    ├── tailscale.ts
    ├── authentik.ts
    ├── lxc.ts
    ├── unifi.ts
    └── helpers.ts
```

---

## ProxmoxHost

**File:** `components/ProxmoxHost.ts`

**Purpose:** Manages a Proxmox VE host — Tailscale integration, DNS, subnet routing, LXC/VM lifecycle, NFS mounts, Authentik application registration.

**Key Constructor Args:**
```typescript
interface ProxmoxHostArgs {
  title?: Input<string>;
  globals: GlobalResources;
  proxmox: Input<OPClientItem>;           // Proxmox credentials from 1Password
  tailscaleIpAddress: TailscaleIp;        // Tailscale VPN IP
  tailscaleTags?: TailscaleTags[];
  tailscaleSubnetRoutes: TailscaleCidr[];
  remote: boolean;                         // True = unreachable without VPN
  internalIpAddress?: TailscaleIp;
  installTailscale?: boolean;             // Default: true
  truenas?: TruenasVm;
  cluster: Input<ClusterDefinition>;
  shortName?: string;                     // e.g. "as" for alpha-site
  peerRelay?: boolean;
  authentikOutputs: AuthentikOutputs;
  vmIdRange: { start: number; end: number };
}
```

**Key Exported Properties:**
```typescript
name: string
internalIpAddress: TailscaleIp
tailscaleIpAddress: TailscaleIp
tailscaleHostname: Output<string>
tailscaleName: Output<string>
hostname: Output<string>
cluster: Output<ClusterDefinition>
dns: Output<StandardDns>
applicationManager: AuthentikApplicationManager
```

**Key Methods:**
```typescript
addNfsMount(host: Input<string>, path: string): Output<string>
```

**Example:**
```typescript
const celestiaHost = new ProxmoxHost("celestia", {
  globals,
  authentikOutputs: outputs,
  internalIpAddress: "10.10.10.103",
  tailscaleIpAddress: "100.111.10.103",
  proxmox: mainProxmoxCredentials,
  cluster: celestiaCluster,
  peerRelay: true,
  tailscaleSubnetRoutes: [Tailscale.subnets.home],
  vmIdRange: { start: 302, end: 399 },
});
```

---

## DockgeLxc

**File:** `components/DockgeLxc.ts`

**Purpose:** Manages a Dockge LXC container — Docker runtime, docker-compose deployment, Tailscale, Traefik integration, SFTP access for backups.

**Key Constructor Args:**
```typescript
interface DockgeLxcArgs {
  createDockerLxc?: boolean;
  globals: GlobalResources;
  host: ProxmoxHost;
  vmId: Input<number>;
  ipAddress?: TailscaleIp;
  tailscaleIpAddress?: TailscaleIp;
  cluster: Input<ClusterDefinition>;
  credential: Input<OPClientItem>;        // Dockge credentials from 1Password
  tailscaleArgs?: Partial<...>;
  legacyTun?: boolean;
  sftpKey: Input<OPClientItem>;
  registerTailscaleService(service: string): void;
}
```

**Key Methods:**
```typescript
addHostMount(hostPath: string, containerPath?: string): void
registerExternalService(opts: ExternalServiceOpts): void
addService(name: string, config: ...): Command
```

**Key Exported Properties:**
```typescript
tailscaleHostname: Output<string>
tailscaleIpAddress: Output<TailscaleIp>
hostname: Output<string>
ipAddress: Output<TailscaleIp>
cluster: Output<ClusterDefinition>
dns: Output<StandardDns>
credential: Output<OPClientItem>
```

**Example:**
```typescript
const celestiaDockge = new DockgeLxc("celestia-dockge", {
  globals,
  credential: dockgeCredential,
  host: celestiaHost,
  vmId: 300,
  cluster: celestiaCluster,
  sftpKey: sftpClientKey,
  createDockerLxc: true,
  registerTailscaleService: (svc) => tailscaleServices.push(svc),
});
celestiaDockge.addHostMount("/data");
```

---

## TruenasVm

**File:** `components/TruenasVm.ts`

**Purpose:** Manages a TrueNAS storage VM — NFS exports, Minio S3 integration, backup targets.

**Key Constructor Args:**
```typescript
interface TruenasVmArgs {
  credential: Input<string>;              // TrueNAS item title from 1Password
  globals: GlobalResources;
  host: ProxmoxHost;
  ipAddress: Input<string>;
  tailscaleIpAddress: TailscaleIp;
}
```

**Key Methods:**
```typescript
addClusterBackup(cluster: ProxmoxHost): Output<...>
```

**Key Exported Properties:**
```typescript
ipAddress: Output<string>
tailscaleIpAddress: TailscaleIp
nfsBasePath: Output<string>
```

**Example:**
```typescript
const spikeVm = new TruenasVm("spike", {
  credential: globals.truenasCredential.apply((z) => z.title!),
  globals,
  host: twilightSparkleHost,
  ipAddress: pulumi.output("10.10.10.10"),
  tailscaleIpAddress: "100.111.10.10",
});
```

---

## ProxmoxBackupServerLxc

**File:** `components/ProxmoxBackupServerLxc.ts`

**Purpose:** Provisions and manages a Proxmox Backup Server (PBS) LXC container — datastore config, backup scheduling, retention policies.

---

## StandardDns

**File:** `components/StandardDns.ts`

**Purpose:** Manages DNS records for a cluster via Cloudflare — wildcard records, service discovery DNS, ACME validation.

**Key Methods:**
```typescript
addRecord(name: string, value: string): void
addWildcard(zone: string, ip: string): void
```

Used by `ProxmoxHost` and `DockgeLxc` automatically for service DNS.

---

## Helper Modules

### tailscale.ts

```typescript
updateTailscaleProxmox(opts: { host, tailscaleCredential, tags, args }): void
installTailscaleLxc(opts: { host, lxc, tailscaleCredential, args }): void
createPeerRelayRule(host: ProxmoxHost): void
```

### authentik.ts

```typescript
class AuthentikApplicationManager {
  registerApplication(opts: { name, domain, provider }): Output<Application>
}
class AuthentikOutputs {
  groups: Map<string, Output<string>>;
  roles: Map<string, Output<string>>;
  flows: Map<string, Output<string>>;
}
```

### lxc.ts

```typescript
runCommunityScriptLxc(opts: { host, container, scriptPath }): Command
```

### unifi.ts

```typescript
updateUnifiNetwork(opts: { credential, networkDef }): void
```

### helpers.ts

```typescript
copyFileToRemote(opts: { connection, source, destination }): void
awaitOutput<T>(output: Output<T>): Promise<T>
getTailscaleSection(item: OPClientItem): OPClientItemSections["tailscale"]
addUptimeGatus(name: string, url: string, connection: ...): void
```

---

## Design Patterns

### 1. Provider Injection
All components receive `globals: GlobalResources` for centralized provider access:
```typescript
this.pveProvider = args.host.pveProvider;
const cfProvider = args.globals.cloudflareProvider;
```

### 2. Credential Unpacking
Credentials from 1Password as `OPClientItem`, unpacked via `.apply()`:
```typescript
const username = credential.apply((c) => c.fields.username.value);
const password = credential.apply((c) => c.fields.password.value);
```

### 3. Parent-Child Resources
Components register parent for proper ordering:
```typescript
super("home:proxmox:ProxmoxHost", name, opts);
// Children: { parent: this }
```

### 4. Remote Execution
Remote commands via `@pulumi/command/remote`:
```typescript
const cmd = new Command("task", {
  connection: this.remoteConnection,
  create: `ssh-keyscan ${host} >> ~/.ssh/known_hosts`,
}, { parent: this });
```

### 5. Output Wiring
Outputs composed for downstream use:
```typescript
public readonly tailscaleHostname: Output<string> =
  this.cluster.apply((c) => `${this.name}.ts.${c.rootDomain}`);
```

---

## File Dependency Graph

```
globals.ts
├── op.ts (OPClient)
├── constants.ts (Tailscale config)
└── helpers.ts

ProxmoxHost.ts
├── globals.ts
├── StandardDns.ts
├── tailscale.ts
├── authentik.ts
└── helpers.ts

DockgeLxc.ts
├── ProxmoxHost.ts
├── StandardDns.ts
├── tailscale.ts
├── lxc.ts
├── authentik.ts
└── helpers.ts

TruenasVm.ts
└── ProxmoxHost.ts
```

---

## See Also

- `docs/codebase/ARCHITECTURE.md` — Overall system design and provider reference
- `docs/codebase/STRUCTURE.md` — Directory layout and module boundaries
- `components/globals.ts` — Provider initialization
- `stacks/home/index.ts` — Canonical component usage

# Home Operations Development Guide

**Last Updated:** 2025-05-24

Complete guide for understanding and working with the home-operations codebase.

## Quick Start

### Initial Setup

```bash
# Install tools (one-time)
curl https://mise.run | sh
mise trust
mise install          # Node 24, kubectl, flux2, pulumi, sops, age, etc.

# Install dependencies
npm ci                # All workspace dependencies
```

### Running a Stack

```bash
# Always preview first
cd stacks/home
pulumi preview

# Then deploy
pulumi up --yes

# Check outputs
pulumi stack output hostname
```

### Environment Variables

Sourced from `.mise.toml` via 1Password:

```bash
# 1Password Connect (for credentials)
CONNECT_HOST          # Set via op://...
CONNECT_TOKEN         # Set via op://...

# Pulumi encryption
PULUMI_CONFIG_PASSPHRASE  # Set via op://...

# AWS/Minio
AWS_ACCESS_KEY_ID     # Set via op://...
AWS_SECRET_ACCESS_KEY # Set via op://...
```

## Architecture Overview

### System Architecture

```
1Password Connect
    ↓ (OPClient)
GlobalResources (credentials + providers)
    ↓
ComponentResources (ProxmoxHost, DockgeLxc, etc.)
    ↓
Pulumi Stacks (home, authentik, applications, etc.)
    ↓
Infrastructure Resources ↔ 1Password (outputs)
```

### Repository Layout

```
home-operations/
├── components/        # Reusable Pulumi ComponentResources
├── stacks/           # Deployable Pulumi stacks
├── sdks/             # Vendor SDK wrappers
├── dynamic/          # Code-generated resources
├── docker/           # Docker/Dockge configs
├── types/            # TypeScript type definitions
├── docs/
│   ├── CODEMAPS/     # Architectural documentation
│   ├── docker/       # Docker guides
│   └── kubernetes/   # Kubernetes guides
├── CLAUDE.md         # Developer workflow & conventions
├── AGENTS.md         # Agent strategy & MCP servers
└── .mise.toml        # Tool versions & env setup
```

## Key Concepts

### Data Flow: Credentials

All credentials come from 1Password via OPClient:

1. **1Password Connect** — Secure credential server
2. **OPClient** (`components/op.ts`) — Fetches items by title
3. **GlobalResources** (`components/globals.ts`) — Initializes providers with credentials
4. **Stacks & Components** — Consume providers from GlobalResources

Example:
```typescript
const credential = output(op.getItemByTitle("Cloudflare (driscoll.tech)"));
const provider = new CloudflareProvider("cf", {
  apiToken: credential.apply(c => c.fields.token.value),
});
```

### Design Pattern: ComponentResource

Reusable infrastructure as classes:

```typescript
class ProxmoxHost extends ComponentResource {
  constructor(name: string, args: ProxmoxHostArgs, opts?: ComponentResourceOptions) {
    super("home:proxmox:ProxmoxHost", name, opts);
    // Initialize infrastructure
  }
}

// Usage in stack
const host = new ProxmoxHost("celestia", {
  globals, proxmox, cluster, ...
});
```

### Design Pattern: Provider Centralization

All providers created in ONE place: `GlobalResources`

```typescript
// Good: Central provider
const provider = globals.cloudflareProvider;

// Bad: Creating duplicate providers
const provider = new CloudflareProvider("cf", { ... });  // NEVER DO THIS
```

### Cluster Definition

Cluster metadata stored in 1Password:

```typescript
interface ClusterDefinition {
  type: "dockge" | "kubernetes";
  key: string;                // Unique ID
  title: string;              // Display name
  rootDomain: string;         // Base domain
  authentikDomain: string;    // Auth endpoint
  secret?: string;            // K8s secret
  icon?: string;              // UI branding
}
```

Used to configure DNS, Traefik, Authentik, and UI branding per cluster.

## Working with Stacks

### Stack Anatomy

```typescript
// 1. Initialize GlobalResources (always first)
const globals = new GlobalResources({}, {});
const op = new OPClient();

// 2. Fetch credentials from 1Password
const proxmoxCreds = pulumi.output(op.getItemByTitle("Proxmox"));
const clusterDef = pulumi.output(op.getItemByTitle("Cluster: Celestia"))
  .apply(createClusterDefinition);

// 3. Create ComponentResources
const host = new ProxmoxHost("celestia", {
  globals,
  proxmox: proxmoxCreds,
  cluster: clusterDef,
  ...
});

// 4. Create infrastructure resources
const vm = new proxmox.VirtualMachine("my-vm", {
  // ...
}, { provider: host.pveProvider });

// 5. Export outputs (optional)
export const hostname = host.hostname;
```

### Adding a New Stack

```bash
# 1. Create directory
mkdir -p stacks/my-stack

# 2. Create package.json
{
  "name": "my-stack",
  "type": "module",
  "dependencies": {
    "@pulumi/pulumi": "^3.0.0"
  }
}

# 3. Create index.ts (follow the pattern above)

# 4. Initialize Pulumi
cd stacks/my-stack
pulumi stack init my-stack
pulumi config set aws:region us-east-1
```

## Working with Components

### ComponentResource Pattern

Create reusable infrastructure components:

```typescript
export class MyComponent extends ComponentResource {
  public readonly outputProperty: Output<string>;

  constructor(name: string, args: MyComponentArgs, opts?: ComponentResourceOptions) {
    super("custom:namespace:MyComponent", name, opts);

    // Create resources with parent: this
    const resource = new SomeResource("child", {...}, { parent: this });

    // Export properties
    this.outputProperty = resource.property;

    this.registerOutputs({
      outputProperty: this.outputProperty,
    });
  }
}
```

### Accessing Provider from Parent

```typescript
// In DockgeLxc (child of ProxmoxHost)
constructor(name: string, args: DockgeLxcArgs) {
  super("home:dockge:DockgeLxc", name, {}, { parent: args.host });
  
  // Get parent's provider
  const pveProvider = args.host.pveProvider;
  
  // Use parent's properties
  const host = args.host.hostname;
}
```

### Remote Execution

Execute commands on remote hosts:

```typescript
import { remote, types } from "@pulumi/command";

const connection: types.input.remote.ConnectionArgs = {
  host: this.internalIpAddress,
  user: "root",
  privateKey: fs.readFileSync(keyPath),
};

const cmd = new remote.Command("setup", {
  connection,
  create: "apt-get update && apt-get install -y docker.io",
}, { parent: this });
```

## Working with Docker Services

### Docker Compose Structure

```yaml
version: '3.8'
services:
  myservice:
    image: myimage:latest
    container_name: myservice
    environment:
      CONFIG_VAR: ${CONFIG_VAR}
    volumes:
      - ./config:/etc/myservice
      - data:/app/data
    networks:
      - traefik
    labels:
      traefik.enable: "true"
      traefik.http.routers.myservice.rule: "Host(`myservice.example.com`)"
    restart_policy:
      condition: on-failure

volumes:
  data:

networks:
  traefik:
    external: true
```

### Adding a Service via DockgeLxc

```typescript
const dockge = new DockgeLxc("celestia-dockge", { ... });

// Add mount point
dockge.addHostMount("/data");
dockge.addHostMount("/mnt/backups", "/backups");

// Register service for Tailscale discovery
dockge.registerTailscaleService("myservice");
```

## Safety & Best Practices

### 1. Credentials

```typescript
// GOOD: From 1Password
const cred = output(op.getItemByTitle("Service Name"));

// BAD: Plaintext in code
const password = "my-secret-password";  // NEVER
```

### 2. Preview Before Deploy

```bash
# ALWAYS run preview first
pulumi preview

# Review the output carefully
# Then deploy
pulumi up --yes
```

### 3. Test Risky Changes

```bash
# Test on non-production first
cd stacks/home
# Make changes (provider config, DNS, etc.)
pulumi preview      # Review impact

# Instead, test on alpha-site first
cd stacks/alpha-site
# Apply same changes
pulumi preview
pulumi up --yes
```

### 4. Provider Isolation

```typescript
// GOOD: Use centralized provider
const cfProvider = globals.cloudflareProvider;

// BAD: Creates duplicate
const cfProvider = new CloudflareProvider("cf", {...});
```

### 5. Minio Bucket Protection

```typescript
// Prevent accidental deletion
new minio.S3Bucket("important", {...}, {
  protect: true,          // Cannot be deleted without --force
  retainOnDelete: true,   // Data retained on stack destroy
});
```

### 6. State Management

```bash
# Never commit encrypted state files
git status  # Should ignore Pulumi.*.yaml

# Backup state regularly
pulumi stack export > backup.json
pulumi stack import < backup.json

# Never manually edit state
# Always use pulumi commands
```

## Debugging

### 1. Check Pulumi Logs

```bash
cd stacks/home
pulumi up --yes --logtostderr=true 2>&1 | tee deploy.log
```

### 2. Inspect Stack State

```bash
pulumi stack output hostname
pulumi stack select  # Switch between stacks
pulumi config get   # View stack config
```

### 3. Check 1Password Integration

```bash
# Test OPClient directly
cd stacks/home
node -e "
import { OPClient } from '../../components/op.ts';
const op = new OPClient();
console.log(await op.getItemByTitle('Proxmox'));
"
```

### 4. Test Remote Connection

```bash
# SSH to remote host
ssh -i ~/.ssh/id_rsa root@100.111.10.103  # Tailscale IP

# Check services
docker ps
docker logs container-name
systemctl status tailscaled
```

### 5. Check Pulumi Program Execution

```bash
# Pulumi runs TypeScript directly via tsx
# Check for syntax errors
npx tsc --noEmit stacks/home/index.ts

# Trace execution
DEBUG=* pulumi preview
```

## Common Tasks

### Deploy a New Service

1. Create docker-compose.yml in `docker/_common/myservice/`
2. Create component (optional): `components/MyService.ts`
3. Use in stack:
   ```typescript
   const myService = new DockgeLxc("name", {...});
   myService.registerExternalService({
     name: "myservice",
     hostname: "myservice.example.com",
     backend: "localhost:8080",
   });
   ```
4. Deploy: `cd stacks/home && pulumi up --yes`

### Add New Cluster

1. Create 1Password item with ClusterDefinition
2. Reference in stack:
   ```typescript
   const cluster = pulumi.output(op.getItemByTitle("Cluster: NewName"))
     .apply(createClusterDefinition);
   ```
3. Create ProxmoxHost or DockgeLxc
4. Deploy infrastructure

### Rotate Credentials

1. Update 1Password item
2. Run stack again:
   ```bash
   cd stacks/home
   pulumi refresh  # Reload credentials
   pulumi up --yes
   ```

### Backup Stack State

```bash
# Export state
pulumi stack export > stack-backup.json

# Import state
pulumi stack import < stack-backup.json

# Copy to 1Password
op item create --category="secureNote" \
  --title="Pulumi Stack Backup" \
  --body="$(cat stack-backup.json)"
```

## Useful Commands

```bash
# Preview and show summary
pulumi preview --summary

# Deploy with specific stack
pulumi -C stacks/home up --yes

# Refresh remote state
pulumi refresh

# Destroy stack
pulumi destroy --yes

# Export outputs
pulumi stack output -j > outputs.json

# List all stacks
pulumi stack ls

# Get plugin info
pulumi plugin list
```

## Documentation

- **Architectural Guides:** See `docs/CODEMAPS/`
  - [INDEX.md](CODEMAPS/INDEX.md) — Start here
  - [ARCHITECTURE.md](CODEMAPS/ARCHITECTURE.md) — System design
  - [PULUMI_COMPONENTS.md](CODEMAPS/PULUMI_COMPONENTS.md) — Component reference
  - [PULUMI_STACKS.md](CODEMAPS/PULUMI_STACKS.md) — Stack reference
  - [VENDOR_SDKS.md](CODEMAPS/VENDOR_SDKS.md) — SDK documentation
  - [DYNAMIC_RESOURCES.md](CODEMAPS/DYNAMIC_RESOURCES.md) — Code-generated resources
  - [DOCKER_STACK.md](CODEMAPS/DOCKER_STACK.md) — Docker services

- **Developer Guides:**
  - [CLAUDE.md](../CLAUDE.md) — Workflow & conventions
  - [AGENTS.md](../AGENTS.md) — Agent strategy

- **Docker:**
  - [docs/docker/](../docker/) — Docker-specific docs

- **Kubernetes:**
  - [docs/kubernetes/](../kubernetes/) — K8s guides

## Next Steps

1. **Read** [docs/CODEMAPS/INDEX.md](CODEMAPS/INDEX.md) for architectural overview
2. **Explore** `components/globals.ts` to understand provider initialization
3. **Review** `stacks/home/index.ts` for canonical stack pattern
4. **Study** `stacks/authentik/index.ts` for 1Password output pattern
5. **Clone** existing component for new infrastructure
6. **Deploy** using `pulumi preview && pulumi up --yes`

## Key Files to Know

| File | Purpose |
|------|---------|
| components/globals.ts | Provider initialization |
| components/op.ts | 1Password integration |
| components/ProxmoxHost.ts | Proxmox host management |
| components/DockgeLxc.ts | Docker LXC containers |
| stacks/home/index.ts | Core infrastructure |
| stacks/authentik/index.ts | Authentik setup (1Password output example) |
| .mise.toml | Tool versions & environment |
| Pulumi.yaml | Stack runtime config |

## Getting Help

1. Check relevant CODEMAPS documentation
2. Search for similar patterns in existing code
3. Check Pulumi provider documentation
4. Review 1Password item definitions
5. Test with `pulumi preview` first
6. Check logs with `--logtostderr=true`

## See Also

- [CODEMAPS/INDEX.md](CODEMAPS/INDEX.md) — Architecture documentation
- [CLAUDE.md](../CLAUDE.md) — Developer workflow
- Pulumi Docs: https://www.pulumi.com/docs/
- 1Password Connect: https://developer.1password.com/docs/connect/

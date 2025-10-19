/**
 * TypeScript type definitions for Tailscale Grants
 * Based on: https://tailscale.com/kb/1538/grants-syntax
 *
 * Grants provide unified access control combining network layer and application layer capabilities.
 * They follow a deny-by-default principle where access must be explicitly granted.
 */

// ============================================================================
// Well-known Tags (based on your configuration)
// ============================================================================

/**
 * Known Tailscale tags used in this tailnet
 */
export type TailscaleTags =
  | "tag:secure-server"
  | "tag:proxmox"
  | "tag:ci-server"
  | "tag:operator"
  | "tag:sgc"
  | "tag:equestria"
  | "tag:ingress"
  | "tag:egress"
  | "tag:apps"
  | "tag:media-device"
  | "tag:exit-node"
  | "tag:recorder"
  | "tag:dockge"
  | "tag:automation-agent"
  | `tag:${string}`; // Any other custom tag

// ============================================================================
// Well-known Groups (based on your configuration)
// ============================================================================

/**
 * Known groups in this tailnet
 */
export type TailscaleGroups = "group:me" | "group:admins" | "group:media-managers" | "group:family" | "group:friends" | `group:${string}`; // Any other custom group

/**
 * Tailscale autogroups - built-in groups for specific roles
 */
export type TailscaleAutogroups =
  | "autogroup:admin"
  | "autogroup:member"
  | "autogroup:owner"
  | "autogroup:it-admin"
  | "autogroup:network-admin"
  | "autogroup:billing-admin"
  | "autogroup:auditor"
  | "autogroup:tagged" // All devices with any tag
  | "autogroup:shared" // Devices from users who accepted sharing invitation
  | "autogroup:internet" // Special destination for exit node internet access
  | "autogroup:self"; // User's own devices

/**
 * All group types combined
 */
export type TailscaleAllGroups = TailscaleGroups | TailscaleAutogroups;

// ============================================================================
// Host Aliases (based on your configuration)
// ============================================================================

/**
 * Known host aliases defined in the hosts section
 */
export type TailscaleHostAliases = "idp" | "primary-dns" | "secondary-dns" | "unifi-dns";

// ============================================================================
// Postures (based on your configuration)
// ============================================================================

/**
 * Known device posture conditions
 */
export type TailscalePostures = "posture:not-linux" | "posture:linux" | `posture:${string}`; // Any other custom posture

// ============================================================================
// IP Sets
// ============================================================================

/**
 * Named groups of IP address ranges
 * Format: ipset:<name>
 */
export type TailscaleIpSet = `ipset:${string}`;

// ============================================================================
// Source Selectors
// ============================================================================

/**
 * Valid source selectors for grants
 * Sources define the network entities that initiate connections
 */
export type TailscaleSelector =
  | "*" // All sources in tailnet and approved subnet routes
  | TailscaleAllGroups
  | TailscaleTags
  | TailscaleHostAliases
  | TailscaleIpSet
  | `${number}.${number}.${number}.${number}` // Single IP
  | `${number}.${number}.${number}.${number}/${number}`; // CIDR range

// ============================================================================
// Network Layer Capabilities (IP)
// ============================================================================

/**
 * IANA protocol names and their aliases
 */
export type TailscaleProtocol =
  | "igmp" // Internet Group Management (2)
  | "ipv4"
  | "ip-in-ip" // IPv4 encapsulation (4)
  | "tcp" // Transmission Control (6)
  | "egp" // Exterior Gateway Protocol (8)
  | "igp" // Any private interior gateway (9)
  | "udp" // User Datagram (17)
  | "gre" // Generic Routing Encapsulation (47)
  | "esp" // Encap Security Payload (50)
  | "ah" // Authentication Header (51)
  | "icmp" // Internet Control Message Protocol (1)
  | "sctp" // Stream Control Transmission Protocol (132)
  | `${number}`; // IANA protocol number (1-255)

/**
 * Port specification - single port or range
 */
export type TailscalePort = number | `${number}-${number}`;

/**
 * Network layer capability selectors
 */
export type TailscaleNetworkCapability =
  | "*" // All ports, all protocols (TCP, UDP, ICMP)
  | TailscalePort // Specific port or range (implies TCP, UDP, ICMP)
  | `${TailscaleProtocol}:*` // All ports of specific protocol
  | `${TailscaleProtocol}:${number}` // Protocol and port
  | `${TailscaleProtocol}:${number}-${number}`; // Protocol and port range

// ============================================================================
// Application Layer Capabilities
// ============================================================================

/**
 * Tailscale Drive capability - file sharing
 */
export interface TailscaleDriveCapability {
  /**
   * Access level: read-only (r) or read-write (rw)
   */
  access: "r" | "rw";

  /**
   * Share names or wildcard
   */
  shares: string[];
}

/**
 * Tailscale GoLink capability - short link management
 */
export interface TailscaleGoLinkCapability {
  /**
   * Grant administrative privileges
   */
  admin: boolean;
}

/**
 * Tailscale Identity Provider capability
 */
export interface TailscaleTsidpCapability {
  /**
   * Include extra claims in user info
   */
  includeInUserInfo?: boolean;

  /**
   * Additional claims to include
   */
  extraClaims?: {
    groups?: string[];
    entitlements?: string[];
    [key: string]: any;
  };
}

/**
 * Tailscale SQL capability - database access
 */
export interface TailscaleSqlCapability {
  /**
   * Data sources - specific names or wildcard
   */
  dataSrc: string[];
}

/**
 * Kubernetes impersonation capability
 */
export interface TailscaleKubernetesCapability {
  /**
   * Impersonation settings
   */
  impersonate?: {
    groups?: string[];
    users?: string[];
  };
}

/**
 * App Connectors capability
 */
export interface TailscaleAppConnectorsCapability {
  // Empty object for enabling app connectors
}

/**
 * Known Tailscale application capabilities
 * Applications define capabilities in format: <domainName>/<capabilityName>
 */
export type TailscaleAppCapabilities = {
  /**
   * Tailscale Drive - file sharing capability
   */
  "tailscale.com/cap/drive"?: TailscaleDriveCapability[];

  /**
   * Tailscale GoLink - short link management
   */
  "tailscale.com/cap/golink"?: TailscaleGoLinkCapability[];

  /**
   * Tailscale Identity Provider - OIDC integration
   */
  "tailscale.com/cap/tsidp"?: TailscaleTsidpCapability[];

  /**
   * TailSQL - database access
   */
  "tailscale.com/cap/tailsql"?: TailscaleSqlCapability[];

  /**
   * Kubernetes - cluster access and impersonation
   */
  "tailscale.com/cap/kubernetes"?: TailscaleKubernetesCapability[];

  /**
   * App Connectors - enable app connector functionality
   */
  "tailscale.com/app-connectors"?: TailscaleAppConnectorsCapability[];

  /**
   * Custom application capabilities
   * Use your own domain to avoid conflicts: <your-domain>/<capability-name>
   */
  [key: string]: any[] | undefined;
};

// ============================================================================
// Grant Definition
// ============================================================================

/**
 * A grant defines access control rules combining network and application capabilities
 * All grants follow a deny-by-default principle
 */
export interface TailscaleGrant {
  /**
   * Source selectors - who can initiate connections
   * REQUIRED field
   */
  src: TailscaleSelector[];

  /**
   * Destination selectors - what resources can be accessed
   * REQUIRED field
   */
  dst: TailscaleSelector[];

  /**
   * Network layer capabilities - ports and protocols
   * OPTIONAL: Must include this field, app field, or both
   */
  ip?: TailscaleNetworkCapability[];

  /**
   * Application layer capabilities - fine-grained app permissions
   * OPTIONAL: Must include this field, ip field, or both
   */
  app?: TailscaleAppCapabilities;

  /**
   * Device posture requirements - restrict source based on device state
   * OPTIONAL: Additional conditions on the source
   */
  srcPosture?: TailscalePostures[];

  /**
   * Routing specifications - force traffic through specific routers
   * OPTIONAL: Must be tags only, for exit nodes, subnet routers, or app connectors
   */
  via?: TailscaleTags[];
}

// ============================================================================
// SSH Rules
// ============================================================================

/**
 * SSH action types
 */
export type TailscaleSshAction = "accept" | "check";

/**
 * SSH user selectors
 */
export type TailscaleSshUser = "root" | "autogroup:nonroot" | string; // Any other username

/**
 * SSH access rule
 */
export interface TailscaleSshRule {
  /**
   * Source selectors - who can SSH
   */
  src: TailscaleSelector[];

  /**
   * Destination selectors - what machines can be accessed
   */
  dst: TailscaleSelector[];

  /**
   * Allowed SSH users
   */
  users: TailscaleSshUser[];

  /**
   * Action to take: accept or check
   */
  action: TailscaleSshAction;
}

// ============================================================================
// Node Attributes
// ============================================================================

/**
 * Known node attributes
 */
export type TailscaleNodeAttrValue =
  | "mullvad" // Mullvad exit node
  | "drive:access" // Tailscale Drive access
  | "drive:share" // Tailscale Drive sharing
  | string; // Custom attributes

/**
 * Node attribute assignment
 */
export interface TailscaleNodeAttr {
  /**
   * Target devices - IP addresses or selectors
   */
  target: (TailscaleSelector | `${number}.${number}.${number}.${number}`)[];

  /**
   * Attributes to assign
   */
  attr?: TailscaleNodeAttrValue[];

  /**
   * Application capabilities to enable on these nodes
   */
  app?: TailscaleAppCapabilities;
}

// ============================================================================
// Auto Approvers
// ============================================================================

/**
 * Automatic approval configuration for routes and services
 */
export interface TailscaleAutoApprovers {
  /**
   * Auto-approve exit node advertisements
   */
  exitNode?: TailscaleSelector[];

  /**
   * Auto-approve subnet route advertisements
   * Keys are CIDR ranges, values are approver selectors
   */
  routes?: {
    [cidr: string]: TailscaleSelector[];
  };

  /**
   * Auto-approve service advertisements (ingress/egress)
   * Keys are service tags, values are approver selectors
   */
  services?: {
    [service: string]: TailscaleSelector[];
  };
}

// ============================================================================
// Tests
// ============================================================================

/**
 * Network protocol for tests
 */
export type TailscaleTestProtocol = "tcp" | "udp" | "icmp";

/**
 * Network connectivity test
 */
export interface TailscaleTest {
  /**
   * Source selector
   */
  src: TailscaleSelector;

  /**
   * Expected accessible destinations with ports
   * Format: "destination:port" or just "destination"
   */
  accept: string[];

  /**
   * Protocol to test
   */
  proto: TailscaleTestProtocol;
}

/**
 * SSH connectivity test
 */
export interface TailscaleSshTest {
  /**
   * Source selector
   */
  src: TailscaleSelector;

  /**
   * Destination selectors
   */
  dst: TailscaleSelector[];

  /**
   * Expected accessible SSH users
   */
  accept?: TailscaleSshUser[];

  /**
   * Expected denied SSH users
   */
  deny?: TailscaleSshUser[];
}

// ============================================================================
// Posture Definitions
// ============================================================================

/**
 * Device posture condition definition
 * Conditions are expressions evaluated on the device
 */
export type TailscalePostureCondition = string; // e.g., "node:os != 'linux'"

/**
 * Posture definitions map
 * Keys are posture names (posture:name), values are condition arrays
 */
export type TailscalePostureDefinitions = {
  [key: TailscalePostures | string]: TailscalePostureCondition[];
};

// ============================================================================
// Complete Policy File Structure
// ============================================================================

/**
 * Tag ownership map
 * Defines who can assign and manage each tag
 */
export type TailscaleTagOwners = {
  [key: TailscaleTags | string]: TailscaleSelector[];
};

/**
 * Group membership map
 * Defines which users belong to each group
 */
export type TailscaleGroupDefinitions = {
  [key: TailscaleGroups | string]: string[];
};

/**
 * Host alias map
 * Defines friendly names for IP addresses or CIDR ranges
 */
export type TailscaleHosts = {
  [key: TailscaleHostAliases | string]: string; // IP address or CIDR
};

/**
 * Complete Tailscale policy file structure (grants section)
 */
export interface TailscalePolicyFile {
  /**
   * Tag ownership definitions
   */
  tagOwners?: TailscaleTagOwners;

  /**
   * Group membership definitions
   */
  groups?: TailscaleGroupDefinitions;

  /**
   * Host alias definitions
   */
  hosts?: TailscaleHosts;

  /**
   * Access grants - core access control rules
   */
  grants?: TailscaleGrant[];

  /**
   * SSH access rules
   */
  ssh?: TailscaleSshRule[];

  /**
   * Node attribute assignments
   */
  nodeAttrs?: TailscaleNodeAttr[];

  /**
   * Auto-approval configuration
   */
  autoApprovers?: TailscaleAutoApprovers;

  /**
   * Network connectivity tests
   */
  tests?: TailscaleTest[];

  /**
   * SSH connectivity tests
   */
  sshTests?: TailscaleSshTest[];

  /**
   * Device posture definitions
   */
  postures?: TailscalePostureDefinitions;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type {
  TailscaleGrant as Grant,
  TailscaleSshRule as SshRule,
  TailscaleNodeAttr as NodeAttr,
  TailscaleAutoApprovers as AutoApprovers,
  TailscaleTest as Test,
  TailscaleSshTest as SshTest,
  TailscalePolicyFile as PolicyFile,
};

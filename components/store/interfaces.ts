export type ClusterDefinition = DockgeClusterDefinition | KubernetesClusterDefinition;

export interface DockgeClusterDefinition {
  type: "dockge";
  itemTitle: string;
  key: string;
  title: string;
  rootDomain: string;
  authentikDomain: string;
  icon?: string;
  background?: string;
  favicon?: string;
}

export interface KubernetesClusterDefinition {
  type: "kubernetes";
  itemTitle: string;
  key: string;
  title: string;
  rootDomain: string;
  authentikDomain: string;
  secret: string;
  icon?: string;
  background?: string;
  favicon?: string;
}

export interface DockgeLxcDefinition {
  hostname: string;
  ipAddress: string;
  tailscaleIpAddress: string;
  name: string;
  backrest: {
    privateKey: string;
    publicKey: string;
    privateKeyId: string;
  };
  ssh: {
    hostname: string;
    username: string;
  };
  title: string;
  tags: string[];
}

export interface ProxmoxBackupServerLxcDefinition {
  hostname: string;
  username: string;
  password: string;
  webUrl: string;
  backrest: {
    privateKey: string;
    publicKey: string;
    privateKeyId: string;
  };
  ssh: {
    hostname: string;
    username: string;
  };
  title: string;
  tags: string[];
  dockge: DockgeLxcDefinition;
  cluster: DockgeClusterDefinition;
}

export interface SshKeyDefinition {
  "public key": string;
  "private key": string;
  fingerprint: string;
  "key type": string;
}

export interface CredentialDefinition {
  username: string;
  credential: string;
}

export interface PasswordDefinition {
  username: string;
  password: string;
}

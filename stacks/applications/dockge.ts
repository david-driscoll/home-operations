import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { ApplicationDefinition, AuthentikApplicationManager } from "../../components/authentik.ts";
import { GlobalResources, DockgeClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { ApplicationCertificate } from "@components/authentik/application-certificate.ts";
import * as yaml from "yaml";
import { execSync } from "child_process";

const op = new OPClient();

export async function dockgeApplications(globals: GlobalResources, clusterDefinition: DockgeClusterDefinition, applicationManager: AuthentikApplicationManager) {
  const certificate = new ApplicationCertificate(clusterDefinition.name, { globals });

  const serviceConnection = new authentik.ServiceConnectionDocker(clusterDefinition.name, {
    name: clusterDefinition.name,
    url: `ssh://root@${clusterDefinition.rootDomain}`,
    tlsAuthentication: certificate.signingKey.certificateKeyPairId,
  });

  // Create the main Dockge application
  applicationManager.createApplication({
    name: "dockge",
    category: clusterDefinition.title,
    title: "Dockge",
    description: "Access to the Dockge",
    url: `https://dockge.${clusterDefinition.rootDomain}`,
    icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/dockge.svg",
  });

  // Sync applications from Dockge stacks with definition.yaml files
  const syncResults = syncDockgeApplications(
    {
      host: clusterDefinition.rootDomain,
      username: "root", // TODO: Replace with actual SSH username
      privateKeyPath: "/path/to/ssh/key", // TODO: Replace with actual SSH key path
      stacksBasePath: "/opt/stacks",
      environment: {
        CLUSTER_TITLE: clusterDefinition.title,
        CLUSTER_DOMAIN: clusterDefinition.rootDomain,
      },
    },
    applicationManager
  );

  return {
    serviceConnectionId: serviceConnection.serviceConnectionDockerId,
    syncResults,
  };
}

export interface DockgeSyncOptions {
  /**
   * SSH host for the Dockge instance
   */
  host: string;

  /**
   * SSH port (default: 22)
   */
  port?: number;

  /**
   * SSH username
   */
  username: string;

  /**
   * SSH private key path
   */
  privateKeyPath: string;

  /**
   * Base path where stacks are stored (default: /opt/stacks)
   */
  stacksBasePath?: string;

  /**
   * Optional: Environment variables to substitute in definition files
   */
  environment?: Record<string, string>;
}

export interface ApplicationDefinitionFile {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
  };
  spec: {
    name: string;
    slug?: string;
    icon?: string;
    url?: string;
    description?: string;
    category: string;
    access_policy?: {
      entitlements?: string[];
      groups?: string[];
    };
    authentik?: any;
    uptime?: any;
  };
}

/**
 * Sync application definitions from a Dockge instance via SSH
 */
export function syncDockgeApplications(options: DockgeSyncOptions, applicationManager: AuthentikApplicationManager): ApplicationSyncResult[] {
  const opts: Required<DockgeSyncOptions> = {
    port: 22,
    stacksBasePath: "/opt/stacks",
    environment: {},
    ...options,
  };

  // Step 1: List all stack directories
  console.log(`Discovering stacks on ${opts.host}...`);
  const stacks = listStacks(opts);
  console.log(`Found ${stacks.length} stacks: ${stacks.join(", ")}`);

  // Step 2: For each stack, check if definition.yaml exists and read it
  const definitions: ApplicationDefinitionFile[] = [];
  for (const stackName of stacks) {
    const definition = readDefinition(stackName, opts);
    if (definition) {
      definitions.push(definition);
    }
  }

  console.log(`Found ${definitions.length} application definitions`);

  // Step 3: Create applications from definitions
  const results: ApplicationSyncResult[] = [];
  for (const definition of definitions) {
    const result = createApplicationFromDefinition(definition, applicationManager);
    results.push(result);
  }

  return results;
}

/**
 * List all stack directories in the Dockge stacks path
 */
function listStacks(options: Required<DockgeSyncOptions>): string[] {
  const sshCommand = `ssh -p ${options.port} -i ${options.privateKeyPath} -o StrictHostKeyChecking=no ${options.username}@${options.host} "ls -1 ${options.stacksBasePath}"`;

  try {
    const output = execSync(sshCommand, { encoding: "utf-8" });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    console.error(`Failed to list stacks: ${error}`);
    return [];
  }
}

/**
 * Read definition.yaml from a specific stack
 */
function readDefinition(stackName: string, options: Required<DockgeSyncOptions>): ApplicationDefinitionFile | null {
  const definitionPath = `${options.stacksBasePath}/${stackName}/definition.yaml`;
  const sshCommand = `ssh -p ${options.port} -i ${options.privateKeyPath} -o StrictHostKeyChecking=no ${options.username}@${options.host} "if [ -f ${definitionPath} ]; then cat ${definitionPath}; else echo 'FILE_NOT_FOUND'; fi"`;

  try {
    const content = execSync(sshCommand, { encoding: "utf-8" });

    if (content.trim() === "FILE_NOT_FOUND" || content.trim() === "") {
      console.log(`  No definition.yaml found for stack: ${stackName}`);
      return null;
    }

    // Substitute environment variables in the YAML content
    const substitutedContent = substituteVariables(content, options.environment);
    const parsed = yaml.parse(substitutedContent) as ApplicationDefinitionFile;

    // Validate that it's an ApplicationDefinition
    if (parsed.kind !== "ApplicationDefinition") {
      console.warn(`  Skipping ${stackName}: not an ApplicationDefinition (kind: ${parsed.kind})`);
      return null;
    }

    console.log(`  Found application definition: ${parsed.metadata.name} (${stackName})`);
    return parsed;
  } catch (error) {
    console.error(`  Failed to parse definition.yaml for ${stackName}: ${error}`);
    return null;
  }
}

/**
 * Substitute environment variables in content
 */
function substituteVariables(content: string, environment: Record<string, string>): string {
  let result = content;

  for (const [key, value] of Object.entries(environment)) {
    // Replace ${VAR} and $VAR patterns
    const regex1 = new RegExp(`\\$\\{${key}\\}`, "g");
    const regex2 = new RegExp(`\\$${key}\\b`, "g");
    result = result.replace(regex1, value);
    result = result.replace(regex2, value);
  }

  return result;
}

/**
 * Create an application from a parsed definition
 */
function createApplicationFromDefinition(definition: ApplicationDefinitionFile, applicationManager: AuthentikApplicationManager): ApplicationSyncResult {
  const spec = definition.spec;

  // Map the definition spec to ApplicationDefinition format
  const appDefinition: ApplicationDefinition = {
    name: spec.slug || definition.metadata.name,
    title: spec.name,
    slug: spec.slug,
    icon: spec.icon,
    url: spec.url,
    description: spec.description,
    category: spec.category,
    accessPolicy: spec.access_policy
      ? {
          entitlements: spec.access_policy.entitlements,
          groups: spec.access_policy.groups as any,
        }
      : undefined,
    authentik: mapAuthentikConfig(spec.authentik),
  };

  console.log(`  Creating application: ${spec.name}`);

  // Create the application using the application manager
  const result = applicationManager.createApplication(appDefinition);

  return {
    stackName: definition.metadata.name,
    applicationName: spec.name,
    created: true,
    app: result.app,
    provider: result.provider,
  };
}

/**
 * Map authentik configuration from YAML to ApplicationDefinitionAuthentik
 */
function mapAuthentikConfig(authentikConfig: any): any {
  if (!authentikConfig) {
    return undefined;
  }

  // Map the YAML structure to the expected format
  return {
    providerProxy: authentikConfig.proxy
      ? {
          mode: authentikConfig.proxy.mode,
          externalHost: authentikConfig.proxy.externalHost,
          internalHost: authentikConfig.proxy.internalHost,
          skipPathRegex: authentikConfig.proxy.skipPathRegex,
        }
      : undefined,
    providerOauth2: authentikConfig.oauth2,
    providerLdap: authentikConfig.ldap,
    providerSaml: authentikConfig.saml,
    providerRac: authentikConfig.rac,
    providerRadius: authentikConfig.radius,
    providerSsf: authentikConfig.ssf,
    providerScim: authentikConfig.scim,
    providerMicrosoftEntra: authentikConfig.microsoftEntra,
    providerGoogleWorkspace: authentikConfig.googleWorkspace,
  };
}

export interface ApplicationSyncResult {
  stackName: string;
  applicationName: string;
  created: boolean;
  app: any;
  provider?: any;
}

import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { AuthentikApplicationManager } from "../../components/authentik.ts";
import { GlobalResources, DockgeClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { ApplicationCertificate } from "@components/authentik/application-certificate.ts";
import * as yaml from "yaml";
import { execSync } from "child_process";
import { NodeSSH } from "node-ssh";
import { host } from "@pulumi/docker/config/vars.js";
import { user } from "@muhlba91/pulumi-proxmoxve";
import type { ApplicationDefinitionSchema } from "@openapi/application-definition.d.ts";

type ApplicationDefinition = ApplicationDefinitionSchema["spec"];

export async function dockgeApplications(globals: GlobalResources, clusterDefinition: DockgeClusterDefinition, applicationManager: AuthentikApplicationManager) {
  const ssh = new NodeSSH();
  const op = new OPClient();

  const lxcData = await op.getItemByTitle(`DockgeLxc: ${clusterDefinition.title}`);
  await ssh.connect({
    host: lxcData.sections.ssh.fields.hostname.value,
    username: "root",
    // should be fine, tailscale does the auth between nodes.
    // password: lxcData.sections.ssh.fields.password.value,
  });

  const stacks = await ssh.execCommand("ls -1 /opt/stacks").then((result) => {
    if (result.stderr) {
      console.error(`Error listing stacks: ${result.stderr}`);
      return [];
    }
    return result.stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.trim());
  });
  pulumi.log.info(`Found stacks: ${stacks.join(", ")}`);

  // Create the main Dockge application
  applicationManager.createApplication({
    metadata: {
      name: "dockge",
      namespace: clusterDefinition.key,
    },
    spec: {
      name: "Dockge",
      category: clusterDefinition.title,
      description: "Access to the Dockge",
      url: `https://dockge.${clusterDefinition.rootDomain}`,
      icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/dockge.svg",
    },
  });

  for (const stack of stacks) {
    const definition = await readDefinition(ssh, stack);
    if (!definition) {
      continue;
    }
    applicationManager.createApplication(definition);
  }

  // const certificate = new ApplicationCertificate(clusterDefinition.key, { globals });

  const serviceConnection = new authentik.ServiceConnectionDocker(
    clusterDefinition.key,
    {
      name: clusterDefinition.key,
      url: pulumi.interpolate`ssh://root@${lxcData.sections.ssh.fields.hostname.value}`,
    },
    { deleteBeforeReplace: true, parent: applicationManager },
  );

  ssh.dispose();

  return {
    serviceConnectionId: serviceConnection.serviceConnectionDockerId,
    stacks,
  };
}

/**
 * Read definition.yaml from a specific stack
 */
async function readDefinition(ssh: NodeSSH, stackName: string): Promise<ApplicationDefinitionSchema | null> {
  const definitionPath = `/opt/stacks/${stackName}/definition.yaml`;

  try {
    const result = await ssh.execCommand(`if [ -f ${definitionPath} ]; then cat ${definitionPath}; else echo 'FILE_NOT_FOUND'; fi`);
    const content = result.stdout;

    if (content.trim() === "FILE_NOT_FOUND" || content.trim() === "") {
      pulumi.log.warn(`No definition.yaml found for stack: ${stackName}`);
      return null;
    }

    const parsed = yaml.parse(content) as ApplicationDefinitionSchema;

    pulumi.log.info(`Found application definition: ${parsed.metadata.name} (${stackName})`);
    return parsed;
  } catch (error) {
    pulumi.log.error(`Failed to read definition.yaml for ${stackName}: ${error}`);
    throw error;
  }
}

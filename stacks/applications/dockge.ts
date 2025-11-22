import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { AuthentikApplicationManager, AuthentikOutputs } from "../../components/authentik.ts";
import { GlobalResources, DockgeClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import * as yaml from "yaml";
import { NodeSSH } from "node-ssh";
import type { ApplicationDefinitionSchema, GatusDefinition } from "@openapi/application-definition.d.ts";
import * as authentikApi from "@goauthentik/api";
import { addUptimeGatus, copyFileToRemote, awaitOutput as outToPromise, writeTempFile } from "@components/helpers.ts";

export async function dockgeApplications(globals: GlobalResources, outputs: AuthentikOutputs, clusterDefinition: DockgeClusterDefinition) {
  const ssh = new NodeSSH();
  const op = new OPClient();

  const authentikToken = await op.getItemByTitle("Authentik Token");

  const applicationManager = new AuthentikApplicationManager({
    globals,
    outputs,
    authentikCredential: "Authentik Outputs",
    cluster: clusterDefinition,
    async loadFromResource(application, kind, { name }) {
      const result = await ssh.execCommand(`cat ${name}`);
      if (result.stderr) {
        throw new Error(`Error reading file ${name}: ${result.stderr}`);
      }

      const parsed = yaml.parse(result.stdout);

      return parsed;
    },
    async createGatus(name, definition, gatusDefinitions) {
      const gatusConfigPath = writeTempFile(`${clusterDefinition.key}-gatus-${name}.yaml`, yaml.stringify({ endpoints: gatusDefinitions }));
      await ssh.execCommand(`mkdir -p /opt/stacks/gatus/config/applications/`);
      await ssh.putFile(await outToPromise(gatusConfigPath), `/opt/stacks/gatus/config/applications/${name}.yaml`);
    },
  });

  const lxcData = await op.getItemByTitle(`DockgeLxc: ${clusterDefinition.title}`);
  try {
    await ssh.connect({
      debug: (msg) => pulumi.log.debug(`SSH: ${msg}`),
      host: lxcData.sections.ssh.fields.hostname.value,
      username: "root",
      // should be fine, tailscale does the auth between nodes.
      // password: lxcData.sections.ssh.fields.password.value,
    });
  } catch (error) {
    pulumi.log.error(`Failed to connect to LXC ${lxcData.sections.ssh.fields.hostname.value} via SSH: ${error}`);
    throw error;
  }

  const stacks = await ssh.execCommand("ls -1 /opt/stacks").then((result) => {
    if (result.stderr) {
      pulumi.log.error(`Error listing stacks: ${result.stderr}`);
      return [];
    }
    return result.stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.trim());
  });

  pulumi.log.info(`Found stacks: ${stacks.join(", ")}`);

  // Create the main Dockge application
  await applicationManager.createApplication({
    metadata: {
      name: "dockge",
      namespace: clusterDefinition.key,
    },
    spec: {
      name: "Dockge",
      category: clusterDefinition.title,
      description: `Access to ${clusterDefinition.title} Dockge`,
      url: `https://dockge.${clusterDefinition.rootDomain}`,
      icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/dockge.svg",
      gatus: [
        {
          name: "Dockge",
          url: `https://dockge.${clusterDefinition.rootDomain}/health`,
          group: "System",
          method: "GET",
          conditions: ["[STATUS] == 200"],
        },
      ],
      authentik: {
        proxy: {
          mode: "forward_single",
          externalHost: `https://dockge.${clusterDefinition.rootDomain}`,
        },
      },
    },
  });

  for (const stack of stacks) {
    const definition = await readDefinition(ssh, stack);
    if (!definition) {
      continue;
    }
    await applicationManager.createApplication(definition);
  }

  addUptimeGatus(
    `${clusterDefinition.key}`,
    globals,
    {
      endpoints: pulumi.output(applicationManager.uptimeInstances).apply((instances) => instances.map((e) => yaml.parse(yaml.stringify(e, { lineWidth: 0 })) as GatusDefinition)),
    },
    applicationManager
  );

  const outpost = new authentik.Outpost(
    clusterDefinition.key,
    {
      type: "proxy",
      name: `Outpost for ${clusterDefinition.title}`,
      config: pulumi.jsonStringify({
        authentik_host: pulumi.interpolate`https://${clusterDefinition.authentikDomain}/`,
        authentik_host_insecure: false,
        // authentik_host_browser: `https://${clusterDefinition.authentikDomain}/`,
        log_level: "trace",
        object_naming_template: `authentik-outpost`,
        docker_network: "dockge_default",
      }),
      protocolProviders: applicationManager.proxyProviders,
    },
    { parent: applicationManager.outpostsComponent, deleteBeforeReplace: true }
  );
  const clientConfig = new authentikApi.Configuration({
    accessToken: authentikToken.fields.credential.value,
    basePath: `${authentikToken.fields.url.value}/api/v3/`,
  });

  const authentikCoreApi = new authentikApi.CoreApi(clientConfig);
  const outpostId = await outToPromise(outpost.id);
  const outpostToken = await authentikCoreApi.coreTokensViewKeyRetrieve({ identifier: `ak-outpost-${outpostId}-api` });

  const envValues = `AUTHENTIK_TOKEN=${outpostToken.key}`;
  const environmentConfig = copyFileToRemote(`${clusterDefinition.key}-authentik-outpost-env-token`, {
    connection: {
      host: lxcData.sections.ssh.fields.hostname.value!,
      user: "root",
    },
    remotePath: `/opt/stacks/authentik-outpost/.env-token`,
    content: envValues,
  });

  await outToPromise(environmentConfig.id);
  await ssh.execCommand(`docker compose -f compose.yaml up -d; docker compose -f compose.yaml start`, { cwd: `/opt/stacks/authentik-outpost/` });
  await ssh.execCommand(`docker compose -f compose.yaml up -d; docker compose -f compose.yaml start`, { cwd: `/opt/stacks/uptime/` });
  await ssh.execCommand(`docker compose -f compose.yaml up -d; docker compose -f compose.yaml start`, { cwd: `/opt/stacks/backups/` });

  ssh.dispose();

  return {
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

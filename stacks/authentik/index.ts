import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { OPClient } from "../../components/op.ts";
import { AuthentikGroups } from "./groups.ts";
import { FlowsManager } from "./flows.ts";
import { ApplicationResourcesManager, type ClusterDefinition } from "./application-resources.ts";
import { Roles } from "@components/constants.ts";

// Stack configuration
const config = new pulumi.Config();

// Initialize 1Password client
const opClient = new OPClient();

// Initialize groups
const authentikGroups = new AuthentikGroups({ parent: undefined });

// Initialize flows manager
const flowsManager = new FlowsManager({ parent: undefined });

// Create all flows
const authentikFlows = flowsManager.createFlows(opClient);

function exportFlows(flows: ReturnType<FlowsManager["createFlows"]>): { [K in keyof typeof flows]: pulumi.Output<string> } {
  return Object.fromEntries(Object.entries(flows).map(([key, flow]) => [key, flow.uuid])) as any;
}

function exportGroups(groups: AuthentikGroups): { [K in keyof AuthentikGroups]: pulumi.Output<string> } {
  return Object.fromEntries(Array.from(groups.allGroups).map(([key, group]) => [key, group.groupId])) as any;
}

function exportRoles(groups: AuthentikGroups): { [K in keyof AuthentikGroups]: pulumi.Output<string> } {
  return Object.fromEntries(Array.from(groups.allRoles).map(([key, role]) => [key, role.rbacRoleId])) as any;
}

function exportScopeMappings(flows: FlowsManager): { [key: string]: pulumi.Output<string> } {
  return Object.fromEntries(Array.from(flows.propertyMappings.allScopeMappings).map(([key, mapping]) => [key, mapping.scopeMappingId])) as any;
}

export const groups = exportGroups(authentikGroups);
export const roles = exportRoles(authentikGroups);
export const flows = exportFlows(authentikFlows);
export const scopeMappings = exportScopeMappings(flowsManager);

// // Define cluster information
// const clusterInfo: Record<string, ClusterDefinition> = {
//   sgc: {
//     metadata: { name: "sgc" },
//     spec: { domain: "https://authentik.driscoll.tech" },
//   },
//   eq: {
//     metadata: { name: "eq" },
//     spec: { domain: "https://authentik.driscoll.tech" },
//   },
// };

// Initialize application resources manager
const applicationResources = new ApplicationResourcesManager(
  {
    groups: authentikGroups,
    propertyMappings: flowsManager.propertyMappings,
    clusterFlows: {
      authorizationFlow: authentikFlows.implicitConsentFlow.uuid,
      authenticationFlow: authentikFlows.authenticationFlow.uuid,
      invalidationFlow: authentikFlows.providerLogoutFlow.uuid,
    },
    opClient,
  },
  { parent: undefined }
);

// Note: To complete the integration, you would need to:
// 1. Set up Kubernetes provider to read ApplicationDefinition CRDs
// 2. Call applicationResources.createApplications() with the CRD data
// 3. Configure additional brands per cluster if needed
//
// Example (when Kubernetes integration is ready):
// const k8sProvider = new k8s.Provider("k8s", {...});
// const applications = await getApplicationDefinitionsFromK8s(k8sProvider);
// await applicationResources.createApplications(applications);

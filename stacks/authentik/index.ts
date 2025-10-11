import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { OPClient, OPClientItem } from "../../components/op.ts";
import { AuthentikGroups } from "../../components/authentik/groups.ts";
import { FlowsManager } from "../../components/authentik/flows.ts";
import { ApplicationResourcesManager } from "../../components/authentik/application-resources.ts";
import { OnePasswordItem, OnePasswordItemFieldInput, OnePasswordItemInputs, OnePasswordItemSectionInput } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { FullItemAllOfFields } from "@1password/connect/dist/model/models.js";

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

function exportFields(section: { id: string; label: string }, value: { [key: string]: pulumi.Output<string> }): OnePasswordItemSectionInput {
  return {
    id: pulumi.output(section.id),
    label: pulumi.output(section.label),
    fields: pulumi.output(
      Object.fromEntries(
        Object.entries(value).map(([key, output]) => [
          key,
          {
            label: key,
            type: FullItemAllOfFields.TypeEnum.String,
            value: output,
            section,
          },
        ])
      )
    ),
    files: {},
  };
}

export const groups = exportGroups(authentikGroups);
export const roles = exportRoles(authentikGroups);
export const flows = exportFlows(authentikFlows);
export const scopeMappings = exportScopeMappings(flowsManager);

const authentikSecret = new OnePasswordItem("authentik-outputs", {
  category: FullItem.CategoryEnum.SecureNote,
  title: "Authentik Outputs",
  fields: {
    ["notePlain"]: {
      label: "Note",
      purpose: FullItemAllOfFields.PurposeEnum.Notes,
      type: FullItemAllOfFields.TypeEnum.String,
      value: "This item contains outputs from the authentik stack.",
    },
  },
  sections: {
    groups: exportFields({ id: "groups", label: "Groups" }, groups),
    roles: exportFields({ id: "roles", label: "Roles" }, roles),
    flows: exportFields({ id: "flows", label: "Flows" }, flows),
    scopeMappings: exportFields({ id: "scopeMappings", label: "Scope Mappings" }, scopeMappings),
  },
});

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

import * as pulumi from "@pulumi/pulumi";
import { AuthentikGroups } from "../../components/authentik/groups.ts";
import { FlowsManager } from "../../components/authentik/flows.ts";
import { OnePasswordItem, OnePasswordItemSectionInput, PurposeEnum, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { FullItem } from "@1password/connect";
import { Brand } from "@pulumi/authentik";
import { createClusterDefinition, GlobalResources } from "@components/globals.ts";
import { OPClient } from "@components/op.ts";

const globals = new GlobalResources({}, {});
const authentikGroups = new AuthentikGroups({});
const flowsManager = new FlowsManager({});
const authentikFlows = flowsManager.createFlows();

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
  return Object.fromEntries(Array.from(flows.propertyMappings.allScopeMappings));
}

function exportFields(value: { [key: string]: pulumi.Output<string> }): OnePasswordItemSectionInput {
  return Object.fromEntries(
    Object.entries(value).map(([key, output]) => [
      key,
      {
        label: key,
        type: TypeEnum.String,
        value: output,
      },
    ])
  );
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
      purpose: PurposeEnum.Notes,
      type: TypeEnum.String,
      value: "This item contains outputs from the authentik stack.",
    },
  },
  sections: pulumi.output({
    groups: {
      fields: exportFields(groups),
    },
    roles: {
      fields: exportFields(roles),
    },
    flows: {
      fields: exportFields(flows),
    },
    scopeMappings: {
      fields: exportFields(scopeMappings),
    },
  }),
});

const clusterDefinition = await new OPClient().getItemByTitle("Cluster: Stargate Command").then(createClusterDefinition);
const tailscaleBrand = new Brand(
  "tailscale",
  {
    domain: pulumi.interpolate`authentik.${globals.tailscaleDomain}`,
    brandingLogo: clusterDefinition.icon,
    brandingTitle: clusterDefinition.key,
    brandingFavicon: clusterDefinition.favicon ?? "",
    brandingDefaultFlowBackground: clusterDefinition.background ?? "/static/dist/assets/images/flow_background.jpg",
    flowAuthentication: authentikFlows.authenticationFlow.uuid,
    flowInvalidation: authentikFlows.providerLogoutFlow.uuid,
    flowUserSettings: authentikFlows.userSettingsFlow.uuid,
  },
  { deleteBeforeReplace: true }
);

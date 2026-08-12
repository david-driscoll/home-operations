import { FullItem } from "@1password/connect";
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import { GlobalResources } from "@components/globals.ts";
import { awaitOutput } from "@components/helpers.ts";
import { OnePasswordItem, type OnePasswordItemSectionInput, PurposeEnum, TypeEnum } from "@dynamic/1password/OnePasswordItem.ts";
import { Brand } from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";
import { FlowsManager } from "../../components/authentik/flows.ts";
import { AuthentikGroups } from "../../components/authentik/groups.ts";

const globals = new GlobalResources({}, {});
const authentikGroups = new AuthentikGroups(globals);
const flowsManager = new FlowsManager(globals, {});
const authentikFlows = flowsManager.createFlows();

function exportFlows(flows: ReturnType<FlowsManager["createFlows"]>): {
  [K in keyof typeof flows]: pulumi.Output<string>;
} {
  return Object.fromEntries(Object.entries(flows).map(([key, flow]) => [key, flow.uuid])) as any;
}

function exportGroups(groups: AuthentikGroups): {
  [K in keyof AuthentikGroups]: pulumi.Output<string>;
} {
  return Object.fromEntries(Array.from(groups.allGroups).map(([key, group]) => [key, group.groupId])) as any;
}

function exportRoles(groups: AuthentikGroups): {
  [K in keyof AuthentikGroups]: pulumi.Output<string>;
} {
  return Object.fromEntries(Array.from(groups.allRoles).map(([key, role]) => [key, role.rbacRoleId])) as any;
}

function exportScopeMappings(flows: FlowsManager): {
  [key: string]: pulumi.Output<string>;
} {
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
    ]),
  );
}

export const groups = exportGroups(authentikGroups);
export const roles = exportRoles(authentikGroups);
export const flows = exportFlows(authentikFlows);
export const scopeMappings = exportScopeMappings(flowsManager);

const _authentikSecret = new OnePasswordItem("authentik-outputs", {
  category: FullItem.CategoryEnum.SecureNote,
  title: "Authentik Outputs",
  fields: {
    notePlain: {
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

// Phase 8 dual-write. `Authentik Outputs` is the estate's one piece of
// cross-stack inventory with four consumers (home, ocracoke, gulf-of-mexico,
// applications), and PLAN §G's `StackReference` answer is unavailable here —
// every stack has its own DIY backend, so nothing can reference this project.
// OpenBao is the channel instead.
//
// Written ALONGSIDE the OnePasswordItem above, never instead of it: 1Password
// stays authoritative until Phase 11, and the consumers do not read this path
// until a `pulumi up` on THIS stack has populated it. Switching a reader first
// would give it an empty object rather than an error.
if (globals.baoDualWriteEnabled) {
  baoKvSecret(
    "authentik-outputs-bao",
    {
      mount: "secrets",
      path: "clusters/_inventory/authentik-outputs",
      // The same four sections the 1Password item carries, as nested objects.
      // These are Authentik object IDs, not credentials — but they go in the
      // `secrets` mount because that is the only KV mount consumers can read.
      data: pulumi.output({ groups, roles, flows, scopeMappings }),
      // Authentik object IDs (flows, groups, mappings) — identifiers, not
    // credentials. Declared empty deliberately rather than omitted.
    concealedFields: [],
    customMetadata: baoProvenance({ source_title: "Authentik Outputs" }),
    },
    { provider: globals.baoProvider, parent: globals },
  );
} else {
  pulumi.log.warn("BAO credentials absent — skipping the Authentik Outputs dual-write; consumers still read 1Password");
}

const clusterDefinition = await awaitOutput(globals.store.getCluster("Cluster: Stargate Command"));
const _tailscaleBrand = new Brand(
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
  { deleteBeforeReplace: true },
);

import { FullItem } from "@1password/connect";
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import { GlobalResources } from "@components/globals.ts";
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

// The estate-wide tailnet brand.
//
// Its assets used to come from `getCluster("Cluster: Stargate Command")`.
// `BaoStore.getCluster` THROWS on a title it cannot find, so the moment SGC's
// cluster definition goes away (docs/cluster-consolidation/22-decommission-sgc.md
// §4) this stack — the estate's SSO control plane, the one every other stack's
// OIDC depends on — fails on every run, for a cluster it does not otherwise
// touch. One cluster's teardown must not be able to take SSO down with it.
//
// The values below are the exact URLs the SGC definition carried, so the
// rendered brand is byte-identical; this change is a decoupling, not a
// restyle. They are literals rather than another cluster's definition because
// this brand covers the TAILNET, not a cluster — there is no cluster whose
// branding it should inherit. Alpha Site (where authentik now runs, and which
// shares `authentikDomain: iris.driscoll.tech`) carries different
// icon/favicon/background values, so pointing at it would have been a silent
// rebrand smuggled in on a decommission. Restyling this brand is a one-line,
// deliberate change to make here on its own.
const TAILNET_BRAND_LOGO = "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg";
// The SGC definition set `favicon` to the same URL as `icon`; kept separate so
// either can move without dragging the other.
const TAILNET_BRAND_FAVICON = "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg";
const TAILNET_BRAND_BACKGROUND = "https://wallpapercave.com/wp/wp10853006.jpg";
// Was `clusterDefinition.key`, i.e. the literal string "sgc". Kept as-is
// because it renders in the login page's title; renaming it is a visible
// change and belongs in its own commit, not in a teardown fuse fix.
const TAILNET_BRAND_TITLE = "sgc";

const _tailscaleBrand = new Brand(
  "tailscale",
  {
    domain: pulumi.interpolate`authentik.${globals.tailscaleDomain}`,
    brandingLogo: TAILNET_BRAND_LOGO,
    brandingTitle: TAILNET_BRAND_TITLE,
    brandingFavicon: TAILNET_BRAND_FAVICON,
    brandingDefaultFlowBackground: TAILNET_BRAND_BACKGROUND,
    flowAuthentication: authentikFlows.authenticationFlow.uuid,
    flowInvalidation: authentikFlows.providerLogoutFlow.uuid,
    flowUserSettings: authentikFlows.userSettingsFlow.uuid,
  },
  { deleteBeforeReplace: true },
);

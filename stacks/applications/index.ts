import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { GlobalResources, createClusterDefinition } from "../../components/globals.ts";
import { dockgeApplications } from "./dockge.ts";
import { kubernetesApplications } from "./kubernetes.ts";
import { OPClient } from "../../components/op.ts";
import { AuthentikOutputs } from "@components/authentik.ts";

const op = new OPClient();

const globals = new GlobalResources({}, {});
const config = new pulumi.Config(`applications`);
const clusterCredential = config.require("clusterCredential");
const clusterDefinition = createClusterDefinition(await op.getItemByTitle(clusterCredential));

const outputs = new AuthentikOutputs(await op.getItemByTitle("Authentik Outputs"));

// only these two are branded.
if (clusterDefinition.key === "sgc" || clusterDefinition.key === "equestria") {
  const brand = new authentik.Brand(
    clusterDefinition.key,
    {
      domain: clusterDefinition.authentikDomain,
      brandingLogo: clusterDefinition.icon,
      brandingTitle: clusterDefinition.key,
      brandingFavicon: clusterDefinition.favicon ?? "",
      brandingDefaultFlowBackground: clusterDefinition.background ?? "/static/dist/assets/images/flow_background.jpg",
      flowAuthentication: outputs.flows.authenticationFlow,
      flowInvalidation: outputs.flows.providerLogoutFlow,
      flowUserSettings: outputs.flows.userSettingsFlow,
    },
    { deleteBeforeReplace: true }
  );
}

switch (clusterDefinition.type) {
  case "dockge":
    await dockgeApplications(globals, outputs, clusterDefinition);
    break;
  case "kubernetes":
    await kubernetesApplications(globals, outputs, clusterDefinition);
    break;
  default:
    throw new Error(`Unknown cluster definition ${clusterDefinition}`);
}

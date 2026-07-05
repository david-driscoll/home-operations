import type { AuthentikOutputs } from "@components/authentik.ts";
import { awaitOutput } from "@components/helpers.ts";
import * as authentik from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { kubernetesApplications } from "./kubernetes.ts";

const globals = new GlobalResources({}, {});
const config = new pulumi.Config(`applications`);
const clusterCredential = config.require("clusterCredential");
const clusterDefinition = await awaitOutput(globals.store.getKubernetesCluster(clusterCredential));

const outputs = await awaitOutput(globals.store.getSecretByTitle<AuthentikOutputs>("Authentik Outputs"));

// only these two are branded.
if (clusterDefinition.key === "sgc" || clusterDefinition.key === "equestria") {
  const _brand = new authentik.Brand(
    clusterDefinition.key,
    {
      domain: clusterDefinition.authentikDomain,
      brandingLogo: clusterDefinition.icon,
      brandingTitle: clusterDefinition.title,
      brandingFavicon: clusterDefinition.favicon ?? "",
      brandingDefaultFlowBackground: clusterDefinition.background ?? "/static/dist/assets/images/flow_background.jpg",
      flowAuthentication: outputs.flows.authenticationFlow,
      flowInvalidation: outputs.flows.providerLogoutFlow,
      flowUserSettings: outputs.flows.userSettingsFlow,
    },
    { deleteBeforeReplace: true },
  );
}

switch (clusterDefinition.type) {
  case "kubernetes":
    await kubernetesApplications(globals, outputs, clusterDefinition);
    break;
}

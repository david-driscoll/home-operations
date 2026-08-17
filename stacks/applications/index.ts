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

// `iris.driscoll.tech`, re-homed onto equestria's instance.
//
// This brand used to be the SGC one: `clusters/sgc.yaml` carries
// `authentikDomain: iris.driscoll.tech`, so the block above built it from the
// `sgc` instance. Destroying that stack
// (docs/cluster-consolidation/22-decommission-sgc.md) would take the brand with
// it and drop a live login surface to authentik's default — `iris` is not an SGC
// app, it is one of the estate's three public SSO names and it answers from
// alpha-site today. Keeping the brand alive means giving it an owner that
// survives, and equestria's instance is the one that does.
//
// The asset URLs are the exact values `clusters/sgc.yaml` carried, as literals:
// the definition is deleted later in the same teardown, and this brand must not
// acquire a dependency on it. So this is a re-home, not a restyle — the rendered
// brand is byte-identical to what is live now. Alpha Site declares the same
// `authentikDomain` but different imagery, and is `type: dockge` so it has no
// applications instance of its own; adopting its assets would have been a
// visible change nobody asked for.
//
// ORDERING: authentik keys brands by domain, so this cannot coexist with the
// `sgc` instance's copy. It must land AFTER `pulumi destroy --stack sgc`, or
// equestria's run fails on a duplicate domain. Between the two, `iris` renders
// authentik's default brand.
if (clusterDefinition.key === "equestria") {
  const _irisBrand = new authentik.Brand(
    "iris",
    {
      domain: "iris.driscoll.tech",
      brandingLogo: "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg",
      brandingTitle: "Stargate Command",
      brandingFavicon: "https://i.pinimg.com/originals/d6/1b/0f/d61b0fa0a759fd8baceedc9427246f7d.jpg",
      brandingDefaultFlowBackground: "https://wallpapercave.com/wp/wp10853006.jpg",
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

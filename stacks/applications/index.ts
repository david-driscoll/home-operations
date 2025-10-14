import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { GlobalResources, ClusterDefinition, createClusterDefinition } from "../../components/globals.ts";
import { AuthentikApplicationManager } from "@components/authentik.ts";
import { dockgeApplications } from "./dockge.ts";
import { kubernetesApplications } from "./kubernetes.ts";
import { OPClient } from "../../components/op.ts";

const op = new OPClient();

const globals = new GlobalResources({}, {});
const config = new pulumi.Config(`applications`);
const clusterCredential = config.require("clusterCredential");
const clusterDefinition = createClusterDefinition(await op.getItemByTitle(clusterCredential));

switch (clusterDefinition.type) {
  case "dockge":
    await dockgeApplications(globals, clusterDefinition);
    break;
  case "kubernetes":
    await kubernetesApplications(globals, clusterDefinition);
    break;
  default:
    throw new Error(`Unknown cluster definition ${clusterDefinition}`);
}

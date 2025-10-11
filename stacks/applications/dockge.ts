import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { AuthentikApplicationManager } from "@components/authentik.ts";
import { GlobalResources, DockgeClusterDefinition } from "@components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { ApplicationCertificate } from "@components/authentik/application-certificate.ts";

const op = new OPClient();

export async function dockgeApplications(globals: GlobalResources, clusterDefinition: DockgeClusterDefinition, applicationManager: AuthentikApplicationManager) {
  const certificate = new ApplicationCertificate(clusterDefinition.name, { globals });

  const serviceConnection = new authentik.ServiceConnectionDocker(clusterDefinition.name, {
    name: clusterDefinition.name,
    url: `ssh://root@${clusterDefinition.rootDomain}`,
    tlsAuthentication: certificate.signingKey.certificateKeyPairId,
  });

  applicationManager.createApplication({
    name: "dockge",
    category: clusterDefinition.title,
    title: "Dockge",
    description: "Access to the Dockge",
    url: `https://dockge.${clusterDefinition.rootDomain}`,
    icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/dockge.svg",
  });

  return {
    serviceConnectionId: serviceConnection.serviceConnectionDockerId,
  };
}

import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";
import { OPClient } from "../../components/op.ts";
import { GlobalResources } from "../../components/globals.ts";
import { AuthentikResourceManager } from "@components/authentik.ts";

const globals = new GlobalResources({}, {});
const config = new pulumi.Config();
const authentikOutput = config.requireObject<typeof import("../authentik/index.ts")>("authentik-output");
const clusterInfo = {
  name: "luna",
  title: "Luna",
  rootDomain: "luna.driscoll.tech",
  authentikDomain: `https://canterlot.driscoll.tech`,
};

const serviceConnection = new authentik.ServiceConnectionDocker(clusterInfo.name, {}, { provider: globals.authentikProvider });

const authentikApplicationManager = new AuthentikResourceManager({
  serviceConnectionId: serviceConnection.serviceConnectionDockerId,
  authentik: pulumi.output(authentikOutput),
  cluster: clusterInfo,
});

authentikApplicationManager.createApplication({
  name: "traefik-internal",
  category: authentikApplicationManager.cluster.title,
  title: "Traefik Dashboard",
  description: "Access to the Traefik dashboard",
  url: `https://internal.${authentikApplicationManager.cluster.rootDomain}/dashboard/`,
  icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/traefik.svg",
  authentik: {
    providerProxy: {
      mode: "forward_single",
      externalHost: `https://internal.${authentikApplicationManager.cluster.rootDomain}`,
    },
  },
});

authentikApplicationManager.createApplication({
  name: "dockge",
  category: authentikApplicationManager.cluster.title,
  title: "Dockge",
  description: "Access to the Dockge",
  url: `https://dockge.${authentikApplicationManager.cluster.rootDomain}`,
  icon: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/dockge.svg",
});

authentikApplicationManager.createOutpost();

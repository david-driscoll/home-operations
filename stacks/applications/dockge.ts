import { DockgeClusterDefinition } from "@components/authentik.ts";

export function dockgeApplications(clusterDefinition: DockgeClusterDefinition, authentik: typeof import("../authentik/index.ts")) {
  const serviceConnection = new authentik.ServiceConnectionDocker(
    clusterDefinition.name,
    {
      name: clusterDefinition.name,
      url: `ssh://root@${clusterDefinition.rootDomain}`,
      tlsAuthentication: certificate.signingKeyPair.certificateKeyPairId,
    },
    { provider: globals.authentikProvider }
  );
}

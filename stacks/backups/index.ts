import { GlobalResources } from "../../components/globals.ts";
import { OPClient } from "../../components/op.ts";
import { createBackupDatastores, ProxmoxBackupServer } from "./ProxmoxBackupServer.ts";
import { interpolate } from "@pulumi/pulumi";

const globals = new GlobalResources({}, {});
const op = new OPClient();

const celestiaPbs = new ProxmoxBackupServer("celestia-pbs", {
  hostname: interpolate`celestia.${globals.tailscaleDomain}`,
  credential: "Celestia PBS backup user",
  globals,
});

const lunaPbs = new ProxmoxBackupServer("luna-pbs", {
  hostname: interpolate`luna.${globals.tailscaleDomain}`,
  credential: "Luna PBS backup user",
  globals,
});

const lunaDatastore = await createBackupDatastores("luna", {
  sourceServer: lunaPbs,
  destinationServer: celestiaPbs,
  globals,
});

const celestiaDatastore = await createBackupDatastores("celestia", {
  sourceServer: celestiaPbs,
  destinationServer: lunaPbs,
  globals,
});

import { GlobalResources } from "../../components/globals.ts";
import { assignTailscaleAcls } from "./acl-manager.ts";
import { configureLocalDns } from "./local-dns.ts";
import { configureTechnitiumZones } from "./technitium-zone.ts";

const globals = new GlobalResources({}, {});
createTailscaleAttDropFirewallRule(globals);
assignTailscaleAcls(globals);
configureLocalDns(globals);
configureTechnitiumZones(globals);

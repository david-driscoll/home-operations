import { GlobalResources } from "../../components/globals.ts";
import { assignTailscaleAcls } from "./acl-manager.ts";
import { createTailscaleAttDropFirewallRule } from "./tailscale-drop-firewall-rule.ts";

const globals = new GlobalResources("global-resources", {});
createTailscaleAttDropFirewallRule(globals);
assignTailscaleAcls(globals);

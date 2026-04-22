import { GlobalResources } from "../../components/globals";
import { createTailscaleAttDropFirewallRule } from "./tailscale-drop-firewall-rule";
import { assignTailscaleAcls } from "./acl-manager.ts";

const globals = new GlobalResources("global-resources", {});
createTailscaleAttDropFirewallRule(globals);
assignTailscaleAcls(globals);

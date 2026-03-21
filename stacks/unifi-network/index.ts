import { GlobalResources } from "../../components/globals";
import { createTailscaleAttDropFirewallRule } from "./tailscale-drop-firewall-rule";

const globals = new GlobalResources("global-resources", {});
createTailscaleAttDropFirewallRule(globals);

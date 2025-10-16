import { interpolate } from "@pulumi/pulumi";
import { GlobalResources } from "../../components/globals.ts";
import { ProxmoxHost } from "./ProxmoxHost.ts";

export function getHostnames(name: string, globals: GlobalResources) {
  const hostname = interpolate`${name}.host.${globals.searchDomain}`;
  const tailscaleHostname = interpolate`${name}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleHostname };
}

export function getContainerHostnames(name: string, host: ProxmoxHost, globals: GlobalResources) {
  const hostname = interpolate`${host.name}.${globals.searchDomain}`;
  const tailscaleName = interpolate`${name}-${host.shortName ?? host.name}`;
  const tailscaleHostname = interpolate`${tailscaleName}.${globals.tailscaleDomain}`;
  return { hostname, tailscaleName, tailscaleHostname };
}

/**
 * The network the Equestria entry lives in (#2889, #3163).
 *
 * The NetBird operator's NetworkRouter CR (kubernetes/apps/netbird-system/router)
 * always creates a network named after itself, and offers no way to use an
 * existing one (operator v0.9.0). So stacks/netbird does not declare its own:
 * it finds the operator's by name and puts its router and the two /32
 * resources there.
 */

/** Must match networkrouter.yaml's metadata.name: the operator names the network after it. */
export const OPERATOR_NETWORK_NAME = "equestria-routers";

/** A network as GET /api/networks returns it, reduced to what this reads. */
export interface LiveNetwork {
  id: string;
  name: string;
}

/**
 * The operator's network's id. Throws when two networks share the name, since
 * a guess could put the entry's resources in one no routing peer serves.
 */
export function operatorNetworkId(networks: LiveNetwork[], name: string = OPERATOR_NETWORK_NAME): string | undefined {
  const matches = networks.filter(network => network.name === name);
  if (matches.length > 1)
    throw new Error(`NetBird has ${matches.length} networks named ${name} (${matches.map(network => network.id).join(", ")}); expected the one the operator's NetworkRouter creates. Delete the stray one.`);
  return matches[0]?.id;
}

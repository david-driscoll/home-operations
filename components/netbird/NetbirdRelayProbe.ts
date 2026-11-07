import { remote, type types } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, output, type Resource } from "@pulumi/pulumi";
import { renderRelayProbeInstall, renderRelayProbeScript } from "./relayProbe.ts";

export interface NetbirdRelayProbeArgs {
  /** SSH to the host, as for NetbirdServer. */
  connection: types.input.remote.ConnectionArgs;
  /** The relay's name (SNI and certificate), e.g. `relay-home.<root domain>`. */
  name: Input<string>;
  /** Technitium tailnet IPs the script asks for the name on every run (relayProbe.ts dnsResolvers). */
  resolvers: Input<string[]>;
  heartbeat: { url: Input<string>; token: string };
  /** As NetbirdServer's: a new value reinstalls on a replacement VM. */
  hostKey?: Input<string>;
  dependsOn?: Input<Resource>[];
}

/**
 * The home-relay probe on one host (relayProbe.ts): the script, its systemd
 * service and timer, written and enabled by one Command. Removing the
 * component disables the timer and deletes the files, so turning the probe
 * off leaves nothing behind that would keep reporting.
 *
 * deleteBeforeReplace, because the delete is that teardown: replaced
 * create-before-delete, the old Command's teardown would run after the new
 * install and remove it (renderRelayProbeInstall).
 */
export class NetbirdRelayProbe extends ComponentResource {
  constructor(name: string, args: NetbirdRelayProbeArgs, opts?: ComponentResourceOptions) {
    super("custom:netbird:RelayProbe", name, {}, opts);
    const { connection, hostKey } = args;
    const commands = all([args.name, output(args.resolvers), args.heartbeat.url]).apply(([relay, resolvers, url]) =>
      renderRelayProbeInstall({ script: renderRelayProbeScript({ name: relay, resolvers, heartbeat: { url, token: args.heartbeat.token } }) }),
    );
    new remote.Command(
      `${name}-install`,
      {
        connection,
        create: "bash -s",
        stdin: commands.install,
        delete: commands.teardown,
        triggers: [commands.install, hostKey],
        logging: "stderr",
      },
      {
        parent: this,
        dependsOn: args.dependsOn,
        deleteBeforeReplace: true,
        // The old `-enable` Command, so the first deploy of this one replaces
        // it delete-first, not deleting it last, after the new install.
        aliases: [{ name: `${name}-enable` }],
      },
    );
    this.registerOutputs({});
  }
}

import { remote, type types } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, output, type Resource } from "@pulumi/pulumi";
import { RELAY_PROBE_DIR, relayProbePaths, renderRelayProbeScript, renderRelayProbeUnits } from "./relayProbe.ts";

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
 * service and timer, then the timer enabled. Removing the component disables
 * the timer and deletes the files, so turning the probe off leaves nothing
 * behind that would keep reporting.
 */
export class NetbirdRelayProbe extends ComponentResource {
  constructor(name: string, args: NetbirdRelayProbeArgs, opts?: ComponentResourceOptions) {
    super("custom:netbird:RelayProbe", name, {}, opts);
    const { connection, hostKey } = args;
    const paths = relayProbePaths(RELAY_PROBE_DIR);
    const units = renderRelayProbeUnits(RELAY_PROBE_DIR);
    const script = all([args.name, output(args.resolvers), args.heartbeat.url]).apply(([relay, resolvers, url]) => renderRelayProbeScript({ name: relay, resolvers, heartbeat: { url, token: args.heartbeat.token } }));

    // [resource suffix, path, content, mode]
    const install: [string, string, Input<string>, string][] = [
      ["script", paths.script, script, "700"],
      ["service", "/etc/systemd/system/netbird-relay-probe.service", units.service, "644"],
      ["timer", "/etc/systemd/system/netbird-relay-probe.timer", units.timer, "644"],
    ];
    const files = install.map(
      ([suffix, path, content, mode]) =>
        new remote.Command(
          `${name}-${suffix}`,
          {
            connection,
            // stdin: the script carries the heartbeat token.
            create: `${path.startsWith(`${paths.dir}/`) ? `install -d -m 700 ${paths.dir} && ` : ""}umask 077 && cat > ${path}.tmp && chmod ${mode} ${path}.tmp && mv ${path}.tmp ${path}`,
            stdin: content,
            triggers: [content, hostKey],
            logging: "stderr",
          },
          { parent: this, dependsOn: args.dependsOn },
        ),
    );
    new remote.Command(
      `${name}-enable`,
      {
        connection,
        create: "systemctl daemon-reload && systemctl enable --now netbird-relay-probe.timer && systemctl start --no-block netbird-relay-probe.service",
        delete: `systemctl disable --now netbird-relay-probe.timer 2>/dev/null || true; rm -rf ${paths.dir} /etc/systemd/system/netbird-relay-probe.service /etc/systemd/system/netbird-relay-probe.timer && systemctl daemon-reload`,
        triggers: [...install.map(([, , content]) => content), hostKey],
      },
      { parent: this, dependsOn: files },
    );
    this.registerOutputs({});
  }
}

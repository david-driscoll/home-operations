import { remote, type types } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, output, type Resource, secret } from "@pulumi/pulumi";
import { FAILOVER_VIEW_DIR, failoverViewPaths, renderFailoverViewCurlConfig, renderFailoverViewScript, renderFailoverViewUnits } from "./failoverView.ts";

export interface NetbirdFailoverViewArgs {
  /** SSH to the host, as for NetbirdServer. */
  connection: types.input.remote.ConnectionArgs;
  /** This host's id (azure-cus): the name its view is published under. */
  observer: string;
  /** The management name, e.g. `netbird.<root domain>`. */
  lease: Input<string>;
  /** The other hosts' public addresses. */
  targets: Input<Input<string>[]>;
  /** The NetBird backup bucket and its key (NETBIRD_BACKUP_BAO_PATH). */
  s3: { endpoint: Input<string>; bucket: Input<string>; accessKeyId: Input<string>; secretAccessKey: Input<string> };
  /** As NetbirdServer's: a new value reinstalls on a replacement VM. */
  hostKey?: Input<string>;
  dependsOn?: Input<Resource>[];
}

/**
 * One host's view of the others (failoverView.ts): the script, the curl config
 * with the bucket key, its systemd service and timer, then the timer enabled.
 * Removing the component disables the timer and deletes the files; the
 * watchdog then finds no fresh view and holds instead of flipping.
 */
export class NetbirdFailoverView extends ComponentResource {
  constructor(name: string, args: NetbirdFailoverViewArgs, opts?: ComponentResourceOptions) {
    super("custom:netbird:FailoverView", name, {}, opts);
    const { connection, hostKey } = args;
    const paths = failoverViewPaths(FAILOVER_VIEW_DIR);
    const units = renderFailoverViewUnits(FAILOVER_VIEW_DIR);
    const script = all([args.lease, output(args.targets), args.s3.endpoint, args.s3.bucket]).apply(([lease, targets, endpoint, bucket]) =>
      renderFailoverViewScript({ observer: args.observer, lease, targets, s3: { endpoint, bucket } }),
    );
    const curlConfig = secret(all([args.s3.accessKeyId, args.s3.secretAccessKey]).apply(([accessKeyId, secretAccessKey]) => renderFailoverViewCurlConfig({ accessKeyId, secretAccessKey })));

    // [resource suffix, path, content, mode]
    const install: [string, string, Input<string>, string][] = [
      ["script", paths.script, script, "700"],
      ["curlrc", paths.curlConfig, curlConfig, "600"],
      ["service", "/etc/systemd/system/netbird-failover-view.service", units.service, "644"],
      ["timer", "/etc/systemd/system/netbird-failover-view.timer", units.timer, "644"],
    ];
    const files = install.map(
      ([suffix, path, content, mode]) =>
        new remote.Command(
          `${name}-${suffix}`,
          {
            connection,
            // stdin: the curl config carries the bucket key.
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
        create: "systemctl daemon-reload && systemctl enable --now netbird-failover-view.timer && systemctl start --no-block netbird-failover-view.service",
        delete: `systemctl disable --now netbird-failover-view.timer 2>/dev/null || true; rm -rf ${paths.dir} /etc/systemd/system/netbird-failover-view.service /etc/systemd/system/netbird-failover-view.timer && systemctl daemon-reload`,
        triggers: [...install.map(([, , content]) => content), hostKey],
      },
      { parent: this, dependsOn: files },
    );
    this.registerOutputs({});
  }
}

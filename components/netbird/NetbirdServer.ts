import { readFileSync } from "node:fs";
import { remote, type types } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, interpolate, type Output, output, type Resource, secret } from "@pulumi/pulumi";
import { backupPaths, renderBackupScript, renderBackupUnits, renderResticEnv, renderRestoreScript } from "./backup.ts";
import { FENCED_SERVICES, fencePaths, renderFenceScript, renderFenceUnits } from "./fence.ts";
import { NETBIRD_DIR, parseSetupResponse, type RelayEndpoint, renderDashboardEnv, renderRelayEnv, renderServerConfig, type ServerSecrets, type SetupResult } from "./server.ts";

export { NETBIRD_DIR } from "./server.ts";

const composeFile = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");

export interface NetbirdServerArgs {
  /** SSH to the VM. Over the tailnet from the Pulumi operator (tag:egress -> tag:netbird-edge, root). */
  connection: types.input.remote.ConnectionArgs;
  /** `netbird.<root domain>`. */
  domain: Input<string>;
  secrets: { [K in keyof ServerSecrets]: Input<string> };
  /**
   * Standalone relays listed for clients, by hostname or as a RelayEndpoint
   * (server.ts renderServerConfig). Every host gets the same list. Empty: the
   * embedded relay and STUN.
   */
  relays?: Input<string | RelayEndpoint>[];
  /** Run `netbirdio/relay` on this host, served as this name (#3001). Not fenced. */
  relay?: { domain: Input<string> };
  /**
   * Run management only while `domain` resolves to `ownIp` (fence.ts, #3001).
   * Needs `backup`: the fence restores before it starts management, and owns
   * the backup timer. Without it the server runs whenever the VM does.
   */
  fence?: { zone: string; ownIp: Input<string> };
  /**
   * Create the owner through `POST /api/setup` and return its bootstrap PAT.
   * Only one host ever does this: the others restore its data instead
   * (#3001), and setup only ever succeeds once per store.
   */
  setup?: { email: Input<string>; password: Input<string>; name: Input<string>; patExpireInDays: number };
  /**
   * 15-minute backups to Garage and the restore that runs before the server
   * starts (#2884). Without it the server runs on whatever its volume holds.
   */
  backup?: NetbirdBackupArgs;
  /**
   * Anything that changes when the machine is replaced, e.g. the OCI instance
   * id. Every deploy step reruns on a new value: a replacement VM starts
   * empty, and without this the steps' recorded success on the old VM would
   * stand. Setup is the exception and never reruns.
   */
  hostKey?: Input<string>;
  /** Anything that must exist first, e.g. the DNS record Let's Encrypt validates against. */
  dependsOn?: Input<Resource>[];
}

export interface NetbirdBackupArgs {
  /** `s3:https://garage-s3.<tailnet>/<bucket>/<prefix>` (backup.ts resticRepository). The standby shares it. */
  repository: Input<string>;
  accessKeyId: Input<string>;
  secretAccessKey: Input<string>;
  /** Encrypts the repository. Lose it and every snapshot is unreadable. */
  resticPassword: Input<string>;
  /** The snapshots' host, and with it their retention group. One per server. */
  host: string;
  /** The Gatus heartbeat every run reports to (backup.ts backupHeartbeat). */
  heartbeat?: { url: Input<string>; token: string };
  /**
   * Run the 15-minute timer. Default true. Ignored on a fenced host, where
   * the fence turns the timer on with management and off without it. The
   * script also skips any run where netbird-server is not running.
   */
  schedule?: boolean;
}

/**
 * The NetBird combined server, deployed onto an existing Docker host.
 *
 * Writes compose.yaml, .env, config.yaml and dashboard.env (and relay.env on a
 * relay host) into NETBIRD_DIR and runs `docker compose up` whenever any of
 * them changes. Rerunning is safe: the files are rewritten whole and compose
 * only recreates what changed.
 *
 * With `backup`, the order on every deploy is: files -> restore (an empty
 * volume gets the newest snapshot; an unreadable repository fails the run) ->
 * up -> setup (refused on a restored store) -> backup timer.
 *
 * With `fence`, the deploy never starts management itself: files -> up
 * (Traefik and the relay only) -> one fence pass (restore and start if the
 * lease is ours) -> setup -> the fence timer.
 */
export class NetbirdServer extends ComponentResource {
  /** The owner's id, email and bootstrap PAT. Undefined when `setup` was not asked for. */
  public readonly setupResult?: Output<SetupResult>;
  /**
   * What the deploy's restore found: `present`, `fresh` or `restored
   * <snapshot>`. On a fenced host, the first fence pass's last line instead
   * (`netbird-fence: <action> (<lease>)`). Undefined without `backup`.
   */
  public readonly restoreResult?: Output<string>;

  constructor(name: string, args: NetbirdServerArgs, opts?: ComponentResourceOptions) {
    super("custom:netbird:Server", name, {}, opts);

    const connection = args.connection;
    const cro = { parent: this };
    const hostKey = args.hostKey;
    const fence = args.fence;
    if (fence && !args.backup) throw new Error(`NetbirdServer ${name}: a fenced server needs backup, which its promotion restores from`);

    // cloud-init installs Docker; on a fresh VM the first SSH session can
    // arrive before it finishes.
    const ready = new remote.Command(
      `${name}-ready`,
      { connection, create: "cloud-init status --wait >/dev/null 2>&1 || true; docker version --format '{{.Server.Version}}'", triggers: [hostKey] },
      { ...cro, dependsOn: args.dependsOn },
    );

    const config = secret(
      all([args.domain, args.secrets.relayAuthSecret, args.secrets.datastoreEncryptionKey, args.secrets.sessionCookieEncryptionKey, output(args.relays ?? [])]).apply(
        ([domain, relayAuthSecret, datastoreEncryptionKey, sessionCookieEncryptionKey, relays]) => renderServerConfig({ domain, relayAuthSecret, datastoreEncryptionKey, sessionCookieEncryptionKey, relays }),
      ),
    );
    const dotEnv = all([args.domain, args.relay?.domain]).apply(([domain, relayDomain]) =>
      [
        `NETBIRD_DOMAIN=${domain}`,
        ...(relayDomain ? [`NETBIRD_RELAY_DOMAIN=${relayDomain}`, "COMPOSE_PROFILES=relay"] : []),
        // A reboot must not start management before the fence checks the lease.
        ...(fence ? ["NETBIRD_SERVER_RESTART=no"] : []),
        "",
      ].join("\n"),
    );
    const files: Record<string, Input<string>> = {
      "compose.yaml": composeFile,
      ".env": dotEnv,
      "config.yaml": config,
      "dashboard.env": output(args.domain).apply(domain => renderDashboardEnv({ domain })),
      ...(args.relay ? { "relay.env": secret(all([args.relay.domain, args.secrets.relayAuthSecret]).apply(([domain, authSecret]) => renderRelayEnv({ domain, authSecret }))) } : {}),
    };

    const written = Object.entries(files).map(
      ([file, content]) =>
        new remote.Command(
          `${name}-file-${file.replace(/^\./, "dot-")}`,
          {
            connection,
            // stdin, not an argument: config.yaml carries the store key and
            // the relay secret, and a command line is visible in ps.
            create: `install -d -m 700 ${NETBIRD_DIR} && umask 077 && cat > ${NETBIRD_DIR}/${file}`,
            stdin: content,
            triggers: [content, hostKey],
            logging: "stderr",
          },
          { ...cro, dependsOn: [ready] },
        ),
    );

    const backup = args.backup ? this.deployBackup(name, connection, args.backup, hostKey, written, !fence) : undefined;
    const fenceFiles = fence && backup ? this.deployFence(name, connection, args.domain, fence, hostKey, written) : undefined;

    // A fenced host starts only what is never fenced; the fence pass below
    // decides about management. A management already running is recreated, so
    // it picks up a changed config.yaml (compose cannot see a bind mount's
    // content), under the fence's lock so the two never race.
    const alwaysOn = ["traefik", ...(args.relay ? ["relay"] : [])].join(" ");
    const fenced = FENCED_SERVICES.join(" ");
    const up = new remote.Command(
      `${name}-up`,
      {
        connection,
        create: fence
          ? `cd ${NETBIRD_DIR} && docker compose pull --quiet && install -d -m 700 ${fencePaths().dir} && flock ${fencePaths().lock} sh -c 'docker compose up -d --remove-orphans ${alwaysOn} && if [ "$(docker inspect -f "{{.State.Running}}" netbird-server 2>/dev/null)" = true ]; then docker compose up -d --force-recreate ${fenced}; fi'`
          : `cd ${NETBIRD_DIR} && docker compose pull --quiet && docker compose up -d --remove-orphans`,
        triggers: [...Object.values(files), hostKey],
      },
      // After the restore: the server must never open an empty store that a
      // snapshot was about to fill.
      { ...cro, dependsOn: [...written, ...(backup?.restore ? [backup.restore] : [])] },
    );

    // The first fence pass, synchronous so the deploy sees its outcome (and
    // setup, below, waits for it); then the timer takes over.
    const fencePass = fenceFiles
      ? new remote.Command(
          `${name}-fence`,
          {
            connection,
            create: `systemctl daemon-reload && ${fencePaths().script} && systemctl enable --now netbird-fence.timer`,
            triggers: [...fenceFiles.contents, ...(backup?.contents ?? []), ...Object.values(files), hostKey],
            logging: "stdoutAndStderr",
          },
          { ...cro, dependsOn: [up, ...fenceFiles.files, ...(backup?.files ?? [])] },
        )
      : undefined;

    const lastLine = (out: string) => out.trim().split("\n").at(-1) ?? "";
    this.restoreResult = fencePass ? fencePass.stdout.apply(lastLine) : backup?.restore?.stdout.apply(lastLine);

    let setupCommand: remote.Command | undefined;
    if (args.setup) {
      const setup = args.setup;
      const started = fencePass ?? up;
      // A restored store already has its owner, and that owner's PAT is the
      // one in OpenBao. Its own resource, created once like setup and never
      // rerun: the check belongs to setup's single run, not to every
      // replacement that restores afterwards.
      const guard = backup
        ? new remote.Command(
            `${name}-setup-guard`,
            {
              connection,
              create: `if [ -e ${backupPaths(NETBIRD_DIR).restoreMarker} ]; then echo "This store was restored from snapshot $(cut -d' ' -f1 ${backupPaths(NETBIRD_DIR).restoreMarker}); its owner already exists. Not running /api/setup: drop setup from this NetbirdServer and keep the owner PAT already in OpenBao." >&2; exit 1; fi`,
            },
            { ...cro, dependsOn: [started] },
          )
        : undefined;
      const body = secret(
        all([setup.email, setup.password, setup.name]).apply(([email, password, displayName]) => JSON.stringify({ email, password, name: displayName, create_pat: true, pat_expire_in: setup.patExpireInDays })),
      );
      // Through Traefik on the VM itself (-k: the Let's Encrypt cert may not be
      // issued yet), retrying until the server answers. Runs once: setup
      // refuses a second time, and a 412 here means the store already has an
      // owner -- left as a failure so nobody overwrites the stored PAT with
      // nothing. On a fenced host management only answers if the lease is
      // this host's, which on the first deploy it is (the record exists first).
      setupCommand = new remote.Command(
        `${name}-setup`,
        {
          connection,
          create: interpolate`set -eu
body=$(cat)
out=$(mktemp)
trap 'rm -f "$out"' EXIT
for _ in $(seq 1 60); do
  code=$(printf '%s' "$body" | curl -sk -o "$out" -w '%{http_code}' --resolve '${args.domain}:443:127.0.0.1' -H 'Content-Type: application/json' --data-binary @- 'https://${args.domain}/api/setup' || true)
  case "$code" in
    200) cat "$out"; exit 0 ;;
    400) echo "NetBird /api/setup rejected the request (HTTP 400)" >&2; exit 1 ;;
    412|409) echo "NetBird setup already completed (HTTP $code); not creating another owner" >&2; exit 1 ;;
    *) sleep 5 ;;
  esac
done
echo "NetBird /api/setup never answered 200 (last HTTP $code)" >&2
exit 1`,
          stdin: body,
          // The response is the PAT: keep it out of logs and mark it secret in state.
          logging: "stderr",
        },
        { ...cro, dependsOn: [started, ...(guard ? [guard] : [])], additionalSecretOutputs: ["stdout", "stdin"] },
      );
      this.setupResult = secret(setupCommand.stdout.apply(parseSetupResponse));
    }

    if (backup && !fence) {
      // Enabled once the server is up and set up, so no run snapshots a store
      // that is still arriving. Starting one now puts a snapshot in Garage
      // straight after every deploy.
      const schedule = args.backup?.schedule ?? true;
      new remote.Command(
        `${name}-backup-enable`,
        {
          connection,
          create: schedule
            ? "systemctl daemon-reload && systemctl enable --now netbird-backup.timer && systemctl start --no-block netbird-backup.service"
            : "systemctl daemon-reload && (systemctl disable --now netbird-backup.timer 2>/dev/null || true)",
          triggers: [...backup.contents, schedule, hostKey],
        },
        { ...cro, dependsOn: [up, ...backup.files, ...(setupCommand ? [setupCommand] : [])] },
      );
    }

    this.registerOutputs({ setupResult: this.setupResult, restoreResult: this.restoreResult });
  }

  /**
   * Writes the backup credentials, scripts and units, and (unless the fence
   * owns it) runs the restore. The restore reruns when the host or the script
   * changes; on a host whose volume already holds a store it answers `present`
   * and touches nothing.
   */
  private deployBackup(name: string, connection: types.input.remote.ConnectionArgs, args: NetbirdBackupArgs, hostKey: Input<string> | undefined, serverFiles: Resource[], restoreOnDeploy: boolean) {
    const paths = backupPaths(NETBIRD_DIR);
    const units = renderBackupUnits({ dir: NETBIRD_DIR });
    const env = secret(
      all([args.repository, args.accessKeyId, args.secretAccessKey, args.resticPassword]).apply(([repository, accessKeyId, secretAccessKey, password]) =>
        renderResticEnv({ repository, accessKeyId, secretAccessKey, password }),
      ),
    );
    const heartbeat = args.heartbeat;
    const backupScript: Input<string> = heartbeat ? output(heartbeat.url).apply(url => renderBackupScript({ host: args.host, heartbeat: { url, token: heartbeat.token } })) : renderBackupScript({ host: args.host });
    const restoreScript = renderRestoreScript();

    // [resource suffix, path, content, mode]
    const install: [string, string, Input<string>, string][] = [
      ["restic-env", paths.env, env, "600"],
      ["backup-script", paths.backupScript, backupScript, "700"],
      ["restore-script", paths.restoreScript, restoreScript, "700"],
      ["backup-service", "/etc/systemd/system/netbird-backup.service", units.service, "644"],
      ["backup-timer", "/etc/systemd/system/netbird-backup.timer", units.timer, "644"],
    ];
    const files = this.installFiles(name, connection, install, paths.dir, hostKey, serverFiles);

    // compose.yaml and .env must be on disk first: the restore runs the pinned
    // restic image through the compose project, which also creates the volume.
    // A fenced host restores only when it takes the lease (fence.ts): a
    // standby that restored on deploy would later promote on a stale store.
    const restore = restoreOnDeploy
      ? new remote.Command(
          `${name}-restore`,
          {
            connection,
            create: paths.restoreScript,
            triggers: [restoreScript, composeFile, hostKey],
            logging: "stdoutAndStderr",
          },
          { parent: this, dependsOn: [...serverFiles, ...files] },
        )
      : undefined;
    return { files, restore, contents: install.map(([, , content]) => content) };
  }

  /** The fence script and its units (fence.ts). dig comes from cloud-init; a VM launched before that gets it here. */
  private deployFence(name: string, connection: types.input.remote.ConnectionArgs, domain: Input<string>, fence: NonNullable<NetbirdServerArgs["fence"]>, hostKey: Input<string> | undefined, serverFiles: Resource[]) {
    const paths = fencePaths(NETBIRD_DIR);
    const units = renderFenceUnits({ dir: NETBIRD_DIR });
    const script = all([domain, fence.ownIp]).apply(([d, ownIp]) => renderFenceScript({ dir: NETBIRD_DIR, domain: d, zone: fence.zone, ownIp }));
    const dig = new remote.Command(
      `${name}-fence-dig`,
      { connection, create: "command -v dig >/dev/null || (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq bind9-dnsutils)", triggers: [hostKey] },
      { parent: this, dependsOn: serverFiles },
    );
    const install: [string, string, Input<string>, string][] = [
      ["fence-script", paths.script, script, "700"],
      ["fence-service", "/etc/systemd/system/netbird-fence.service", units.service, "644"],
      ["fence-timer", "/etc/systemd/system/netbird-fence.timer", units.timer, "644"],
    ];
    const files = [dig, ...this.installFiles(name, connection, install, paths.dir, hostKey, serverFiles)];
    return { files, contents: install.map(([, , content]) => content) };
  }

  private installFiles(name: string, connection: types.input.remote.ConnectionArgs, install: [string, string, Input<string>, string][], ownDir: string, hostKey: Input<string> | undefined, serverFiles: Resource[]) {
    return install.map(
      ([suffix, path, content, mode]) =>
        new remote.Command(
          `${name}-${suffix}`,
          {
            connection,
            // stdin, never an argument: restic.env holds the S3 key and the
            // repository password. Written to a temp file and renamed, so a
            // timer run never reads half a script. Only this component's own
            // directory is created with a mode; /etc/systemd/system keeps its own.
            create: `${path.startsWith(`${ownDir}/`) ? `install -d -m 700 ${ownDir} && ` : ""}umask 077 && cat > ${path}.tmp && chmod ${mode} ${path}.tmp && mv ${path}.tmp ${path}`,
            stdin: content,
            triggers: [content, hostKey],
            logging: "stderr",
          },
          { parent: this, dependsOn: serverFiles },
        ),
    );
  }
}

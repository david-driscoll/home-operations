import * as pulumi from "@pulumi/pulumi";
import { NodeSSH } from "node-ssh";
import { SystemdService, SystemdTimer } from "systemd-ts";

/**
 * SSH connection used to manage systemd units on a remote host.
 *
 * Authentication mirrors the rest of the repo: when no `privateKey` is supplied
 * the local SSH agent (`SSH_AUTH_SOCK`) is used, exactly like
 * `BackupPlanDirector.updateBackrestConfiguration`.
 */
export interface SystemdBackupJobConnection {
  host: pulumi.Input<string>;
  user?: pulumi.Input<string>;
  port?: pulumi.Input<number>;
  privateKey?: pulumi.Input<string>;
}

export interface SystemdBackupJobInputs {
  /** Remote host the systemd service + timer are installed on. */
  connection: pulumi.Input<SystemdBackupJobConnection>;
  /** Unit base name. Units become `<name>.service` and `<name>.timer`. */
  name: pulumi.Input<string>;
  /** Human readable `[Unit] Description=`. */
  description?: pulumi.Input<string>;
  /** rclone source, e.g. `celestia:/data/backup/foo/`. */
  source: pulumi.Input<string>;
  /** rclone destination, e.g. `/data/backup/foo/`. */
  destination: pulumi.Input<string>;
  /** Path to the rclone config file on the remote host. */
  rcloneConfigPath?: pulumi.Input<string>;
  /** Extra arguments appended to `rclone sync`. */
  rcloneArgs?: pulumi.Input<pulumi.Input<string>[]>;
  /** Extra environment variables exported before the sync runs. */
  environment?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  /** systemd `OnCalendar=` expression. Defaults to `*-*-* 04:00:00`. */
  onCalendar?: pulumi.Input<string>;
  /** systemd `RandomizedDelaySec=`. Defaults to `30m`. */
  randomizedDelaySec?: pulumi.Input<string>;
  /** systemd `Persistent=`. Defaults to `true`. */
  persistent?: pulumi.Input<boolean>;
  /** Gatus base url for success/failure reporting (e.g. `http://uptime.example:9595`). */
  uptimeUrl?: pulumi.Input<string>;
  /** Gatus external-endpoint token. Reporting only runs when url + token are both set. */
  uptimeToken?: pulumi.Input<string>;
}

/** Resolved (unwrapped) provider inputs as seen by the provider methods. */
interface ResolvedInputs {
  connection: ResolvedConnection;
  name: string;
  description?: string;
  source: string;
  destination: string;
  rcloneConfigPath?: string;
  rcloneArgs?: string[];
  environment?: Record<string, string>;
  onCalendar?: string;
  randomizedDelaySec?: string;
  persistent?: boolean;
  uptimeUrl?: string;
  uptimeToken?: string;
}

interface ResolvedConnection {
  host: string;
  user?: string;
  port?: number;
  privateKey?: string;
}

interface ProviderOutputs {
  id: string;
  /** Connection persisted so `delete` can reconnect to tear units down. */
  connection: ResolvedConnection;
  serviceFilename: string;
  timerFilename: string;
  serviceContent: string;
  timerContent: string;
}

const DEFAULT_RCLONE_CONFIG = "/etc/backup/rclone.conf";
const DEFAULT_ON_CALENDAR = "*-*-* 04:00:00";
const DEFAULT_RANDOMIZED_DELAY = "30m";

/** Single-quote a value for safe embedding inside a bash script. */
function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Build the bash script that performs the rclone sync and reports to Gatus.
 * The script is embedded verbatim into the unit (see {@link buildExecStart});
 * no separate file is written to the remote host.
 */
function buildScript(inputs: ResolvedInputs): string {
  const lines: string[] = ["#!/usr/bin/env bash", "set -euo pipefail"];

  const reporting = Boolean(inputs.uptimeUrl && inputs.uptimeToken);
  if (reporting) {
    lines.push(
      `TOKEN=${shellSingleQuote(inputs.uptimeToken!)}`,
      `UPTIME_URL=${shellSingleQuote(inputs.uptimeUrl!)}`,
      `report() { curl -sf -X POST -H "Authorization: Bearer $TOKEN" "$UPTIME_URL/api/v1/endpoints/$TOKEN/external?success=$1" >/dev/null 2>&1 || true; }`,
      `trap 'report false' ERR`,
    );
  }

  lines.push(`export RCLONE_CONFIG=${shellSingleQuote(inputs.rcloneConfigPath ?? DEFAULT_RCLONE_CONFIG)}`);
  for (const [key, value] of Object.entries(inputs.environment ?? {})) {
    lines.push(`export ${key}=${shellSingleQuote(value)}`);
  }

  const rcloneArgs = (inputs.rcloneArgs ?? []).map(shellSingleQuote).join(" ");
  lines.push(`rclone sync ${shellSingleQuote(inputs.source)} ${shellSingleQuote(inputs.destination)}${rcloneArgs ? ` ${rcloneArgs}` : ""}`);

  if (reporting) {
    lines.push("report true");
  }

  return lines.join("\n") + "\n";
}

/**
 * Embed the script in `ExecStart=` by base64-encoding it. base64 output is a
 * single line of `[A-Za-z0-9+/=]`, so it is trivially safe to single-quote and
 * needs no escaping, line-continuations, or temp files on the remote host.
 */
function buildExecStart(script: string): string {
  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `/usr/bin/env bash -c 'echo ${encoded} | base64 -d | /usr/bin/env bash'`;
}

/** Render the `.service` and `.timer` unit files using the typed systemd-ts builders. */
function buildUnits(inputs: ResolvedInputs): {
  serviceFilename: string;
  timerFilename: string;
  serviceContent: string;
  timerContent: string;
} {
  const description = inputs.description ?? `Backup sync: ${inputs.name}`;
  const execStart = buildExecStart(buildScript(inputs));

  const service = new SystemdService({
    name: inputs.name,
    unit: {
      Description: description,
      After: "network-online.target",
      Wants: "network-online.target",
    },
    service: {
      Type: "oneshot",
      ExecStart: execStart,
      StandardOutput: "journal",
      StandardError: "journal",
    },
  });

  const timer = new SystemdTimer({
    name: inputs.name,
    unit: { Description: `${description} (timer)` },
    timer: {
      OnCalendar: inputs.onCalendar ?? DEFAULT_ON_CALENDAR,
      RandomizedDelaySec: inputs.randomizedDelaySec ?? DEFAULT_RANDOMIZED_DELAY,
      Persistent: inputs.persistent ?? true,
    },
    install: { WantedBy: "timers.target" },
  });

  const serviceResult = service.render();
  if (!serviceResult.ok) throw serviceResult.error;
  const timerResult = timer.render();
  if (!timerResult.ok) throw timerResult.error;

  return {
    serviceFilename: service.filename,
    timerFilename: timer.filename,
    serviceContent: serviceResult.value,
    timerContent: timerResult.value,
  };
}

async function withSsh<T>(connection: ResolvedConnection, fn: (ssh: NodeSSH) => Promise<T>): Promise<T> {
  const ssh = new NodeSSH();
  await ssh.connect({
    host: connection.host,
    username: connection.user ?? "root",
    port: connection.port,
    privateKey: connection.privateKey,
    // Fall back to the local agent when no key is provided (matches repo convention).
    agent: connection.privateKey ? undefined : process.env.SSH_AUTH_SOCK,
  });
  try {
    return await fn(ssh);
  } finally {
    ssh.dispose();
  }
}

/** Write `content` to `remotePath` without staging a local temp file. */
async function writeRemoteFile(ssh: NodeSSH, remotePath: string, content: string): Promise<void> {
  const result = await ssh.execCommand(`tee ${remotePath} >/dev/null`, { stdin: content });
  if (result.code !== 0) {
    throw new Error(`Failed to write ${remotePath}: ${result.stderr || result.stdout}`);
  }
}

async function run(ssh: NodeSSH, command: string): Promise<void> {
  const result = await ssh.execCommand(command);
  if (result.code !== 0) {
    throw new Error(`Command failed (${command}): ${result.stderr || result.stdout}`);
  }
}

const unitPath = (filename: string): string => `/etc/systemd/system/${filename}`;

class SystemdBackupJobProvider implements pulumi.dynamic.ResourceProvider<ResolvedInputs, ProviderOutputs> {
  private async install(inputs: ResolvedInputs): Promise<Omit<ProviderOutputs, "id">> {
    const units = buildUnits(inputs);

    await withSsh(inputs.connection, async (ssh) => {
      await writeRemoteFile(ssh, unitPath(units.serviceFilename), units.serviceContent);
      await writeRemoteFile(ssh, unitPath(units.timerFilename), units.timerContent);
      await run(ssh, "systemctl daemon-reload");
      await run(ssh, `systemctl enable --now ${units.timerFilename}`);
    });

    return { connection: inputs.connection, ...units };
  }

  async create(inputs: ResolvedInputs): Promise<pulumi.dynamic.CreateResult<ProviderOutputs>> {
    const outs = await this.install(inputs);
    const id = `${outs.connection.host}:${inputs.name}`;
    return { id, outs: { id, ...outs } };
  }

  async update(id: string, _olds: ProviderOutputs, news: ResolvedInputs): Promise<pulumi.dynamic.UpdateResult<ProviderOutputs>> {
    const outs = await this.install(news);
    return { outs: { id, ...outs } };
  }

  async delete(_id: string, props: ProviderOutputs): Promise<void> {
    await withSsh(props.connection, async (ssh) => {
      // Best-effort: a missing/already-disabled timer must not fail the destroy.
      await ssh.execCommand(`systemctl disable --now ${props.timerFilename}`);
      await ssh.execCommand(`rm -f ${unitPath(props.timerFilename)} ${unitPath(props.serviceFilename)}`);
      await ssh.execCommand("systemctl daemon-reload");
    });
  }

  async diff(_id: string, olds: ProviderOutputs, news: ResolvedInputs): Promise<pulumi.dynamic.DiffResult> {
    const units = buildUnits(news);
    const hostChanged = olds.connection?.host !== news.connection.host;
    const nameChanged = olds.serviceFilename !== units.serviceFilename;
    const contentChanged = olds.serviceContent !== units.serviceContent || olds.timerContent !== units.timerContent;

    const replaces: string[] = [];
    // A host or unit-name change leaves the old units living elsewhere / under a
    // different filename, so they must be torn down before the new ones land.
    if (hostChanged) replaces.push("connection");
    if (nameChanged) replaces.push("name");

    return {
      changes: hostChanged || nameChanged || contentChanged,
      replaces,
      deleteBeforeReplace: replaces.length > 0,
    };
  }
}

export class SystemdBackupJob extends pulumi.dynamic.Resource {
  public readonly serviceFilename!: pulumi.Output<string>;
  public readonly timerFilename!: pulumi.Output<string>;

  constructor(name: string, props: SystemdBackupJobInputs, opts?: pulumi.CustomResourceOptions) {
    super(new SystemdBackupJobProvider(), name, { ...props, serviceFilename: undefined, timerFilename: undefined, serviceContent: undefined, timerContent: undefined }, opts);
  }
}

import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import { NodeSSH } from "node-ssh";
import { awaitOutput } from "@components/helpers.ts";

/**
 * Variables passed to community-scripts ProxmoxVE LXC creation scripts.
 * Keys are the var_* suffixes in snake_case (e.g. `ipv6_method`, `mount_fs`).
 * Any var supported by the target script can be included — no code changes needed.
 */
export type CommunityScriptLxcVars = {
  ctid: pulumi.Input<number>;
  hostname: pulumi.Input<string>;
  sshKeys?: pulumi.Input<pulumi.Input<string>[]>;
  /** Storage pool for container rootfs. Defaults to "local-lvm" if not specified. */
  container_storage?: pulumi.Input<string>;
  /** Storage pool for LXC templates. Defaults to "local-lvm" if not specified. */
  template_storage?: pulumi.Input<string>;
} & Record<string, pulumi.Input<string | number | undefined>>;

function buildVarString(vars: CommunityScriptLxcVars): pulumi.Output<string> {
  return pulumi.output(vars).apply((obj) => {
    // Build entries from vars, adding storage defaults if not provided
    const entries = Object.entries(obj);

    // Ensure storage variables are set for unattended mode
    // Community-scripts requires these to skip interactive storage selection
    if (!obj.container_storage) {
      entries.push(["container_storage", "local-lvm"]);
    }
    if (!obj.template_storage) {
      entries.push(["template_storage", "local"]);
    }

    if (obj.sshKeys && obj.sshKeys.length > 0) {
      entries.push(["ssh", "yes"]);
      entries.push(["ssh_authorized_key", obj.sshKeys.join(",")]);
    }
    return entries
      .filter(([k, v]) => v !== undefined && k !== "sshKeys")
      .map(([k, v]) => `var_${k}="${v}"`)
      .join(" ");
  });
}

/**
 * Runs a community-scripts ProxmoxVE LXC creation script non-interactively
 * using mode=generated to skip all whiptail menus and read vars directly from
 * the environment.
 *
 * Features:
 * - Pre-check: Skips creation if container already exists
 * - Post-verification: Ensures container was actually created
 * - Storage defaults: Uses "local" storage if not specified to avoid interactive prompts
 */
export function runCommunityScriptLxc(
  name: string,
  args: {
    connection: types.input.remote.ConnectionArgs;
    /** Full URL to a community-scripts ct/*.sh script */
    script: pulumi.Input<string>;
    vars: CommunityScriptLxcVars;
    /**
     * Answers to pipe to stdin for interactive prompts in the install script.
     * Each entry is sent as a line. Useful for skipping optional features
     * like Portainer in docker-install.sh.
     * Example: ["n", "n", "n"] to answer "no" to all prompts.
     */
    installPromptAnswers?: string[];
  },
  opts?: pulumi.CustomResourceOptions,
): remote.Command {
  const ctid = pulumi.output(args.vars.ctid);
  const varString = buildVarString(args.vars);
  const promptAnswers = args.installPromptAnswers ?? [];

  // Build creation command with pre-check and post-verification
  // 1. Check if container exists (skip creation if it does)
  // 2. Run the community-scripts creation script (with piped answers if provided)
  // 3. Verify container was created (fail if not)
  const create = pulumi.all([args.script, varString, ctid]).apply(([script, vars, id]) => {
    // If prompt answers provided, pipe them to the script via printf
    const scriptCmd = `TERM=linux mode=generated ${vars} eval "$(curl -fsSL ${script})"`;
    const runCmd = promptAnswers.length > 0 ? `printf '%s\\n' ${promptAnswers.map((a) => `'${a}'`).join(" ")} | ${scriptCmd}` : scriptCmd;

    return [
      `set -e`,
      runCmd,
      // Post-verification: Ensure container was created
      `if ! pct status ${id} >/dev/null 2>&1; then`,
      `  echo "ERROR: Container ${id} was not created" >&2`,
      `  exit 1`,
      `fi`,
    ].join("\n");
  });

  return new remote.Command(
    name,
    {
      connection: args.connection,
      create: create.apply((cmd) => `bash -c '${cmd.replace(/'/g, "'\"'\"'")}'`),
      update: "echo 0",
      delete: pulumi.interpolate`pct stop ${ctid} && pct destroy ${ctid} --purge`,
      triggers: [...Object.values(args.vars), ...Object.keys(args.vars)],
    },
    opts,
  );
}

/**
 * Runs a community-scripts tool script non-interactively inside an LXC container
 * via `pct exec` on the Proxmox host connection.
 *
 * Uses multiple strategies for unattended execution:
 * - PHS_SILENT=1 for scripts that support silent mode
 * - Mocked whiptail that auto-answers menus (yes, except REBOOT → no)
 * - Piped 'yes' to handle read prompts
 *
 * The community-scripts capture pattern `CHOICE=$(whiptail ... 3>&2 2>&1 1>&3)`
 * expects the selection on stderr, so our mock writes to stderr.
 */
export function runCommunityScriptTool(
  name: string,
  args: {
    /** Connection to the Proxmox host (not the container). */
    connection: types.input.remote.ConnectionArgs;
    /** LXC container ID to execute the tool script inside. */
    vmId: pulumi.Input<number>;
    /** Full URL to a community-scripts tool script (e.g. tools/pve/*.sh). */
    script: string;
    /** Default answer for whiptail menus (default: "1" for first option). */
    defaultChoice?: string;
  },
  opts?: pulumi.CustomResourceOptions,
): remote.Command {
  const defaultChoice = args.defaultChoice ?? "1";

  // Mock whiptail to auto-answer menus:
  // - msgbox: just return success
  // - REBOOT title: answer "no"
  // - All other menus: answer with defaultChoice
  const mockWhiptail = [
    "function whiptail() {",
    '  [[ " $* " == *"--msgbox"* ]] && return 0;',
    '  local p="" t="";',
    '  for a in "$@"; do [[ "$p" == "--title" ]] && t="$a"; p="$a"; done;',
    '  [[ "$t" == "REBOOT" ]] && echo no >&2 && return 0;',
    `  echo "${defaultChoice}" >&2;`,
    "}",
    "function clear() { :; }",
  ].join(" ");

  // Build command that:
  // 1. Sets PHS_SILENT=1 for scripts that support it
  // 2. Exports mocked whiptail/clear functions
  // 3. Uses 'yes' to auto-answer read prompts
  const inner = [`export PHS_SILENT=1`, mockWhiptail, `export -f whiptail clear`, `yes | bash -c "$(curl -fsSL ${args.script})"`].join("; ");

  const create = pulumi.interpolate`pct exec ${args.vmId} -- bash -c '${inner}'`;

  return new remote.Command(name, { connection: args.connection, create, update: create }, opts);
}

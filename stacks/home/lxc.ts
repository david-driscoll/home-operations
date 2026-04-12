import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";

/** Community-scripts post-install tool for Proxmox Backup Server. */
export const POST_PBS_INSTALL_URL = "https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/tools/pve/post-pbs-install.sh";

/**
 * Variables passed to community-scripts ProxmoxVE LXC creation scripts.
 * Keys are the var_* suffixes in snake_case (e.g. `ipv6_method`, `mount_fs`).
 * Any var supported by the target script can be included — no code changes needed.
 */
export type CommunityScriptLxcVars = {
  ctid: number;
  hostname: string;
} & Record<string, string | number | undefined>;

function buildVarString(vars: CommunityScriptLxcVars): string {
  return Object.entries(vars)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `var_${k}="${v}"`)
    .join(" ");
}
function buildEnv(vars: CommunityScriptLxcVars): Record<string, any> {
  return Object.fromEntries(
    Object.entries(vars)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`var_${k}`, `${v}`])
      .concat([["mode", "generated"]]),
  );
}

/**
 * Runs a community-scripts ProxmoxVE LXC creation script non-interactively
 * using mode=generated to skip all whiptail menus and read vars directly from
 * the environment.
 *
 * When `enabled` is false the command echoes a skip message instead, allowing
 * the resource to remain in the graph as a dependency anchor.
 */
export function runCommunityScriptLxc(
  name: string,
  args: {
    connection: types.input.remote.ConnectionArgs;
    /** Full URL to a community-scripts ct/*.sh script */
    script: pulumi.Input<string>;
    vars: CommunityScriptLxcVars;
  },
  opts?: pulumi.CustomResourceOptions,
): remote.Command {
  const create = pulumi.output(args.script).apply((script) => {
    return `bash -c 'clear() { :; }; eval "$(curl -fsSL ${script})"'`;
  });

  return new remote.Command(
    name,
    {
      connection: args.connection,
      environment: buildEnv(args.vars),
      create,
      update: create,
      delete: `pct delete ${args.vars.ctid}`,
      triggers: [...Object.values(args.vars), ...Object.keys(args.vars)],
    },
    opts,
  );
}

/**
 * Runs a community-scripts tool script non-interactively inside an LXC container
 * via `pct exec` on the Proxmox host connection (same connection pattern as
 * runCommunityScriptLxc). Whiptail menus are automatically answered "yes" for all
 * prompts except REBOOT, which is always answered "no" — handle reboots separately
 * via `pct reboot`.
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
  },
  opts?: pulumi.CustomResourceOptions,
): remote.Command {
  const mockWhiptail = [
    "function whiptail() {",
    '  [[ " $* " == *"--msgbox"* ]] && return 0;',
    '  local p="" t="";',
    '  for a in "$@"; do [[ "$p" == "--title" ]] && t="$a"; p="$a"; done;',
    '  [[ "$t" == "REBOOT" ]] && echo no >&2 && return 0;',
    "  echo yes >&2;",
    "}",
    "function clear() { :; }",
  ].join(" ");

  const inner = `${mockWhiptail}; export -f whiptail clear; echo y | bash -c "$(curl -fsSL ${args.script})"`;
  const create = pulumi.interpolate`pct exec ${args.vmId} -- bash -c '${inner}'`;

  return new remote.Command(name, { connection: args.connection, create, update: create }, opts);
}

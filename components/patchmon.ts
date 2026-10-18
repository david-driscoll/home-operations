/**
 * PatchMon agent enrollment for hosts Pulumi already reaches over SSH.
 *
 * The server runs in equestria (kubernetes/apps/equestria/utils/patchmon). Each
 * host enrolls itself with an auto-enrollment token, then installs the agent
 * with the per-host credentials enrollment hands back. The agent is
 * upstream's Go binary, run as root by systemd (`patchmon-agent serve`).
 *
 * ## Why not upstream's one-liner
 *
 * The UI's "auto-enrollment" command is
 * `curl ".../api/v1/auto-enrollment/script?type=direct-host&token_key=...&token_secret=..." | sh`.
 * The secret rides in the query string, and Traefik's access log records the
 * full request line of every 200 -- so every run would write the enrollment
 * secret into Loki. The script below makes the same two calls that script
 * makes (`POST /auto-enrollment/enroll`, then the per-host installer), with
 * the secret in a header instead.
 *
 * ## The token
 *
 * Created by hand in the PatchMon UI once the server is up (Settings ->
 * Integrations -> Auto-Enrollment, type "direct-host"); the API that mints one
 * needs a logged-in session, so Pulumi cannot. Until it is in OpenBao the
 * command still exists but runs a no-op, so landing this code before the
 * server is deployed fails nothing. Writing the token changes the command's
 * stdin, which re-runs it on the next `pulumi up` and enrolls the host.
 * docs/runbooks/patchmon.md has the steps.
 */

import { remote, type types } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { all, type CustomResourceOptions, interpolate, type Output, secret } from "@pulumi/pulumi";
import type { GlobalResources } from "./globals.ts";

/** Where the auto-enrollment token lives, under the `secrets` mount. */
export const PATCHMON_ENROLLMENT_PATH = "clusters/equestria/apps/patchmon/enrollment";

/**
 * The URL agents report to. The tailnet name, not the LAN one: the off-site
 * Proxmox hosts have no LAN path to equestria, and every one of them reaches
 * tag:apps:443 through the `default-apps-access` grant.
 *
 * Must equal PatchMon's Settings -> Server URL. The installer bakes THAT value
 * into the agent's config, so the script below checks the two agree.
 */
export function patchmonUrl(globals: GlobalResources): Output<string> {
  return interpolate`https://patchmon.${globals.tailscaleDomain}`;
}

export interface PatchmonAgentArgs {
  globals: GlobalResources;
  connection: types.input.remote.ConnectionArgs;
  /** The name the host is listed under in PatchMon. */
  friendlyName: string;
}

/**
 * Enroll a host in PatchMon and install the agent on it. Idempotent: a host
 * already enrolled against this server whose agent answers `ping` is left
 * alone, so re-running costs one SSH round trip.
 */
export function installPatchmonAgent(name: string, args: PatchmonAgentArgs, opts: CustomResourceOptions): remote.Command {
  const token = args.globals.store.tryGetSecretByPath<{ token_key: string; token_secret: string }>(PATCHMON_ENROLLMENT_PATH);
  const script = all([token, patchmonUrl(args.globals)]).apply(([token, url]) => {
    if (!token?.token_key || !token?.token_secret) {
      pulumi.log.warn(`No PatchMon enrollment token at secrets/${PATCHMON_ENROLLMENT_PATH} — ${args.friendlyName} is not enrolled. See docs/runbooks/patchmon.md.`);
      return patchmonSkipScript(args.friendlyName);
    }
    return patchmonEnrollScript({ url, friendlyName: args.friendlyName, tokenKey: token.token_key, tokenSecret: token.token_secret });
  });

  return new remote.Command(
    name,
    {
      connection: args.connection,
      // The script, secrets included, arrives on stdin rather than in the
      // command line, which the remote sshd would otherwise hand to `sh -c`
      // where any process on the host can read it from /proc.
      create: "sh -s",
      stdin: secret(script),
    },
    opts,
  );
}

export function patchmonSkipScript(friendlyName: string): string {
  return `echo ${shellQuote(`patchmon: no enrollment token in OpenBao yet, ${friendlyName} not enrolled (docs/runbooks/patchmon.md)`)}\n`;
}

/** POSIX sh (dash on Proxmox). Needs curl, which every Proxmox VE install has. */
export function patchmonEnrollScript(args: { url: string; friendlyName: string; tokenKey: string; tokenSecret: string }): string {
  // Interpolated into JSON by printf below, so it must not need escaping.
  if (!/^[A-Za-z0-9 ._-]+$/.test(args.friendlyName)) throw new Error(`PatchMon friendly name '${args.friendlyName}' must match [A-Za-z0-9 ._-]+`);
  const url = args.url.replace(/\/+$/, "");

  return `set -eu
PATCHMON_URL=${shellQuote(url)}
FRIENDLY_NAME=${shellQuote(args.friendlyName)}
AUTO_ENROLLMENT_KEY=${shellQuote(args.tokenKey)}
AUTO_ENROLLMENT_SECRET=${shellQuote(args.tokenSecret)}

CONFIG=/etc/patchmon/config.yml
CREDENTIALS=/etc/patchmon/credentials.yml
AGENT=/usr/local/bin/patchmon-agent

# The value of a top-level \`key: value\` line, unquoted. The agent writes both
# files as flat YAML.
field() {
  sed -n "s/^$1:[[:space:]]*//p" "$2" 2>/dev/null | head -n 1 | tr -d "\\"' \\r"
}

case "$(uname -m)" in
  x86_64 | amd64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "patchmon: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

# Secrets go to curl through a 0600 header file (mktemp's mode), never argv.
# printf is a shell builtin, so writing it does not expose them either.
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

# Fetch upstream's per-host installer with a host's own credentials and run it.
# Leaves the HTTP status in $install_status; runs the installer only on a 200.
install_agent() {
  printf 'X-API-ID: %s\\nX-API-KEY: %s\\n' "$1" "$2" >"$workdir/api-headers"
  install_status=$(curl -sS -o "$workdir/install.sh" -w '%{http_code}' -H "@$workdir/api-headers" \\
    "$PATCHMON_URL/api/v1/hosts/install?arch=$arch&os=linux") || install_status=000
  [ "$install_status" = 200 ] || return 0
  # The installer carries PatchMon's Settings -> Server URL, not the URL it was
  # fetched from, and writes it into the agent config. Refuse a mismatch BEFORE
  # installing: an agent pointed elsewhere would miss step 1 on every run, and
  # stopping here leaves any host_id stub in place for the re-run to reuse.
  served_url=$(sed -n 's/^export PATCHMON_URL="\\(.*\\)"$/\\1/p' "$workdir/install.sh" | head -n 1)
  if [ "\${served_url%/}" != "$PATCHMON_URL" ]; then
    echo "patchmon: PatchMon's Settings -> Server URL is '$served_url'. Set it to $PATCHMON_URL and re-run; nothing was installed." >&2
    exit 1
  fi
  sh "$workdir/install.sh" </dev/null || { echo "patchmon: the agent installer failed" >&2; exit 1; }
}

configured_server=$(field patchmon_server "$CONFIG")
configured_server=\${configured_server%/}

# 1. The steady state: enrolled against this server and reporting.
if [ "$configured_server" = "$PATCHMON_URL" ] && [ -x "$AGENT" ] &&
  "$AGENT" ping >/dev/null 2>&1 && systemctl is-active --quiet patchmon-agent; then
  echo "patchmon: $FRIENDLY_NAME is enrolled and reporting"
  exit 0
fi

# 2. Credentials for this server already on disk, but the agent is not healthy:
#    reinstall with them rather than enrolling the machine a second time.
host_id=""
installed=false
if [ "$configured_server" = "$PATCHMON_URL" ]; then
  host_id=$(field host_id "$CONFIG")
  case "$host_id" in *[!A-Za-z0-9-]*) host_id="" ;; esac
  api_id=$(field api_id "$CREDENTIALS")
  api_key=$(field api_key "$CREDENTIALS")
  if [ -n "$api_id" ] && [ -n "$api_key" ]; then
    install_agent "$api_id" "$api_key"
    case "$install_status" in
      200) installed=true ;;
      401) echo "patchmon: the credentials on disk were rejected, enrolling again" ;;
      *)
        echo "patchmon: could not check the credentials on disk (HTTP $install_status). Not enrolling, so a transient failure cannot create a duplicate host." >&2
        exit 1
        ;;
    esac
  fi
fi

# 3. Enroll. Sending host_id (when a previous run left one) re-issues
#    credentials for the existing PatchMon host instead of creating another.
if [ "$installed" = false ]; then
  printf 'X-Auto-Enrollment-Key: %s\\nX-Auto-Enrollment-Secret: %s\\n' "$AUTO_ENROLLMENT_KEY" "$AUTO_ENROLLMENT_SECRET" >"$workdir/enroll-headers"
  host_id_field=""
  [ -z "$host_id" ] || host_id_field=$(printf ',"host_id":"%s"' "$host_id")
  body=$(printf '{"friendly_name":"%s","machine_id":"%s"%s,"metadata":{"hostname":"%s"}}' \\
    "$FRIENDLY_NAME" "$(cat /etc/machine-id)" "$host_id_field" "$(hostname)")
  status=$(curl -sS -o "$workdir/enroll.json" -w '%{http_code}' -X POST \\
    -H "@$workdir/enroll-headers" -H "Content-Type: application/json" -d "$body" \\
    "$PATCHMON_URL/api/v1/auto-enrollment/enroll") || status=000
  case "$status" in
    200 | 201) ;;
    409)
      echo "patchmon: PatchMon already lists $FRIENDLY_NAME but this machine holds no working credentials for it: $(cat "$workdir/enroll.json"). Delete the host in PatchMon and re-run." >&2
      exit 1
      ;;
    *)
      echo "patchmon: enrollment failed with HTTP $status: $(cat "$workdir/enroll.json" 2>/dev/null)" >&2
      exit 1
      ;;
  esac
  api_id=$(grep -o '"api_id":"[^"]*"' "$workdir/enroll.json" | cut -d'"' -f4)
  api_key=$(grep -o '"api_key":"[^"]*"' "$workdir/enroll.json" | cut -d'"' -f4)
  if [ -z "$api_id" ] || [ -z "$api_key" ]; then
    echo "patchmon: enrollment returned no credentials" >&2
    exit 1
  fi
  # Same as upstream's direct-host script: if the installer download fails
  # below, the next run finds this host_id and re-issues credentials for the
  # host just created, instead of hitting 409 on a duplicate.
  if [ ! -f "$CONFIG" ]; then
    new_host_id=$(grep -o '"id":"[^"]*"' "$workdir/enroll.json" | tail -n 1 | cut -d'"' -f4)
    mkdir -p /etc/patchmon
    (umask 077 && printf 'patchmon_server: "%s"\\nhost_id: "%s"\\n' "$PATCHMON_URL" "$new_host_id" >"$CONFIG")
  fi
  install_agent "$api_id" "$api_key"
  if [ "$install_status" != 200 ]; then
    echo "patchmon: could not download the agent installer (HTTP $install_status). Re-run; the host will not be enrolled twice." >&2
    exit 1
  fi
  echo "patchmon: enrolled $FRIENDLY_NAME"
else
  echo "patchmon: repaired $FRIENDLY_NAME with its existing credentials"
fi
`;
}

/** Single-quote a value for POSIX sh. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

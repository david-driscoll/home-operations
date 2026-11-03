import { readFileSync } from "node:fs";
import { remote, type types } from "@pulumi/command";
import { all, ComponentResource, type ComponentResourceOptions, type Input, interpolate, type Output, output, type Resource, secret } from "@pulumi/pulumi";
import { parseSetupResponse, renderDashboardEnv, renderServerConfig, type ServerSecrets, type SetupResult } from "./server.ts";

/** Where the server lives on the VM. Docker volumes hold the state; this holds the config. */
export const NETBIRD_DIR = "/opt/netbird";

const composeFile = readFileSync(new URL("./compose.yaml", import.meta.url), "utf8");

export interface NetbirdServerArgs {
  /** SSH to the VM. Over the tailnet from the Pulumi operator (tag:egress -> tag:netbird-edge, root). */
  connection: types.input.remote.ConnectionArgs;
  /** `netbird.<root domain>`. */
  domain: Input<string>;
  secrets: { [K in keyof ServerSecrets]: Input<string> };
  /**
   * Create the owner through `POST /api/setup` and return its bootstrap PAT.
   * Only the primary does this: a standby restores the primary's data instead
   * (#3001), and setup only ever succeeds once per store.
   */
  setup?: { email: Input<string>; password: Input<string>; name: Input<string>; patExpireInDays: number };
  /** Anything that must exist first, e.g. the DNS record Let's Encrypt validates against. */
  dependsOn?: Input<Resource>[];
}

/**
 * The NetBird combined server, deployed onto an existing Docker host.
 *
 * Writes compose.yaml, .env, config.yaml and dashboard.env into NETBIRD_DIR and
 * runs `docker compose up` whenever any of them changes. Rerunning is safe: the
 * files are rewritten whole and compose only recreates what changed.
 */
export class NetbirdServer extends ComponentResource {
  /** The owner's id, email and bootstrap PAT. Undefined when `setup` was not asked for. */
  public readonly setupResult?: Output<SetupResult>;

  constructor(name: string, args: NetbirdServerArgs, opts?: ComponentResourceOptions) {
    super("custom:netbird:Server", name, {}, opts);

    const connection = args.connection;
    const cro = { parent: this };

    // cloud-init installs Docker; on a fresh VM the first SSH session can
    // arrive before it finishes.
    const ready = new remote.Command(`${name}-ready`, { connection, create: "cloud-init status --wait >/dev/null 2>&1 || true; docker version --format '{{.Server.Version}}'" }, { ...cro, dependsOn: args.dependsOn });

    const config = secret(
      all([args.domain, args.secrets.relayAuthSecret, args.secrets.datastoreEncryptionKey, args.secrets.sessionCookieEncryptionKey]).apply(
        ([domain, relayAuthSecret, datastoreEncryptionKey, sessionCookieEncryptionKey]) => renderServerConfig({ domain, relayAuthSecret, datastoreEncryptionKey, sessionCookieEncryptionKey }),
      ),
    );
    const files: Record<string, Input<string>> = {
      "compose.yaml": composeFile,
      ".env": interpolate`NETBIRD_DOMAIN=${args.domain}\n`,
      "config.yaml": config,
      "dashboard.env": output(args.domain).apply(domain => renderDashboardEnv({ domain })),
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
            triggers: [content],
            logging: "stderr",
          },
          { ...cro, dependsOn: [ready] },
        ),
    );

    const up = new remote.Command(
      `${name}-up`,
      {
        connection,
        create: `cd ${NETBIRD_DIR} && docker compose pull --quiet && docker compose up -d --remove-orphans`,
        triggers: Object.values(files),
      },
      { ...cro, dependsOn: written },
    );

    if (args.setup) {
      const setup = args.setup;
      const body = secret(
        all([setup.email, setup.password, setup.name]).apply(([email, password, displayName]) => JSON.stringify({ email, password, name: displayName, create_pat: true, pat_expire_in: setup.patExpireInDays })),
      );
      // Through Traefik on the VM itself (-k: the Let's Encrypt cert may not be
      // issued yet), retrying until the server answers. Runs once: setup
      // refuses a second time, and a 412 here means the store already has an
      // owner -- left as a failure so nobody overwrites the stored PAT with
      // nothing.
      const command = new remote.Command(
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
        { ...cro, dependsOn: [up], additionalSecretOutputs: ["stdout", "stdin"] },
      );
      this.setupResult = secret(command.stdout.apply(parseSetupResponse));
    }

    this.registerOutputs({ setupResult: this.setupResult });
  }
}

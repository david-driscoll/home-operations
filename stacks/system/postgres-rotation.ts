/**
 * OpenBao's PostgreSQL database secrets engine — phase 3b of
 * docs/postgres-credentials/PLAN.md.
 *
 * Configures the `database` mount and one static role per opted-in app, so
 * OpenBao owns those roles' passwords and rotates them on a schedule. It lives
 * in this stack because it is estate configuration written INTO OpenBao, which
 * is exactly what this stack is for.
 *
 * ## Two gates, and they mean different things
 *
 * `ENGINE_ENABLED` decides whether the mount exists at all. It is off until the
 * `pulumi` policy has been widened — the policy grants no capability on
 * `sys/mounts/database` or `database/*` by default, and applying the widened
 * one needs a root ceremony (see bootstrap/openbao/equestria-init.sh, and the
 * standby-only caveat on sys/generate-root). With it off this file makes no
 * API call, so `stacks/system` cannot be broken by a missing grant — and that
 * matters, because every other stack reads what this one publishes.
 *
 * `ROTATION_TRANCHE` decides which apps get a static role. Creating one
 * ROTATES THAT APP'S PASSWORD IMMEDIATELY and there is no way to ask OpenBao
 * not to: rotation_period is mandatory and openbao#284 (disable auto rotation)
 * is still open. So this grows a couple of apps at a time, not all at once.
 *
 * ## Why the app list is discovered, not typed out
 *
 * Retiring a C# generator only to hand-maintain a TypeScript array would be a
 * lateral move. `discoverPostgresApps()` reads the same signal the Kubernetes
 * side uses — a `ks.yaml` referencing `components/postgres` — so adding the
 * component stays the only edit, and a typo in the tranche fails the run
 * instead of silently rotating nothing.
 *
 * The Flux artifact the Pulumi operator checks out is the whole repository
 * (the `home-operations` GitRepository sets neither `ignore` nor `include`;
 * `spec.fluxSource.dir` only selects the working directory), so the glob
 * resolves in-cluster exactly as it does locally.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Provider as VaultProvider } from "@pulumi/vault";
import * as vault from "@pulumi/vault";
import { globSync } from "glob";
import { parseAllDocuments } from "yaml";

/** Repository root, two levels up from `stacks/system`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * ON since the widened `pulumi` policy was applied by root ceremony, 2026-08-24.
 *
 * Verified against the live policy before flipping: it grants
 * `sys/mounts/database` (+`/tune`, both with sudo), `database/config/*`,
 * `database/static-roles/*` and `database/rotate-role/*`, and grants nothing on
 * `database/creds/*` — so reaching for dynamic roles is still a 403. The
 * `database/` mount did not exist yet, so this creates it from a clean state.
 *
 * Turning this on creates the mount and nothing else. Because `verifyConnection`
 * defaults true, the apply opens a connection as `baoadmin` over the client
 * certificate — proving that path WITHOUT touching a single password. That is
 * the last cheap checkpoint before rotation becomes irreversible, and the whole
 * reason this is separate from ROTATION_TRANCHE.
 */
const ENGINE_ENABLED = true;

/**
 * Apps whose password OpenBao owns. Every entry must be a discovered app.
 *
 * Start with apps that tolerate a restart and are not on the critical path.
 * `openbao` can never appear here — it authenticates with a client certificate
 * and its role has no password to rotate.
 */
const ROTATION_TRANCHE: readonly string[] = [];

/** How often OpenBao rotates a static role's password. */
const ROTATION_PERIOD_SECONDS = 720 * 60 * 60; // 30 days

/**
 * Every app that gets a database from `components/postgres`, read off the
 * Kubernetes tree rather than listed here.
 *
 * Matches the component path exactly: `components/postgres/superuser` and
 * `components/postgres/client-cert` are siblings that modify an app's role,
 * not apps in their own right, so an endsWith() check would double-count.
 */
export function discoverPostgresApps(): string[] {
  const apps = new Set<string>();
  for (const file of globSync("kubernetes/apps/**/ks.yaml", { cwd: REPO_ROOT })) {
    const raw = readFileSync(join(REPO_ROOT, file), "utf8");
    for (const doc of parseAllDocuments(raw)) {
      const ks = doc.toJS({ maxAliasCount: -1 }) as { kind?: string; metadata?: { name?: string }; spec?: { components?: string[] } } | null;
      if (ks?.kind !== "Kustomization") continue;
      const name = ks.metadata?.name;
      if (!name) continue;
      const uses = (ks.spec?.components ?? []).some(c => c.split("/").filter(Boolean).slice(-2).join("/") === "components/postgres");
      if (uses) apps.add(name);
    }
  }
  return [...apps].sort();
}

export function configurePostgresRotation(provider: VaultProvider): void {
  const discovered = discoverPostgresApps();

  // A tranche entry that is not a real app would otherwise create a static role
  // for a PostgreSQL role that does not exist, which OpenBao accepts and then
  // fails to rotate on a schedule -- a failure that surfaces days later in a
  // log nobody reads. Fail the run instead.
  const unknown = ROTATION_TRANCHE.filter(a => !discovered.includes(a));
  if (unknown.length > 0) {
    throw new Error(`ROTATION_TRANCHE names apps with no components/postgres reference: ${unknown.join(", ")}. ` + `Discovered: ${discovered.join(", ")}`);
  }

  if (!ENGINE_ENABLED) return;

  const mount = new vault.database.SecretsMount(
    "postgres-rotation",
    {
      path: "database",
      description: "PostgreSQL static-role rotation for equestria (docs/postgres-credentials)",
      postgresqls: [
        {
          name: "postgres",
          pluginName: "postgresql-database-plugin",
          // Certificate paths, NOT the provider's inline tlsCertificate /
          // privateKey fields. OpenBao reads these off its own filesystem,
          // where kubernetes/apps/kube-system/openbao mounts them -- so the
          // baoadmin superuser key never enters Pulumi state or the Minio
          // backend. Pulumi only ever writes a path string.
          connectionUrl:
            "postgresql://baoadmin@postgres-rw.database.svc.cluster.local:5432/postgres" +
            "?sslmode=verify-full" +
            "&sslcert=/etc/pg-admin-certs/tls.crt" +
            "&sslkey=/etc/pg-admin-certs/tls.key" +
            "&sslrootcert=/etc/pg-admin-certs/ca.crt",
          // Hash passwords before they cross the wire to PostgreSQL, so a
          // rotated password never appears in a server log.
          passwordAuthentication: "scram-sha-256",
          // Least privilege: the connection may only be used by roles we have
          // deliberately opted in.
          allowedRoles: [...ROTATION_TRANCHE],
          // Default, stated for the record: creating this resource opens a
          // connection as baoadmin. That is the checkpoint -- a broken
          // certificate fails the run rather than surfacing at first rotation.
          verifyConnection: true,
        },
      ],
    },
    { provider },
  );

  for (const app of ROTATION_TRANCHE) {
    new vault.database.SecretBackendStaticRole(
      `postgres-rotation-${app}`,
      {
        backend: mount.path,
        dbName: "postgres",
        name: app,
        username: app,
        rotationPeriod: ROTATION_PERIOD_SECONDS,
        // Do NOT add selfManagedPassword, passwordWo or skipImportRotation:
        // all three are Vault-Enterprise-only and OpenBao rejects them. The
        // last one is the one you will want and cannot have -- creating this
        // resource rotates the password immediately, by design and without an
        // opt-out (openbao#284).
      },
      { provider, parent: mount },
    );
  }
}

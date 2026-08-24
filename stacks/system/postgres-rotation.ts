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
 * The tranche is not configured here at all — it is whichever apps carry
 * `components/postgres/rotate`. Adding that component ROTATES THAT APP'S
 * PASSWORD IMMEDIATELY and there is no way to ask OpenBao not to:
 * rotation_period is mandatory and openbao#284 (disable auto rotation) is
 * still open. So it grows a couple of apps at a time, not all at once.
 *
 * ## Why the app list is discovered, not typed out
 *
 * Retiring a C# generator only to hand-maintain a TypeScript array would be a
 * lateral move. Both lists read the same signal the Kubernetes side uses — a
 * `ks.yaml` referencing `components/postgres` or its `rotate` sibling — so
 * adding a component stays the only edit, and the two halves of an opt-in
 * cannot disagree.
 *
 * That last part is the important one. The Kubernetes half drops
 * `passwordSecret` and repoints the ExternalSecret; the OpenBao half rotates
 * the password. If only one of them landed, the app would be holding a
 * credential it cannot use. Deriving both from one signal makes that
 * impossible rather than merely unlikely.
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
 * reason this is separate from opting an app in.
 */
const ENGINE_ENABLED = true;

/** How often OpenBao rotates a static role's password. */
const ROTATION_PERIOD_SECONDS = 720 * 60 * 60; // 30 days

/**
 * Apps referencing a given component, read off the Kubernetes tree.
 *
 * Matched by exact path suffix, so `components/postgres` does not also match
 * its `superuser`, `client-cert` and `rotate` siblings — those modify an app's
 * role, they are not apps in their own right.
 */
function discoverAppsUsing(component: string): string[] {
  const suffix = `/${component}`;
  const apps = new Set<string>();
  for (const file of globSync("kubernetes/apps/**/ks.yaml", { cwd: REPO_ROOT })) {
    const raw = readFileSync(join(REPO_ROOT, file), "utf8");
    for (const doc of parseAllDocuments(raw)) {
      const ks = doc.toJS({ maxAliasCount: -1 }) as { kind?: string; metadata?: { name?: string }; spec?: { components?: string[] } } | null;
      if (ks?.kind !== "Kustomization") continue;
      const name = ks.metadata?.name;
      if (!name) continue;
      if (
        (ks.spec?.components ?? []).some(c =>
          `/${c
            .split("/")
            .filter(s => s && s !== "..")
            .join("/")}`.endsWith(suffix),
        )
      )
        apps.add(name);
    }
  }
  return [...apps].sort();
}

/** Every app that gets a database from `components/postgres`. */
export function discoverPostgresApps(): string[] {
  return discoverAppsUsing("components/postgres");
}

/**
 * Apps whose password OpenBao owns — those carrying `components/postgres/rotate`.
 *
 * Discovered rather than listed here on purpose. The Kubernetes side of opting
 * in (drop `passwordSecret`, repoint the ExternalSecret at the generator) and
 * the OpenBao side (create the static role) MUST agree, and the only way to
 * guarantee that is to derive both from the same signal. A hand-maintained
 * array here could disagree with the component, and the failure mode is a
 * rotated password the app cannot read.
 *
 * `openbao` can never appear: it authenticates with a client certificate and
 * its role has no password to rotate. It also left `components/postgres`
 * entirely in phase 2.4a, so it cannot carry the sibling.
 */
export function discoverRotationOptIns(): string[] {
  return discoverAppsUsing("components/postgres/rotate");
}

export function configurePostgresRotation(provider: VaultProvider): void {
  const discovered = discoverPostgresApps();
  const tranche = discoverRotationOptIns();

  // ./rotate without ./postgres would create a static role for a PostgreSQL
  // role that does not exist -- OpenBao accepts that and then fails every
  // scheduled rotation, in a log nobody reads. Fail the run instead.
  const unknown = tranche.filter(a => !discovered.includes(a));
  if (unknown.length > 0) {
    throw new Error(`components/postgres/rotate is on apps that do not use components/postgres: ${unknown.join(", ")}. ` + `Discovered: ${discovered.join(", ")}`);
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
          allowedRoles: tranche,
          // Default, stated for the record: creating this resource opens a
          // connection as baoadmin. That is the checkpoint -- a broken
          // certificate fails the run rather than surfacing at first rotation.
          verifyConnection: true,
        },
      ],
    },
    { provider },
  );

  for (const app of tranche) {
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

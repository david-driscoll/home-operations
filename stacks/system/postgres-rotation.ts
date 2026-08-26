/**
 * OpenBao's PostgreSQL database secrets engine — phase 3b of
 * docs/postgres-credentials/PLAN.md.
 *
 * Configures the `database` mount and one static role per app with a
 * PostgreSQL database, so OpenBao owns those roles' passwords and rotates them
 * on a schedule. It lives in this stack because it is estate configuration
 * written INTO OpenBao, which is exactly what this stack is for.
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
 * `components/postgres`. It used to be the narrower set carrying a
 * `components/postgres/rotate` sibling: rotation is irreversible per app
 * (rotation_period is mandatory and openbao#284 has no opt-out), so phase 4
 * rolled it out a couple of apps at a time. That migration finished, every
 * live consumer rotates, and `passwords.sops.yaml` no longer holds an app
 * password to fall back to — so the sibling was folded into the base
 * component and the two lists collapsed into one.
 *
 * ## Why the app list is discovered, not typed out
 *
 * Retiring a C# generator only to hand-maintain a TypeScript array would be a
 * lateral move. This list reads the same signal the Kubernetes side uses — a
 * `ks.yaml` referencing `components/postgres` — so adding a component stays
 * the only edit, and the two halves cannot disagree.
 *
 * That last part is the important one. The Kubernetes half renders a
 * `DatabaseRole` with no `passwordSecret` and an ExternalSecret pointed at the
 * `static-creds` generator; the OpenBao half creates the static role that
 * generator reads. If only one of them landed, the app would be holding a
 * credential it cannot use. Deriving both from one signal makes that
 * impossible rather than merely unlikely.
 *
 * ## THE ORDERING TRAP, and why this file does not paper over it
 *
 * Creating a static role immediately issues `ALTER ROLE ... PASSWORD` against
 * PostgreSQL. If CNPG has not applied the app's `DatabaseRole` yet, this stack
 * fails outright:
 *
 *     Code: 500 ... error setting credentials: failed to execute query:
 *     ERROR: role "degoog" does not exist (SQLSTATE 42704)
 *
 * That only bites a BRAND-NEW app — a migrated one already had its role from
 * the sops era. A new app ships both halves in one commit, the Pulumi operator
 * reconciles the merge within seconds, and Flux's `cluster-apps` runs on its
 * own interval, so Pulumi reliably wins the race and the Stack goes
 * Stalled/UpdateFailed for a day (#1180).
 *
 * It is tempting to make this self-healing by skipping an app whose role does
 * not exist yet, so the role appears on the next pass. DON'T, at least not as
 * a live existence check. This stack holds no PostgreSQL client on purpose —
 * baoadmin's key never enters Pulumi state — so the check would have to read
 * the live `DatabaseRole` CR, which makes the PLAN depend on cluster state. A
 * transient read failure would then omit an app that IS rotating, and an
 * omitted app is not a skip: Pulumi DELETES its static role, leaving a live
 * password nothing owns. A stalled run that a one-line annotate clears is
 * strictly the better failure. The recovery is written up in
 * kubernetes/components/postgres/ks.yaml.
 *
 * The Flux artifact the Pulumi operator checks out is the whole repository
 * (the `home-operations` GitRepository sets neither `ignore` nor `include`;
 * `spec.fluxSource.dir` only selects the working directory), so the glob
 * resolves in-cluster exactly as it does locally.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GlobalResources } from "@components/globals.ts";
import { ComponentResource, type ComponentResourceOptions } from "@pulumi/pulumi";
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
 * its `superuser` and `client-cert` siblings — those modify an app's role,
 * they are not apps in their own right.
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

/**
 * Every app that gets a database from `components/postgres` — which, since the
 * `rotate` sibling was folded in, is exactly the set whose password OpenBao
 * owns. One signal, one list.
 *
 * A COMMENTED-OUT component does not count, and that matters: `autobrr` and
 * the three group-E apps (`outline`, `retrom`, `strmgen`) still have the line
 * in their `ks.yaml` behind a `#`. This reads parsed YAML rather than grepping
 * text, so they are correctly absent — and they MUST be, because group E's
 * roles and databases were dropped on 2026-08-25. Uncommenting one without
 * letting CNPG recreate the role first fails this stack outright; see the
 * ordering trap above.
 *
 * `openbao` can never appear: it authenticates with a client certificate and
 * its role has no password to rotate. It left `components/postgres` entirely
 * in phase 2.4a.
 */
export function discoverPostgresApps(): string[] {
  return discoverAppsUsing("components/postgres");
}

export interface PostgresRotationConfigurationArgs {
  globals: GlobalResources;
}
export class PostgresRotationComponent extends ComponentResource {
  constructor(args: PostgresRotationConfigurationArgs, opts?: ComponentResourceOptions) {
    super("custom:postgres:rotation", "postgres-rotation", args, opts);

    // One list, because there is one signal. The cross-check that used to live
    // here -- ./rotate present without ./postgres -- became unrepresentable
    // when the two components merged.
    const tranche = discoverPostgresApps();

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
      {
        provider: args.globals.baoProvider,
        parent: this,
        // THE ALIAS IS LOAD-BEARING. Before this file became a
        // ComponentResource, the mount was created by a plain function with
        // `{ provider }` and no parent -- so its URN was
        // `urn:pulumi:system::system::vault:database/secretsMount:SecretsMount::postgres-rotation`,
        // a direct child of the stack. Re-parenting it to `this` changes the
        // URN, and Pulumi reads a changed URN as "a different resource":
        // CREATE the new one, DELETE the old one.
        //
        // Both halves of that are bad, and the first one is what actually
        // happened on 2026-08-25 --
        //
        //   POST /v1/sys/mounts/database
        //   Code: 400 * path is already in use at database/
        //
        // -- because the mount it was "creating" is the live one. The stack
        // failed there, which is the lucky outcome: had the create succeeded,
        // the delete would have followed and UNMOUNTED `database/` in OpenBao,
        // taking every static role with it and leaving eight apps
        // (coder, crowdsec, freshrss, grafana, n8n, pulsarr, romm, tandoor)
        // holding passwords nothing can rotate or verify.
        //
        // THE FULL OLD URN, NOT `{ noParent: true }`. The spec form was tried
        // first and did NOT match -- `pulumi preview` still planned
        // `+ create` at the new URN alongside `- delete` of the mount and all
        // eight static roles at the old ones. A literal URN removes every
        // question about how the engine reconstructs one.
        //
        // Copied from `pulumi stack export`, so it is the exact string in
        // state rather than a reconstruction:
        //
        //   pulumi stack export | grep secretsMount
        //
        // The static roles below need no alias of their own: they are
        // `parent: mount`, and Pulumi propagates a parent's alias to its
        // children.
        //
        // Do not remove this until the state no longer contains the old URN.
        // VERIFY WITH A PREVIEW, never by assuming: the correct plan shows the
        // mount as unchanged, with NO delete of
        // `vault:database/secretBackendStaticRole` anywhere in it.
        aliases: ["urn:pulumi:system::system::vault:database/secretsMount:SecretsMount::postgres-rotation"],
      },
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
        { provider: args.globals.baoProvider, parent: mount },
      );
    }
  }
}

/**
 * Credentials for `stargate-command/authentik-pg` — the dedicated CNPG cluster that
 * backs authentik on BOTH sites (docs/authentik-active-active/PLAN.md).
 *
 * Why these are minted here and not by the cluster: two consumers on opposite
 * sides of the Kubernetes boundary read the same values.
 *
 *   - equestria: ExternalSecrets in `database` (the CNPG managed roles) and in
 *     `idp` (authentik's own env) extract them from OpenBao. `eso-equestria`
 *     reads every `clusters/*` subtree, so no policy change is needed.
 *   - alpha-site: docker/alpha-site/authentik/.env and the
 *     authentik-pg-standby stack reference them with `ref+openbao://`, resolved
 *     by DockgeLxc at deploy time.
 *
 * A CNPG-generated `-app` Secret would exist only inside the cluster, and the
 * Pi would have to read it back out through the API server — a dependency on
 * equestria being up for the Pi to even DEPLOY, which is the exact failure the
 * Pi's copy exists to survive. So the value is born in OpenBao and flows
 * outward to both.
 *
 * Filed under `clusters/equestria/` because the primary lives there; the
 * standby is a copy, not an owner.
 *
 * Rotation: bump the matching `*_VERSION` below. The RandomPassword is keyed on
 * it, so the value is replaced, ESO pushes it into the role Secret within its
 * refresh interval, and CNPG's managed-role reconciler runs ALTER ROLE. The Pi
 * picks it up on the next stacks/home run — until then its authentik (app) or
 * standby (replication) fails auth, so rotate with both stacks in one sitting.
 */
import { baoKvSecret, baoProvenance } from "@components/bao.ts";
import type { GlobalResources } from "@components/globals.ts";
import * as pulumi from "@pulumi/pulumi";
import { RandomPassword } from "@pulumi/random";

const APP_PASSWORD_VERSION = "1";
const REPLICATION_PASSWORD_VERSION = "1";

// Must match `cluster.initdb.owner` and the replication role name in
// kubernetes/apps/stargate-command/authentik-pg/app/resources/values.yaml.
export const AUTHENTIK_PG_APP_USER = "authentik";
export const AUTHENTIK_PG_REPLICATION_USER = "alpha_site_standby";

export function configureAuthentikPg(globals: GlobalResources): void {
  // Alphanumeric only: these land verbatim in a libpq conninfo string on the
  // Pi (primary_conninfo) and in a dotenv file, and neither wants quoting.
  const app = new RandomPassword("authentik-pg-app-password", {
    length: 40,
    special: false,
    keepers: { version: APP_PASSWORD_VERSION },
  });
  const replication = new RandomPassword("authentik-pg-replication-password", {
    length: 40,
    special: false,
    keepers: { version: REPLICATION_PASSWORD_VERSION },
  });

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn(
      "No OpenBao credentials — skipping the authentik-pg records (clusters/equestria/apps/authentik-pg/{app,replication}). The authentik-pg ExternalSecrets stay SecretSyncedError until a credentialed run.",
    );
    return;
  }

  baoKvSecret(
    "authentik-pg-app-bao",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/authentik-pg/app",
      data: { username: AUTHENTIK_PG_APP_USER, password: app.result, database: "authentik" },
      concealedFields: ["password"],
      customMetadata: baoProvenance({ source_title: "authentik-pg app role" }),
    },
    { provider: globals.baoProvider },
  );

  baoKvSecret(
    "authentik-pg-replication-bao",
    {
      mount: "secrets",
      path: "clusters/equestria/apps/authentik-pg/replication",
      data: { username: AUTHENTIK_PG_REPLICATION_USER, password: replication.result },
      concealedFields: ["password"],
      customMetadata: baoProvenance({ source_title: "authentik-pg alpha-site standby replication role" }),
    },
    { provider: globals.baoProvider },
  );
}

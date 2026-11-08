/**
 * The network map's Neo4j credential (docs/adr/0006-network-map-neo4j-homelable-projection.md).
 *
 * Minted here, not by the cluster, because three readers sit in three places:
 *
 *   - `database/neo4j` itself: its ExternalSecret renders NEO4J_AUTH, which
 *     Neo4j reads only on first start, to set the initial password.
 *   - the hourly collector (observed layer), in `database`.
 *   - the declared-layer loader, a Forgejo workflow on push to main
 *     (.forgejo/workflows/network-map-declared.yml), which reads it as the
 *     NETWORK_MAP_NEO4J_* Actions secrets ./forgejo-github-mirror.ts sets from
 *     the value returned here, and the read-only Neo4j MCP in `agents`.
 *
 * An in-cluster generated Secret would exist in one namespace only, and ESO
 * cannot write it back to OpenBao (`eso-equestria` may write one certificate
 * path and nothing else). So the value is born in OpenBao and flows outward.
 *
 * Neo4j Community has no read-only users, so every reader holds this same
 * credential; the MCP's read-only-ness comes from READ transactions (ADR 0006).
 *
 * Rotation: bump NEO4J_PASSWORD_VERSION. NEO4J_AUTH applies only to an empty
 * data directory, so a rotation must ALSO change the live password
 * (`ALTER CURRENT USER SET PASSWORD FROM '<old>' TO '<new>'` in Neo4j Browser,
 * or `neo4j-admin dbms set-initial-password` on a wiped volume). The graph is
 * rebuildable, so wiping the PVC is an acceptable rotation too.
 */

import * as pulumi from "@pulumi/pulumi";
import { RandomPassword } from "@pulumi/random";
import { baoKvSecret, baoProvenance } from "components/bao.ts";
import type { GlobalResources } from "components/globals.ts";

const NEO4J_PASSWORD_VERSION = "1";

/** The only user Neo4j Community has; NEO4J_AUTH is `<user>/<password>`. */
export const NEO4J_USER = "neo4j";
export const NEO4J_BAO_PATH = "clusters/equestria/apps/neo4j/auth";

/** The credential, for the readers this stack hands it to directly (the declared loader's Actions secrets). */
export interface Neo4jAuth {
  username: string;
  password: pulumi.Output<string>;
}

export function configureNeo4jAuth(globals: GlobalResources): Neo4jAuth {
  // Alphanumeric only: it is spliced into NEO4J_AUTH (`neo4j/<password>`) and
  // into Bolt/HTTP basic auth, and none of them want quoting.
  const password = new RandomPassword("neo4j-password", {
    length: 40,
    special: false,
    keepers: { version: NEO4J_PASSWORD_VERSION },
  });

  if (!globals.baoDualWriteEnabled) {
    pulumi.log.warn(`No OpenBao credentials — skipping ${NEO4J_BAO_PATH}. database/neo4j's ExternalSecret stays SecretSyncedError until a credentialed run.`);
    return { username: NEO4J_USER, password: password.result };
  }

  baoKvSecret(
    "neo4j-auth-bao",
    {
      mount: "secrets",
      path: NEO4J_BAO_PATH,
      data: { username: NEO4J_USER, password: password.result },
      concealedFields: ["password"],
      customMetadata: baoProvenance({ source_title: "network map neo4j" }),
    },
    { provider: globals.baoProvider },
  );
  return { username: NEO4J_USER, password: password.result };
}

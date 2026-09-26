import * as authentik from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";
import type { Provider as VaultProvider } from "@pulumi/vault";
import { accessCheckBaoPath, baoKvSecret, baoProvenance } from "../bao.ts";

/**
 * The one permission the account holds. GLOBAL (no `model`/`objectId`), so the
 * users list returns every user with their direct groups, not only the
 * account itself. See `createAccessCheckAccount`.
 */
export const ACCESS_CHECK_PERMISSION = "authentik_core.view_user";

export interface AccessCheckAccountArgs {
  clusterKey: string;
  /** `metadata.name`, which names the OpenBao path. */
  appName: string;
  /** `spec.name`, for the account's display name. */
  displayName: string;
  /** The application's Pulumi resource name, used as a prefix for every object here. */
  resourceName: string;
  /** `spec.access_policy.groups`, published so the app can compare against it. */
  groups: string[];
  /** Where the app should reach authentik, e.g. `https://<authentikDomain>`. */
  authentikUrl: pulumi.Input<string>;
  /** The OpenBao provider. Undefined means no credentials on this run, so the write is skipped. */
  baoProvider?: VaultProvider;
}

/**
 * `spec.access_policy.serviceAccount`: a read-only authentik identity the
 * application uses to re-check, on every request, that a user it already
 * issued something to is still allowed in. SuperSync is the first user: its
 * sync tokens outlive any authentik session, so without this, removing someone
 * from `family` would not stop their devices.
 *
 * WHY NOT authentik's own `check_access`. That endpoint only evaluates ANOTHER
 * user for a superuser caller; anyone else silently gets their own result
 * (authentik/core/api/applications.py). A superuser token in an app pod is too
 * much, so the account gets exactly one global permission -- view_user -- and
 * the app compares the user's groups with the list written here. For a
 * group-only access_policy that matches authentik's check whenever those
 * groups have no child groups, which holds for every group in ./groups.ts
 * today. (A group binding passes for members of the group's descendants too,
 * and the users API reports direct groups only.)
 *
 * The app reads `url`, `token` and `groups` from `accessCheckBaoPath`. Like
 * the OIDC credential, the write needs OpenBao credentials on the run.
 * Without them it is skipped with a warning, and the app's ExternalSecret
 * stays empty.
 */
export function createAccessCheckAccount(args: AccessCheckAccountArgs, opts: { parent: pulumi.Resource }) {
  const name = `${args.resourceName}-access-check`;
  if (args.groups.length === 0) {
    pulumi.log.warn(`Application "${args.appName}" sets access_policy.serviceAccount with no access_policy.groups; the account can be created, but the app will allow nobody.`, opts.parent);
  }
  const resourceOpts = { parent: opts.parent, deleteBeforeReplace: true };

  const role = new authentik.RbacRole(name, { name }, resourceOpts);
  const permission = new authentik.RbacPermissionRole(name, { role: role.rbacRoleId, permission: ACCESS_CHECK_PERMISSION }, { parent: role, deleteBeforeReplace: true });

  const user = new authentik.User(
    name,
    {
      username: name,
      name: `${args.displayName} access check`,
      type: "service_account",
      roles: [role.rbacRoleId],
    },
    resourceOpts,
  );
  const token = new authentik.Token(
    name,
    {
      identifier: name,
      user: user.userId.apply(id => parseInt(id, 10)),
      intent: "api",
      expiring: false,
      retrieveKey: true,
      description: `Read-only user lookups for ${args.displayName} (access_policy.serviceAccount)`,
    },
    { parent: user, deleteBeforeReplace: true, additionalSecretOutputs: ["key"] },
  );

  if (!args.baoProvider) {
    pulumi.log.warn(`No OpenBao credentials (BAO_TOKEN, or BAO_ROLE_ID + BAO_SECRET_ID) — skipping the authentik-access write for ${name}. The app's ExternalSecret stays empty until a credentialed run.`, user);
    return { role, permission, user, token, secret: undefined };
  }

  const secret = baoKvSecret(
    `${name}-bao`,
    {
      mount: "secrets",
      path: accessCheckBaoPath(args.clusterKey, args.appName),
      data: {
        url: args.authentikUrl,
        token: token.key,
        groups: args.groups.join(","),
      },
      concealedFields: ["token"],
      customMetadata: baoProvenance({ source_title: name }),
    },
    { parent: token, provider: args.baoProvider },
  );
  return { role, permission, user, token, secret };
}

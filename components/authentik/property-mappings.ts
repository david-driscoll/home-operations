import * as authentik from "@pulumi/authentik";
import * as pulumi from "@pulumi/pulumi";

interface ScopeMappingDefinition {
  description: string;
  expression: string;
}

export class PropertyMappings extends pulumi.ComponentResource {
  private readonly scopeMappings = new Map<string, authentik.PropertyMappingProviderScope>();
  private readonly defaultScopeMappings = new Map<string, pulumi.Output<authentik.GetPropertyMappingProviderScopeResult>>();

  private readonly oauthScopes: Record<string, ScopeMappingDefinition> = {
    immich_role: {
      description: "Enable better Immich support in authentik (https://docs.immich.app/advanced/authentication/authentik/)",
      expression: `return {"immich_role": "admin" if request.user.is_superuser else "user"}`,
    },
    vikunja: {
      description: "Enable better vikunja support in authentik (https://vikunja.io/docs/openid/#setup-in-authentik)",
      expression: `groupsDict = {"vikunja_groups": []}
for group in request.user.ak_groups.all():
  groupsDict["vikunja_groups"].append({"name": group.name, "oidcID": group.num_pk})
return groupsDict`,
    },
    grafana_role: {
      description: "Enable better grafana support in authentik",
      expression: `return {"grafana_role": "GrafanaAdmin" if request.user.is_superuser else "Editor"}`,
    },
    // RomM hardcodes its scope request as `openid profile email ${OIDC_CLAIM_ROLES}`
    // (backend/decorators/auth.py) and romm's externalsecret.yaml sets
    // OIDC_CLAIM_ROLES=groups, so `groups` is the only extra scope it can ever
    // ask for. This mapping therefore has to carry BOTH claims RomM needs:
    //
    //   - groups, for its OIDC_ROLE_ADMIN/EDITOR/VIEWER matching.
    //   - email_verified, because RomM refuses the login when `email_verified`
    //     is advertised in the provider's claims_supported and is not exactly
    //     True (backend/handler/auth/base_handler.py), and authentik's built-in
    //     `email` mapping hardcodes it to False. authentik advertises the claim
    //     precisely because that mapping emits it, so both of RomM's conditions
    //     fire. There is no RomM-side ignore flag -- coder has
    //     CODER_OIDC_IGNORE_EMAIL_VERIFIED, RomM has nothing -- so the
    //     assertion has to come from here.
    //
    // It beats the `email` mapping because authentik evaluates a provider's
    // mappings with order_by("scope_name") and deep-merges each result, so
    // "groups" lands after "email".
    //
    // Was `romm` until 2026-09-16, naming a scope RomM never requests: the
    // mapping was attached to the provider and never evaluated, so its two
    // NameErrors (an unquoted `email_verified` key, and `user` instead of
    // `request.user`) never had a chance to raise.
    groups: {
      description: "Group membership, plus a verified-email assertion, for apps that request a `groups` scope",
      expression: `return {
    "email_verified": True,
    "groups": [group.name for group in request.user.ak_groups.all()],
}`,
    },
    remote_user: {
      description: "Set remote-user based on the username",
      expression: `return {
    "ak_proxy": {
        "user_attributes": {
            "additionalHeaders": {
                "Remote-User": request.user.username
            }
        }
    }
}`,
    },
    ggrequestz_role: {
      description: "GGRequestz role mapping based on user groups",
      expression: `if ak_is_group_member(request.user, name="admins"):
    return {"ggrequestz_role": "admin"}
elif ak_is_group_member(request.user, name="media-managers"):
    return {"ggrequestz_role": "manager"}
else:
    return {"ggrequestz_role": "user"}`,
    },
    proxmox_groups: {
      description: "Proxmox group membership claim — returns all group names for use with PVE/PBS OIDC group mapping",
      expression: `return {"groups": [g.name for g in request.user.ak_groups.all()]}`,
    },
    arcane_groups: {
      description: "Arcane group membership claim — returns all group names for use with OIDC_ROLE_MAPPINGS",
      expression: `return {"groups": [g.name for g in request.user.ak_groups.all()]}`,
    },
    email_verified: {
      description: "Adds an 'email_verified' claim based on whether the user has an email address set",
      expression: `return {
    "email": request.user.email,
    "email_verified": True,
}`,
    },
  };

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikPropertyMappings", "authentik-property-mappings", {}, opts);

    const defaultScopeNames = ["goauthentik.io/api", "ak_proxy", "entitlements", "email", "profile", "openid", "offline_access"];

    // Load default scope mappings
    for (const scopeName of defaultScopeNames) {
      this.defaultScopeMappings.set(scopeName, authentik.getPropertyMappingProviderScopeOutput({ scopeName }, { parent: this }));
    }

    // Create custom scope mappings
    for (const [scopeName, scopeDef] of Object.entries(this.oauthScopes)) {
      const mapping = new authentik.PropertyMappingProviderScope(
        scopeName,
        {
          scopeName,
          description: scopeDef.description,
          expression: scopeDef.expression,
        },
        { parent: this },
      );
      this.scopeMappings.set(scopeName, mapping);
    }
  }

  public get allScopeMappings() {
    return Array.from(this.scopeMappings.entries())
      .map(([key, output]) => [key, output.propertyMappingProviderScopeId] as const)
      .concat(Array.from(this.defaultScopeMappings.entries()).map(([key, output]) => [key.replace(/\//g, "~1"), output.apply(m => m.id)] as const));
  }

  public getScopeMappingId(scopeName: string): pulumi.Output<string> {
    const customMapping = this.scopeMappings.get(scopeName);
    if (customMapping) {
      return customMapping.id;
    }

    const defaultMapping = this.defaultScopeMappings.get(scopeName);
    if (defaultMapping) {
      return defaultMapping.apply(m => m.id);
    }

    throw new Error(`Scope mapping for '${scopeName}' not found.`);
  }
}

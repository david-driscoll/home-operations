import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";

interface ScopeMappingDefinition {
  description: string;
  expression: string;
}

export class PropertyMappings extends pulumi.ComponentResource {
  private readonly scopeMappings = new Map<string, authentik.ScopeMapping>();
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
  };

  constructor(opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:AuthentikPropertyMappings", "authentik-property-mappings", {}, opts);

    const defaultScopeNames = ["goauthentik.io/api", "ak_proxy", "entitlements", "email", "profile", "openid", "offline_access"];

    // Load default scope mappings
    for (const scopeName of defaultScopeNames) {
      this.defaultScopeMappings.set(scopeName, pulumi.output(authentik.getPropertyMappingProviderScope({ scopeName }, { parent: this })));
    }

    // Create custom scope mappings
    for (const [scopeName, scopeDef] of Object.entries(this.oauthScopes)) {
      const mapping = new authentik.ScopeMapping(
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
      .map(([key, output]) => [key, output.scopeMappingId] as const)
      .concat(Array.from(this.defaultScopeMappings.entries()).map(([key, output]) => [key.replace(/\//g, "~1"), output.apply((m) => m.id)] as const));
  }

  public getScopeMappingId(scopeName: string): pulumi.Output<string> {
    const customMapping = this.scopeMappings.get(scopeName);
    if (customMapping) {
      return customMapping.id;
    }

    const defaultMapping = this.defaultScopeMappings.get(scopeName);
    if (defaultMapping) {
      return defaultMapping.apply((m) => m.id);
    }

    throw new Error(`Scope mapping for '${scopeName}' not found.`);
  }
}

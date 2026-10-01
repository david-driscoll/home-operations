/**
 * The estate's root domain, read from the environment -- never written in code.
 *
 * Its only home is SOPS: `ROOT_DOMAIN` in kubernetes/flux/meta/shared-secrets.sops.yaml
 * (docs/plans/private-domain-scrub.md). It reaches a Pulumi run two ways:
 *
 * - in the cluster, every Stack CR carries `envRefs.ROOT_DOMAIN`, a literal that
 *   Flux substitutes from shared-secrets (kubernetes/apps/pulumi/<stack>/stack.yaml);
 * - locally, `.config/mise.toml` declares it as a `ref+sops://` that
 *   `mise run vals-run` resolves per command.
 *
 * A plain function rather than a Pulumi `Output` so that code which must run
 * without a Pulumi runtime -- components/store/clusters.ts parses the cluster
 * definitions at import time, and its tests do the same -- can share the one
 * source with `GlobalResources.searchDomain`.
 *
 * FAILS CLOSED. A missing value throws at the first read instead of rendering an
 * empty string into a zone name or URL, which Pulumi would then try to apply.
 * Tests set it to a placeholder such as `example.com`.
 */
export function rootDomain(): string {
  const value = process.env.ROOT_DOMAIN?.trim();
  if (!value) {
    throw new Error(
      "ROOT_DOMAIN is not set. In a Stack it comes from envRefs (Flux substitutes it from shared-secrets); " +
        "locally run through `mise run vals-run`, which resolves the ref+sops in .config/mise.toml. " +
        "Tests: ROOT_DOMAIN=example.com.",
    );
  }
  return value;
}

/** `a.b` -> `a-b`: the root domain as a resource-name / path slug. */
export function rootDomainSlug(): string {
  return rootDomain().replaceAll(".", "-");
}

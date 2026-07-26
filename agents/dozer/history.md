# Dozer — History

## Day 1 — 2026-07-26

Joined the home-operations crew as Secrets & Identity. Requested by David Driscoll.

**What I own:** `components/op.ts` (1Password Connect client), the `authentik` stack, sops/age keys across both cluster repos, credential provisioning and rotation, and secret-hygiene review across all four repos.

**How secrets flow here:** 1Password Connect → `OPClient` (`components/op.ts`) → `GlobalResources` (`components/globals.ts`) → providers → ComponentResources in stacks → optional outputs written back to 1Password as `OnePasswordItem` objects. The canonical write-back pattern lives in `stacks/authentik/index.ts`.

**Environment:** `.mise.toml` supplies env vars via `op://` references — CONNECT_HOST, CONNECT_TOKEN, PULUMI_CONFIG_PASSPHRASE, AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (Minio), AUTHENTIK_TOKEN, AUTHENTIK_URL. `Pulumi.*.yaml` files use `encryptionsalt`.

**Standing rules seeded on day 1:**
- Never commit plaintext credentials. Config carries `op://` references and encrypted blobs only.
- Code in this estate can create and modify 1Password items. Be deliberate when touching `OPClient` or any stack that persists outputs — say so before it runs.
- The cluster repos hold age keys (`age.key`, `eq.age.key`, `sgc.age.key`) and deploy keys in the working tree. Treat that tree as sensitive; never echo those files.
- I do not invent secret material and I do not enter credentials into third-party UIs — that stays with David.

**My crewmates:** Morpheus (lead), Trinity (Pulumi/TS IaC), Tank (Kubernetes/Flux), Niobe (networking/DNS), Mouse (verification), plus Scribe, Ralph, Rai (screens output for credential leakage), Fact Checker.

# 08 — Test-target re-designation (G″)

Sub-issue **G″** of [vault#84](https://github.com/david-driscoll/vault/issues/84) · [← plan index](README.md) · Decision **D12 — needs David's explicit confirmation, not yet given** · Depends on: [07 — Authentik → alpha-site](07-authentik-to-alpha-site.md) · Ships in the same PR as 07

This is a short file because it is a small change gated on one open question,
not a small decision — get the answer before writing any code.

## The problem, verified today (2026-08-13)

`CLAUDE.md:63` in this repo, unchanged since the discovery cited it:

> Test risky changes against a non-production stack (alpha-site) first.

(Confirmed still line 63, still that exact wording — the discovery's citation
has not gone stale on its own; grepped this repo and `AGENTS.md` for the same
instruction elsewhere and found no other copy, and neither
`equestria-cluster/CLAUDE.md` nor `stargate-command-cluster/CLAUDE.md`
contains an equivalent line. One file, one bullet, to change.)

Once [07](07-authentik-to-alpha-site.md) lands, alpha-site hosts the estate's
SSO. The instruction above then reads as "test risky changes on the box that
holds identity" — not stale, actively dangerous. [07](07-authentik-to-alpha-site.md)
is what breaks this bullet; this file is what fixes it, in the same PR so the
repo is never left instructing anyone to use alpha-site as a test bed after
it has become production.

## What David has actually confirmed — and what he hasn't

The discovery asked this as item 3 of ["Still needs David"](https://github.com/david-driscoll/vault/issues/84#issuecomment-5138811583):

> Test-target re-designation — once authentik is on alpha-site, `CLAUDE.md:63`
> is stale and dangerous. Move it (skystar?) or accept it?

[David's answer](https://github.com/david-driscoll/vault/issues/84#issuecomment-5149201734):

> alpha-site, assuming that it doesn't have any performance issues is the
> idea[l] machine. IDP needs to stay online more than any other service.
> Alpha site is a rasberry pi 4 that is poe powered, so it's downtime is
> dependent on the PoE switch it is getting powered by.

Read literally, this answers a different question than the one asked. It
reaffirms **alpha-site as the identity host** (D4, already settled) — not
whether the *test-target* designation should move to skystar, stay on
alpha-site, or be dropped as an instruction entirely. Items 1, 2, 4, and 5 of
the same "Still needs David" list got direct, on-topic answers in the same
comment (chrony renumbering, low-power duration, NVMe budget, Home Assistant
tier); item 3 is the one that got an answer about a different topic. **This
is not a confirmation of skystar, and it should not be treated as one.**

**Open question for David, to be asked explicitly before this PR is written:**
now that alpha-site is production (hosting SSO), where should "test risky
changes here first" point instead — skystar, some other host, or should the
instruction be dropped rather than relocated?

## The proposed target: skystar — recommended, not decided

If the answer is "yes, relocate it," skystar is the strongest candidate
surfaced by the discovery, for reasons still worth restating with today's
verification layered in:

- **Live measurement from the discovery** (2026-07-31, via node-exporter →
  Thanos): 4 cores, 4.47 GiB available, 5.5% utilization.
- **Confirmed in this repo today:** `clusters/skystar.yaml` defines it as
  `type: dockge`, `location: remote` — a Dockge/Docker cluster on its own
  Proxmox host, not a Kubernetes node, so testing there cannot touch
  equestria or SGC by accident.
- **Not equestria, not SGC, not alpha-site** — the three hosts this whole
  plan is actively rewiring. A test target that is none of them is the point.

**One caveat the discovery's "no estate-critical role" undersells, verified
against `docs/codebase/DOCKER.md` and `components/store/bao.ts` in this repo
today:** skystar is not an empty box. It already runs `backrest`,
`backups`/`rclone-sftp`, and (per the `CLUSTER_KEYS` list backing the
Proxmox-Backup-Server credential mapping) a PBS instance — it is the offsite
backup replication target for the estate. Testing risky changes there means
being deliberate about not touching the backup path, not that "risky" is
free. It is still meaningfully lower-stakes than testing against the box
that now holds SSO, which is the actual bar to clear — just don't describe
skystar as having no role at all.

The discovery also measured skystar's disk as the slowest of four compared
hosts (2.35 ms write latency vs. alpha-site 1.40 ms, celestia 1.12 ms, luna
0.42 ms) — irrelevant to its fitness as a test target (nothing here is
being judged on write latency), noted only so a future reader doesn't
mistake "measured and slowest" for "measured and disqualified."

## What ships once David confirms

1. **Update `CLAUDE.md:63`.** If skystar is confirmed:
   ```diff
   - Test risky changes against a non-production stack (alpha-site) first.
   + Test risky changes against a non-production stack (skystar) first.
   ```
   If a different host is named, or the instruction is dropped, write that
   instead — don't default to skystar without the explicit answer.
2. **No other file changes are expected.** The audit above found the
   instruction in exactly one place.
3. **Land it in the same PR as [07](07-authentik-to-alpha-site.md)**, so the
   window between "alpha-site is production" and "the docs stop recommending
   testing against it" is zero, per the piece guidance and per how G″ is
   already scoped against G′ in the discovery's own sub-issue table (G″
   depends on G′, same owner pairing).

## Exit gate

- David has answered the open question above, on the record on the issue —
  not inferred from an adjacent answer.
- `CLAUDE.md:63` reflects that answer exactly (new host name, or the
  instruction removed if that's the answer).
- A repo-wide grep for the old wording (`non-production stack (alpha-site)`)
  returns nothing.

## Cross-references

- [07 — Authentik → alpha-site](07-authentik-to-alpha-site.md) — the change
  that makes this one necessary; ships together.
- [20 — Low-power tier](20-low-power-tier.md) — alpha-site's other new
  production role (observability during low-power windows), same underlying
  reason it can no longer double as a test target.
- [README.md](README.md) — decision ledger entry D12.

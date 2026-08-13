# 25 — A scoped age key for the static-unseal file

New, 2026-08-13. **Additive to [D5](06-age-key-consolidation.md), not a
revision of it.** D5 is still "settled, not open" — one estate-wide recipient,
equestria's key, on every `.sops.yaml`. This piece adds ONE more recipient to
exactly one file, for a reason D5 didn't consider: the file it protects is the
one piece of seal-chain material that must never depend on the same trust
boundary as everything else.

## The file, and why it's different from every other `.sops.yaml` in the estate

`vault/bootstrap/openbao/alpha-site-static-unseal.sops.yaml` holds the static
key `bao-transit` (on `dockge-as`) uses to unseal — the node that unseals
equestria's OpenBao, which holds everything else. `provision-static-unseal.sh`
and `vault/bootstrap/INVENTORY.md §2` are explicit that this key must never
live inside anything it helps unseal — that's the circular dependency the
whole seal chain exists to avoid, and it's why `BaoStore`
(`components/store/bao.ts`, `NOT_IN_OPENBAO`) refuses to ever let this value
be read from OpenBao itself.

Today that file is encrypted under `vault/.sops.yaml`'s single blanket
rule — the same two recipients (equestria's key + your personal key) as every
other bootstrap secret in the repo (Pulumi's AppRole, recovery shares, the
break-glass AppRole). That means: anyone/anything that can decrypt Pulumi's
OpenBao AppRole can *also* decrypt the unseal key, and vice versa. There's no
reason those two capabilities need to travel together — the AppRole is used
constantly, by an automated operator pod; the unseal key is read rarely, by a
human running `provision-static-unseal.sh`, from a host that never runs
Pulumi.

## The design

A new age keypair, **`age-unseal`**, whose private key is generated once and
then lives **only** wherever `provision-static-unseal.sh` actually runs from
(your laptop's `op`-backed flow today; potentially `dockge-as` itself later)
— not in the general `age.key` file every other bootstrap operation uses.

`vault/.sops.yaml` gets a second, more specific `creation_rule` ahead of the
existing blanket one (first match wins — same pattern `vault/.sops.yaml`'s own
header comment already documents for exactly this situation):

```yaml
creation_rules:
  - path_regex: bootstrap/openbao/alpha-site-static-unseal\.sops\.ya?ml
    mac_only_encrypted: true
    key_groups:
      - age:
        - "age1eurl2t7pepw66guv8m7lxh5fjhs4t4frsntqjp08lmypwudlsp7qdusgnf"  # equestria's key — break-glass, matches D5's estate-wide guarantee
        - "age150z0s36kl9vud8728c5e4zqq6nmyywekk76rwvjclcsfc8mrxuuqr0qfg6"  # your personal key — human break-glass
        - "age1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  # age-unseal — new, this piece
  - path_regex: bootstrap/.*\.sops\.ya?ml
    mac_only_encrypted: true
    key_groups:
      - age:
        - "age1eurl2t7pepw66guv8m7lxh5fjhs4t4frsntqjp08lmypwudlsp7qdusgnf"
        - "age150z0s36kl9vud8728c5e4zqq6nmyywekk76rwvjclcsfc8mrxuuqr0qfg6"
```

Equestria's key and your personal key both stay as recipients — this is
*additive* scoping, not a swap. Removing either would mean an estate-wide
recovery event (equestria's key lost, or you're unreachable) can no longer
recover the seal chain, which is a strictly worse position than today.
`age-unseal` is the new, narrower-privileged way to read this one file day to
day; the other two remain the break-glass path.

## Steps (not yet executed — this is the plan)

1. Generate the keypair: `age-keygen -o age-unseal.key` (or wherever your
   other estate keys are managed from — check whether `equestria-cluster`'s
   `age.key` generation followed a particular convention worth matching).
2. Add the new public key to `vault/.sops.yaml` per the rule above.
3. `sops updatekeys vault/bootstrap/openbao/alpha-site-static-unseal.sops.yaml`
   — re-wraps its data key for the three-recipient set; the two existing
   recipients (equestria's, yours) still decrypt it unchanged, so this step is
   as safe as 06's own `updatekeys` sweep.
4. Store `age-unseal.key`'s private material wherever
   `provision-static-unseal.sh` should read `SOPS_AGE_KEY_FILE` from going
   forward — **decide now whether that's your laptop only, or also
   provisioned onto `dockge-as`** (the host running `bao-transit`), since that
   decision determines the actual blast-radius reduction this piece buys. If
   it ends up living in the same place `age.key` already lives, this design
   delivers policy documentation but no real isolation — worth being honest
   about that before calling it done.
5. Confirm decrypt: `SOPS_AGE_KEY_FILE=./age-unseal.key sops -d
   vault/bootstrap/openbao/alpha-site-static-unseal.sops.yaml >/dev/null &&
   echo OK`, using a key file that holds *only* `age-unseal`'s private key —
   same "prove it on a clean checkout" bar 06 §5 sets.

## Open items

1. **Where the private key actually lives** — step 4 above; this is the part
   that determines whether this design does anything beyond adding a comment.
2. **Does `provision-static-unseal.sh` need updating** to point
   `SOPS_AGE_KEY_FILE` at `age-unseal.key` instead of inheriting whatever the
   ambient environment has set (today it doesn't set it itself — it relies on
   the caller's environment, per the script header).
3. Whether a similar narrow key is worth it for anything else in
   `vault/bootstrap/*.sops.yaml` (Pulumi's AppRole, the break-glass AppRole)
   was explicitly deferred — "something narrower," this piece only, decided
   2026-08-13. Revisit once this one is live and its actual isolation value is
   proven, not assumed.

## Cross-references

- [06-age-key-consolidation.md](06-age-key-consolidation.md) — D5, unchanged,
  this piece is additive to it.
- `vault/bootstrap/INVENTORY.md` §2 — the rule this design exists to honor
  (nothing inside what it helps unseal).
- `vault/bootstrap/openbao/provision-static-unseal.sh` — the script this
  piece's key material feeds.

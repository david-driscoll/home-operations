#!/usr/bin/env bash
#
# restore.sh — bring the break-glass standby up from a decrypted dump.
# Run ON dockge-as, from this stack directory. Full procedure and the
# decryption step (which happens on a machine with age.key, NOT here):
# vault/bootstrap/RUNBOOK.md Scenario B.
#
#   BAO_STANDBY_TRANSIT_TOKEN=<token> bash restore.sh /path/to/openbao.sql
#
# The token is the transit seal token from
# vault/bootstrap/openbao/transit-token.sops.yaml. Without it the standby
# starts but can never unseal.
#
# Safe to re-run: the restore refuses a non-empty database rather than
# silently merging two states — wipe /opt/stacks-data/bao-standby/postgres
# first if you want a clean second attempt.
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

dump="${1:-}"
[[ -n "$dump" && -f "$dump" ]] || die "usage: restore.sh /path/to/openbao.sql (a DECRYPTED dump)"
head -c 512 "$dump" | grep -qi 'age-encryption\|AGE ENCRYPTED' && die "$dump is still age-encrypted — decrypt it on a machine holding age.key first"
grep -q 'CREATE SCHEMA' "$dump" || die "$dump does not look like a plain-format pg_dump"
[[ -n "${BAO_STANDBY_TRANSIT_TOKEN:-}" ]] || die "BAO_STANDBY_TRANSIT_TOKEN is not set — the standby could start but never unseal. See header."

compose() { docker compose --profile break-glass "$@"; }

echo "starting standby-postgres..."
compose up -d standby-postgres
for _ in $(seq 1 60); do
  docker exec bao-standby-postgres pg_isready -U openbao -d openbao >/dev/null 2>&1 && break
  sleep 2
done
docker exec bao-standby-postgres pg_isready -U openbao -d openbao >/dev/null || die "standby-postgres never became ready"

existing="$(docker exec bao-standby-postgres psql -U openbao -d openbao -tA \
  -c "select count(*) from information_schema.tables where table_schema='openbao'")"
[[ "$existing" == "0" ]] || die "database already has $existing openbao table(s) — refusing to restore over it (see header)"

echo "restoring $dump..."
docker exec -i bao-standby-postgres psql -U openbao -d openbao -q -v ON_ERROR_STOP=1 < "$dump"

entries="$(docker exec bao-standby-postgres psql -U openbao -d openbao -tA -c 'select count(*) from openbao.openbao_kv_store')"
[[ "$entries" -gt 0 ]] || die "restore left openbao_kv_store empty"
echo "restored: openbao_kv_store has $entries rows"

echo "starting bao-standby (unseals via bao-transit on this host)..."
BAO_STANDBY_TRANSIT_TOKEN="$BAO_STANDBY_TRANSIT_TOKEN" compose up -d bao-standby

for _ in $(seq 1 60); do
  health="$(docker exec bao-standby wget -qO- http://127.0.0.1:8200/v1/sys/health 2>/dev/null || true)"
  [[ "$health" == *'"sealed":false'* ]] && break
  sleep 2
done
[[ "${health:-}" == *'"sealed":false'* ]] || die "standby never unsealed — is bao-transit healthy? (RUNBOOK Scenario A step 2)"

cat <<'DONE'

Standby is up and unsealed. Before trusting it, run the canary read
(RUNBOOK Scenario B step 5):

  export BAO_ADDR=https://bao-standby.<tailscale-domain>   # or http://<tailnet-ip>:8201
  bao login   # or use an approle that lives in the restored data
  bao kv get secrets/third-party-tokens/cloudflare/driscoll-tech

Then re-point consumers (Scenario B step 6). Remember: everything written to
OpenBao after the dump's timestamp does not exist here — RPO is up to 24h.
DONE

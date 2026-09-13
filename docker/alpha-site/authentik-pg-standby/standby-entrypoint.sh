#!/bin/bash
# authentik-pg-standby entrypoint: clone authentik-pg once, then run postgres on
# a configuration of our own.
#
# Two things here are not obvious and both are load-bearing:
#
# 1. The clone is a byte copy of a CNPG primary's data directory, and that
#    includes CNPG's postgresql.conf and pg_hba.conf. Those point at
#    /controller/... (certificates, log directory, the WAL archiver binary)
#    which do not exist in this container, so postgres started on them fails.
#    postgres is therefore always started with config_file/hba_file/ident_file
#    pointing at ./config, and CNPG's files in PGDATA are left untouched and
#    unread.
#
# 2. standby.signal is written ONCE, right after a successful clone -- never on
#    an ordinary start. After a promotion (FAILOVER.md) postgres deletes it, and
#    a restart must come back as the promoted primary, not quietly demote itself
#    into a standby of a primary that may be dead.
set -euo pipefail

: "${PGDATA:?PGDATA must be set}"
: "${PRIMARY_HOST:?PRIMARY_HOST must be set}"
: "${REPLICATION_USER:?REPLICATION_USER must be set}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD must be set}"

readonly SLOT=alpha_site_standby
readonly PORT=5432
# Inside the mount (so it survives restarts) but outside PGDATA (so it is never
# part of a clone, a promotion, or a copy someone takes of the data directory).
readonly PASSFILE=/var/lib/postgresql/data/.pgpass

log() { echo "[standby] $*" >&2; }

# Rewritten on every start, so a rotated password (stacks/system/authentik-pg.ts)
# takes effect on the next deploy without touching the data directory.
umask 077
printf '%s:%s:*:%s:%s\n' "$PRIMARY_HOST" "$PORT" "$REPLICATION_USER" "$REPLICATION_PASSWORD" >"$PASSFILE"
export PGPASSFILE="$PASSFILE"
export PGSSLMODE=require
unset REPLICATION_PASSWORD

primary_sql() {
  # A replication=database connection runs plain SQL with only the REPLICATION
  # privilege -- enough to read and manage slots.
  psql "host=$PRIMARY_HOST port=$PORT user=$REPLICATION_USER dbname=postgres replication=database" \
    -v ON_ERROR_STOP=1 -tAc "$1"
}

clone() {
  log "no PG_VERSION in $PGDATA -- cloning from $PRIMARY_HOST"

  if [ -d "$PGDATA" ] && [ -n "$(ls -A "$PGDATA")" ]; then
    # pg_basebackup cleans up after itself on failure, so a non-empty directory
    # without PG_VERSION is something else: a clone killed mid-copy, or a hand
    # edit. Refuse rather than guess; FAILOVER.md "re-establish" says what to do.
    log "REFUSING: $PGDATA is not empty but has no PG_VERSION. Inspect it, move it aside, and restart."
    exit 1
  fi

  local state
  state=$(primary_sql "select coalesce((select case when active then 'active' else wal_status end from pg_replication_slots where slot_name = '$SLOT'), 'missing')")
  log "slot $SLOT on primary: $state"

  local create_slot=()
  case "$state" in
    missing) create_slot=(--create-slot) ;;
    lost)
      # max_slot_wal_keep_size invalidated it; an invalidated slot can never be
      # reused, only dropped and recreated.
      log "slot was invalidated (wal_status=lost) -- dropping and recreating"
      primary_sql "select pg_drop_replication_slot('$SLOT')" >/dev/null
      create_slot=(--create-slot)
      ;;
    active)
      log "REFUSING: slot $SLOT is ACTIVE on the primary -- something else is streaming as this standby."
      exit 1
      ;;
    *) ;; # reserved / extended / unreserved: inactive and still usable
  esac

  pg_basebackup \
    --host="$PRIMARY_HOST" --port="$PORT" --username="$REPLICATION_USER" \
    --pgdata="$PGDATA" \
    --wal-method=stream --slot="$SLOT" "${create_slot[@]}" \
    --checkpoint=fast --progress --verbose

  chmod 700 "$PGDATA"
  # ALTER SYSTEM settings from the primary, if CNPG ever wrote any, must not
  # leak into this server's configuration.
  if [ -s "$PGDATA/postgresql.auto.conf" ]; then
    mv "$PGDATA/postgresql.auto.conf" "$PGDATA/postgresql.auto.conf.from-primary"
  fi
  : >"$PGDATA/postgresql.auto.conf"

  touch "$PGDATA/standby.signal"
  log "clone complete"
}

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  clone
fi

if [ -f "$PGDATA/standby.signal" ]; then
  log "starting as STANDBY of $PRIMARY_HOST"
else
  log "starting as PRIMARY -- no standby.signal (promoted). Not following $PRIMARY_HOST."
fi

# primary_conninfo is harmless on a promoted server (only read in recovery), so
# it is always passed; it carries no password -- that is in the passfile.
exec postgres \
  -D "$PGDATA" \
  -c config_file=/etc/postgresql/postgresql.conf \
  -c hba_file=/etc/postgresql/pg_hba.conf \
  -c ident_file=/etc/postgresql/pg_ident.conf \
  -c "primary_conninfo=host=$PRIMARY_HOST port=$PORT user=$REPLICATION_USER passfile=$PASSFILE sslmode=require application_name=$SLOT"

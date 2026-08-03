#!/bin/sh
# Idempotent role + database provisioner for the shared Postgres on this node.
#
# Runs to completion on every stack start. It is intentionally NOT the image's
# /docker-entrypoint-initdb.d hook: that hook fires once, on first init of an
# empty PGDATA, so a consumer added later would never be provisioned and the
# failure would be silent until the app tried to connect.
#
# Declaration format, in this stack's .env:
#
#   PGAPP_<NAME>_PASSWORD=<password>
#
# provisions a login role <name> and a database <name> owned by it, where
# <name> is <NAME> lowercased. Nothing else in the environment is read, so a
# host with no consumers provisions nothing and exits 0. To add a consumer,
# add one variable to the host's .env override; to remove one, delete the
# variable — note that this script never DROPs anything, on purpose.
#
# NOTE FOR EDITORS: this file is run through the Pulumi variable substitution
# in components/DockgeLxc.ts before it lands on the host. Do not introduce
# shell variables named host, hostname, ipAddress, searchDomain, APP,
# STACK_NAME, CLUSTER_*, TIMEZONE, or UPTIME_API_URL — those tokens are
# rewritten in transit.
set -eu

echo "[provision] reconciling roles and databases on ${PGHOST}"

provisioned=0

for var_name in $(env | sed -n 's/^\(PGAPP_[A-Za-z0-9_]*_PASSWORD\)=.*/\1/p'); do
  # PGAPP_ITSAPLAN_PASSWORD -> itsaplan
  db_name=$(printf '%s' "$var_name" | sed 's/^PGAPP_//; s/_PASSWORD$//' | tr '[:upper:]' '[:lower:]')

  # Constrain to a safe identifier. Everything downstream relies on this.
  case "$db_name" in
    *[!a-z0-9_]* | "")
      echo "[provision] SKIP ${var_name}: '${db_name}' is not a valid identifier ([a-z0-9_])" >&2
      continue
      ;;
  esac

  app_pw=$(printenv "$var_name" || true)
  if [ -z "$app_pw" ]; then
    echo "[provision] SKIP ${var_name}: empty value" >&2
    continue
  fi

  # An unresolved 1Password reference means the item or field is missing and
  # the placeholder was passed through verbatim. Creating a role whose password
  # is the literal string "op://..." would be worse than failing loudly.
  case "$app_pw" in
    op://*)
      echo "[provision] SKIP ${var_name}: 1Password reference did not resolve" >&2
      continue
      ;;
  esac

  # Role and database, both create-if-missing then reconcile.
  #
  # These use `\gexec` — a SELECT that BUILDS the DDL as text, which psql then
  # executes — rather than a DO block. Two reasons, one of them a trap:
  #
  #   * psql does NOT substitute :'var' inside a dollar-quoted body ($do$...$do$).
  #     It treats the whole block as an opaque literal, so a DO block containing
  #     :'db_name' reaches the server with the colon-form intact and fails with
  #     `syntax error at or near ":"`. Verified against postgres:17-alpine.
  #   * CREATE DATABASE cannot run inside a transaction block, so it could not
  #     live in a DO block anyway.
  #
  # format() with %I/%L does the quoting server-side, so neither an identifier
  # nor a password containing quotes can break out of its context.
  psql -q -v ON_ERROR_STOP=1 -d postgres \
    --set=db_name="$db_name" --set=app_pw="$app_pw" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_name')
\gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_name', :'app_pw')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\gexec

-- Pin search_path to public for this role in this database.
--
-- Belt-and-braces, and the reason is worth keeping: ORMs that ship unqualified
-- DDL (drizzle, which is what itsaplan uses) resolve CREATE TABLE against the
-- default search_path of "$user", public. Today no schema named after the role
-- exists, so everything lands in public and this changes nothing. The day
-- someone creates a role-named schema, every later migration would silently
-- retarget it — the shape that stalled the windmill 1.722 upgrade on the
-- Kubernetes side. Pinning it now costs nothing and removes the failure mode.
-- Role-level settings also apply to the migration runner, which a connection
-- string parameter would only cover if every consumer remembered to add it.
SELECT format('ALTER ROLE %I IN DATABASE %I SET search_path = public', :'db_name', :'db_name')
\gexec
SQL

  # PG15+ no longer grants CREATE on the public schema to PUBLIC. The database
  # owner reaches it through pg_database_owner anyway, so this is explicit
  # rather than strictly required — and idempotent. It needs a connection to
  # the application database itself, hence the separate invocation.
  #
  # Note this is a heredoc, not `psql -c`: psql performs variable interpolation
  # only on input it parses itself (files and stdin), never on a -c string, so
  # a -c containing :"db_name" reaches the server verbatim and fails. Verified.
  psql -q -v ON_ERROR_STOP=1 -d "$db_name" --set=db_name="$db_name" <<'SQL'
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_name')
\gexec
SQL

  provisioned=$((provisioned + 1))
  echo "[provision] ok: ${db_name}"
done

echo "[provision] done — ${provisioned} database(s) reconciled"

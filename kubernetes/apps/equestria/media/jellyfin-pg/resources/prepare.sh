#!/bin/sh
# jellyfin-pg's init container. Runs before Jellyfin on EVERY start, in the
# official postgres:<major>-trixie image (the same Debian release as the stock
# Jellyfin image, which is what makes step 1 work). Three jobs:
#
#   1. Hand Jellyfin a PostgreSQL client. The BORNIOS provider shells out to
#      pg_dump before every Jellyfin migration that asks for a backup -- i.e. on
#      Renovate bumps -- and a missing pg_dump is a FATAL startup error, not a
#      skipped backup (BORNIOS/Jellyfin-Database-Providers-Postgres#5). The
#      stock image ships no client, so one is copied into an emptyDir that the
#      Jellyfin container mounts at /usr/lib/postgresql -- the root the plugin
#      auto-detects (<root>/<major>/bin/pg_dump), so no PgBinPath setting.
#
#   2. Once per seeded volume, repoint what the clone copied from production:
#      whole-hostname rewrites in the server XMLs and the plugins' settings, so
#      this instance does not hand clients -- or send webhooks with -- links to
#      production.
#
#   3. Keep the provider's connection string current. OpenBao rotates the
#      password every 30 days; the provider reads it from database.xml (and the
#      dashboard from the plugin's own settings XML), so both are rewritten from
#      POSTGRES_CONNECTION_STRING on each start. Reloader restarts the pod when
#      the Secret changes, which is what makes this run.
#
# No Flux substitution happens in this file (the ConfigMap is generated with
# substitute: disabled). Anything cluster-specific arrives as an env var.
set -eu

: "${PG_MAJOR:?the postgres image sets PG_MAJOR}"
: "${POSTGRES_CONNECTION_STRING:?missing -- see externalsecret.yaml}"
: "${HOST_REWRITES:?missing -- see helmrelease.yaml}"

CONFIG=/config
# ⚠️ NEVER NAME IT `.jellyfin-*`. Jellyfin globs that pattern in its data
# directory (/config) as its own directory markers, and refuses to start on any
# it did not write: "Expected to find only .jellyfin-data but found marker for
# ...". That is exactly what the first name for this file did.
SEED_MARKER="$CONFIG/.clone-seed-fixups-done"
LEGACY_MARKER="$CONFIG/.jellyfin-pg-seed-fixups-done"
if [ -e "$LEGACY_MARKER" ]; then
  mv "$LEGACY_MARKER" "$SEED_MARKER"
fi

# ---------------------------------------------------------------------------
# 1. PostgreSQL client
# ---------------------------------------------------------------------------
# Inside the Jellyfin container this directory IS /usr/lib/postgresql/<major>.
# Only <major>/ may sit at the top: the plugin walks every directory under
# /usr/lib/postgresql looking for bin/pg_dump.
client="/pgclient/$PG_MAJOR"
seen="/pgclient/.ldd"
mkdir -p "$client/bin" "$client/libexec" "$client/lib"
: >"$seen"

for tool in pg_dump pg_dumpall pg_restore psql; do
  cp "/usr/lib/postgresql/$PG_MAJOR/bin/$tool" "$client/libexec/$tool"
  ldd "/usr/lib/postgresql/$PG_MAJOR/bin/$tool" |
    sed -n 's|.*=> \(/[^ ]*\) .*|\1|p' >>"$seen"
  # LD_LIBRARY_PATH on the wrapper, never on the pod: the copied libssl and
  # libpq must not leak into Jellyfin's own process.
  cat >"$client/bin/$tool" <<EOF
#!/bin/sh
LD_LIBRARY_PATH=/usr/lib/postgresql/$PG_MAJOR/lib exec /usr/lib/postgresql/$PG_MAJOR/libexec/$tool "\$@"
EOF
  chmod 0755 "$client/bin/$tool"
done

# Every shared library the tools link, except glibc's core, which the Jellyfin
# image already has at the same version (both are trixie).
sort -u "$seen" |
  grep -vE '/(libc|libm|libdl|libpthread|librt)\.so' |
  while read -r lib; do cp -L "$lib" "$client/lib/"; done
rm -f "$seen"

LD_LIBRARY_PATH="$client/lib" "$client/libexec/pg_dump" --version

# ---------------------------------------------------------------------------
# 2. One-time fix-ups on a volume freshly cloned from production
# ---------------------------------------------------------------------------
# HOST_REWRITES is "old=new old=new". Whole hostnames only, ignoring case:
# `jellyfin.example.com` matches, `myjellyfin.example.com`, the already-correct
# `jellyfin-pg.example.com` and `jellyfin.example.com.evil` do not. Text files
# only; assemblies are never touched.
if [ ! -e "$SEED_MARKER" ]; then
  echo "seed fix-ups: first start on this volume"
  # A substitution that rendered empty (`jellyfin.=jellyfin-pg.`) would rewrite
  # every `jellyfin.` prefix in the config. Fail the pod instead.
  for pair in $HOST_REWRITES; do
    case "$pair" in
      *.=* | *. | *=*=* | =* | *= | *[!A-Za-z0-9.=-]*)
        echo "refusing malformed HOST_REWRITES entry: $pair" >&2
        exit 1
        ;;
    esac
  done
  find "$CONFIG/config" "$CONFIG/plugins/configurations" -type f \
    \( -name '*.xml' -o -name '*.json' \) 2>/dev/null |
    while read -r file; do
      before=$(md5sum "$file")
      perl -0777 -i -pe '
        for my $pair (split /\s+/, $ENV{HOST_REWRITES}) {
          my ($old, $new) = split /=/, $pair, 2;
          s/(?<![\w.-])\Q$old\E(?![\w-]|\.\w)/$new/gi;
        }' "$file"
      [ "$before" = "$(md5sum "$file")" ] || echo "  rewrote hosts in $file"
    done
  date -u +%Y-%m-%dT%H:%M:%SZ >"$SEED_MARKER"
fi

# ---------------------------------------------------------------------------
# 3. Connection string
# ---------------------------------------------------------------------------
# Only an element that already exists is replaced: this never switches the
# server to PostgreSQL by itself. database.xml is touched only once it names
# the plugin provider -- the plugin's own "Activate" writes that -- so a server
# still on SQLite is left on SQLite.
sync_connection_string() {
  [ -f "$1" ] || return 0
  grep -q '<ConnectionString>' "$1" || return 0
  perl -0777 -i -pe '
    my $c = $ENV{POSTGRES_CONNECTION_STRING};
    $c =~ s/&/&amp;/g; $c =~ s/</&lt;/g; $c =~ s/>/&gt;/g;
    s{<ConnectionString>.*?</ConnectionString>}{<ConnectionString>$c</ConnectionString>}s;
  ' "$1"
  echo "connection string synced: $1"
}

if grep -q 'PLUGIN_PROVIDER' "$CONFIG/config/database.xml" 2>/dev/null; then
  sync_connection_string "$CONFIG/config/database.xml"
else
  echo "database.xml is not on the plugin provider yet -- SQLite, left alone"
fi
sync_connection_string "$CONFIG/plugins/configurations/Jellyfin.Database.Providers.Postgres.xml"

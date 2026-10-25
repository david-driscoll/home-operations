#!/bin/bash
# The `sshd` sidecar's entrypoint (../helmrelease.yaml): an OpenSSH server for
# editors' remote-SSH modes -- VS Code, Cursor and Zed, as opened by the
# paseo-remote-editor plugin -- reached through the internal gateway on :223
# (../tcproute.yaml).
#
# The image ships only openssh-client and the pod runs as `paseo` (1000), so
# there is no `apt-get install`. Instead this downloads bookworm's server .debs
# as 1000 into private apt state, unpacks them onto the `sshd` emptyDir, and
# runs that sshd unprivileged. An unprivileged sshd can only ever log in the
# user it runs as, which is the only user here anyway; it skips the
# privilege-separation chroot (no /run/sshd, no `sshd` user) and PAM.
#
# Never exit while the download is failing -- a crash-looping container takes
# the whole pod out of Ready, and with it the web UI on the same Service.
set -euo pipefail

ROOT=/opt/sshd/root
STATE=/opt/sshd/state
PORT=2222
SSH_DIR=/home/paseo/.ssh
HOST_KEY=$SSH_DIR/paseo_sshd_ed25519_key
AUTHORIZED_KEYS=/etc/paseo/sshd/authorized_keys

# openssh-server's own runtime libs that the image lacks -- libwrap0 and what
# it drags in. Everything else sshd links is already there for ssh(1).
PACKAGES=(openssh-server openssh-sftp-server libwrap0 libnsl2 libtirpc3)

apt_private() {
  apt-get \
    -o Dir::State::Lists="$STATE/lists" \
    -o Dir::Cache="$STATE/cache" \
    -o Debug::NoLocking=1 \
    -o APT::Sandbox::User="$(id -un)" \
    "$@"
}

# Every step carries its own `|| return 1`: errexit does not apply inside a
# function called as an `until` condition.
install_sshd() {
  rm -rf "$ROOT" "$STATE" "$INSTALLED"
  mkdir -p "$ROOT" "$STATE/lists/partial" "$STATE/cache/archives/partial" "$STATE/debs" || return 1
  apt_private -qq update || return 1
  # The server built from the same source upload as the image's client, so it
  # links against exactly the libs the image carries. The archive keeps only
  # the newest bookworm and bookworm-security builds, so once the image lags
  # behind both, fall back to the newest one.
  local version deb
  version=$(dpkg-query -W -f='${Version}' openssh-client) || return 1
  cd "$STATE/debs" || return 1
  if ! apt_private -qq download "openssh-server=$version" "openssh-sftp-server=$version"; then
    echo "sshd: openssh-server $version is gone from the archive; taking the newest" >&2
    apt_private -qq download openssh-server openssh-sftp-server || return 1
  fi
  apt_private -qq download "${PACKAGES[@]:2}" || return 1
  for deb in *.deb; do dpkg-deb -x "$deb" "$ROOT" || return 1; done
  cd / || return 1
  [[ -x $ROOT/usr/sbin/sshd && -x $ROOT/usr/lib/openssh/sftp-server ]] || return 1
  if LD_LIBRARY_PATH=$LIB ldd "$ROOT/usr/sbin/sshd" "$ROOT/usr/lib/openssh/sftp-server" | grep 'not found'; then
    echo "sshd: unresolved libraries above -- add their packages to PACKAGES" >&2
    return 1
  fi
  touch "$INSTALLED"
}

# The emptyDir outlives a container restart, so a restart skips the download.
LIB=$ROOT/lib/x86_64-linux-gnu:$ROOT/usr/lib/x86_64-linux-gnu
INSTALLED=/opt/sshd/installed
until [[ -f $INSTALLED ]] || install_sshd; do
  echo "sshd: install failed, retrying in 60s" >&2
  sleep 60
done

# On the home volume so it survives restarts and clients keep trusting it.
# chmod every start: an fsGroup ownership pass can add group bits, and sshd
# refuses a host key anyone else can read.
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"
[[ -f $HOST_KEY ]] || ssh-keygen -q -t ed25519 -N "" -C "paseo-sshd" -f "$HOST_KEY"
chmod 600 "$HOST_KEY"

# sshd starts sessions with a scrubbed environment, so hand them the
# container's own -- the daemon's, see ../helmrelease.yaml: the mise PATH, git
# identity and credential helper, gh's token dir, the age key, the toolport
# URLs. An allowlist, so Kubernetes' service-link variables stay out.
# PermitUserEnvironment reads this file verbatim -- no quoting -- which keeps
# the `$(cat ...)` in the git credential helper intact.
env | grep -E '^(PATH|TZ|MISE_[A-Z_]+|NPM_CONFIG_PREFIX|DISABLE_UPDATES|AZURE_MCP_COLLECT_TELEMETRY|GH_CONFIG_DIR|GIT_CONFIG_[A-Z0-9_]+|SOPS_AGE_KEY_FILE|TOOLPORT_[A-Z_]+_URL)=' \
  > "$SSH_DIR/environment"

# AuthorizedKeysFile is a single-file ConfigMap mount on purpose: StrictModes
# checks every directory above it, and only the root-owned 0755 parent a
# subPath mount gets passes. /home/paseo is group-writable (fsGroup), and a
# whole-directory mount's root is 1777.
cat > /opt/sshd/sshd_config <<EOF
Port $PORT
HostKey $HOST_KEY
PidFile none
AllowUsers paseo
AuthorizedKeysFile $AUTHORIZED_KEYS
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PermitUserEnvironment yes
# Editors' remote servers are reached over local forwards.
AllowTcpForwarding local
X11Forwarding no
ClientAliveInterval 30
Subsystem sftp $ROOT/usr/lib/openssh/sftp-server
EOF

export LD_LIBRARY_PATH=$LIB
# sshd re-execs itself, so it must be started by absolute path.
exec "$ROOT/usr/sbin/sshd" -D -e -f /opt/sshd/sshd_config

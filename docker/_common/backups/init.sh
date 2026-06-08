#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${SCRIPT_DIR}/rclone"

if [[ -f "$DEST" ]]; then
  echo "rclone already present at ${DEST}"
  exit 0
fi

# Detect container arch from host; default to amd64
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  RCLONE_ARCH="amd64" ;;
  aarch64|arm64) RCLONE_ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

DOWNLOAD_URL="https://downloads.rclone.org/rclone-current-linux-${RCLONE_ARCH}.zip"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading rclone (linux/${RCLONE_ARCH}) ..."
curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/rclone.zip"

unzip -q "${TMP_DIR}/rclone.zip" -d "$TMP_DIR"
cp "${TMP_DIR}"/rclone-*/rclone "$DEST"
chmod +x "$DEST"

echo "rclone installed to ${DEST}"

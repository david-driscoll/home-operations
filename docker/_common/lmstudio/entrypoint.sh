#!/bin/bash
set -e

# Install LM Studio headless (lms) if not already present in the persistent volume.
# This mirrors the llm-graph-builder init pattern: idempotent, skips if already done.
if [ ! -f "${HOME}/.local/bin/lms" ]; then
  echo "Installing LM Studio headless (lms)..."
  curl -fsSL https://lmstudio.ai/install.sh | bash
  echo "LM Studio installed successfully."
else
  echo "LM Studio already installed, skipping."
fi

exec "${HOME}/.local/bin/lms" server start --listen 0.0.0.0:1234

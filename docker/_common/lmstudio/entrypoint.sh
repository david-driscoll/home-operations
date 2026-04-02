#!/bin/bash
set -e

# Install LM Studio headless (lms) if not already present in the persistent volume.
# This mirrors the llm-graph-builder init pattern: idempotent, skips if already done.
if [ ! -f "${HOME}/.local/bin/lms" ]; then
  echo "Installing LM Studio headless (lms)..."
  apt-get update && apt-get install -y libatomic1
  curl -fsSL https://lmstudio.ai/install.sh | bash
  echo "LM Studio installed successfully."
else
  echo "LM Studio already installed, skipping."
fi

export PATH="${HOME}/.lmstudio/bin:${PATH}"

lms get zai-org/glm-4.6v-flash
lms get google/gemma-4-e4b
lms get qwen/qwen3.5-4b

exec lms server start --listen 0.0.0.0:1234

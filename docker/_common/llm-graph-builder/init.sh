#!/bin/bash
set -e

# Clone llm-graph-builder repo if not present
if [ ! -d "llm-graph-builder-src" ]; then
  echo "Cloning llm-graph-builder repository..."
  git clone https://github.com/neo4j-labs/llm-graph-builder.git llm-graph-builder-src --depth 1
  cd llm-graph-builder-src

  # Apply patches for Linux compatibility if needed
  if [ -f "backend/requirements.txt" ]; then
    # Remove +cpu pin for PyTorch arm64 compatibility (if present)
    sed -i 's/+cu\|+cpu//g' backend/requirements.txt || true
  fi

  cd ..
  echo "llm-graph-builder cloned and patched successfully."
else
  echo "llm-graph-builder-src already exists, skipping clone."
fi

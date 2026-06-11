#!/bin/bash
set -e

# Ensure data directories exist with correct ownership for UID 65534 (nobody)
for dir in data/prometheus data/alloy; do
  if [ ! -d "$dir" ]; then
    echo "Creating $dir..."
    mkdir -p "$dir"
  fi
  chown -R 65534:65534 "$dir"
done

curl -X POST http://prometheus:9090/-/reload

echo "Prometheus data directories ready."

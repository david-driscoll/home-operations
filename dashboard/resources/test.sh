#!/bin/bash
cd "$(dirname "$0")" || exit 1
op run --no-masking -- docker compose up --watch

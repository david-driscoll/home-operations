#!/bin/bash

# Example backup task script
# This script demonstrates how to use restic to backup data
# The script filename (without .sh) becomes the Gatus endpoint key: jobs_example

set -euo pipefail

# Environment variables available:
# - TZ: Timezone
# - GATUS_URL: Gatus instance URL for heartbeat reporting
#
# Volumes mounted:
# - /backup: Local backup directory
# - /repos: Local restic repositories
# - /spike/backup: NFS backup directory (read-only)
# - /spike/data: NFS data directory (read-only)

echo "Starting example backup task"
echo "Current time: $(date)"

# Example: Initialize a restic repository (only needed once)
# export RESTIC_REPOSITORY="/repos/example"
# export RESTIC_PASSWORD="your-password-here"
# restic init || true  # Ignore if already initialized

# Example: Backup a directory to restic repository
# restic backup /spike/data/important-files \
#   --tag daily \
#   --tag automated \
#   --verbose

# Example: Clean up old snapshots (keep last 7 daily, 4 weekly, 12 monthly)
# restic forget \
#   --keep-daily 7 \
#   --keep-weekly 4 \
#   --keep-monthly 12 \
#   --prune

# Example: Check repository integrity
# restic check

echo "Example backup task completed successfully"
echo "Finished at: $(date)"

# Exit 0 for success (reports "up" to Gatus)
# Exit non-zero for failure (reports "down" to Gatus)
exit 0

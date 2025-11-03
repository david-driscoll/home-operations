#!/bin/bash

set -euo pipefail

TASKS_DIR="/scripts/tasks"
LOG_DIR="/var/log/jobs"
GATUS_URL="${GATUS_URL:-}"
TIMEOUT_SECONDS=21600  # 6 hours
MAX_RETRIES=1

log() {
    echo "[$(date -Iseconds)] $*"
}

report_to_gatus() {
    local task_key="$1"
    local status="$2"  # "up" or "down"

    if [[ -z "$GATUS_URL" ]]; then
        log "GATUS_URL not set, skipping Gatus report for $task_key"
        return 0
    fi

    local endpoint="${GATUS_URL}/api/v1/endpoints/jobs_${task_key}/health?status=${status}"

    if curl -sf -X POST "$endpoint" > /dev/null 2>&1; then
        log "Successfully reported $status to Gatus for $task_key"
    else
        log "WARNING: Failed to report to Gatus for $task_key (endpoint: $endpoint)"
    fi
}

run_task() {
    local task_file="$1"
    local task_name
    task_name=$(basename "$task_file" .sh)
    local task_log="${LOG_DIR}/${task_name}.log"

    log "========================================" | tee -a "$task_log"
    log "Starting task: $task_name" | tee -a "$task_log"
    log "========================================" | tee -a "$task_log"

    local start_time
    start_time=$(date +%s)
    local exit_code=0
    local attempt=1

    # First attempt
    log "Attempt 1/$((MAX_RETRIES + 1))" | tee -a "$task_log"
    if timeout "$TIMEOUT_SECONDS" bash "$task_file" >> "$task_log" 2>&1; then
        exit_code=0
    else
        exit_code=$?

        if [[ $exit_code -eq 124 ]]; then
            log "Task timed out after $TIMEOUT_SECONDS seconds" | tee -a "$task_log"
        else
            log "Task failed with exit code $exit_code" | tee -a "$task_log"
        fi

        # Retry once if failed
        if [[ $MAX_RETRIES -gt 0 ]]; then
            log "Retrying task: $task_name" | tee -a "$task_log"
            attempt=2
            log "Attempt 2/$((MAX_RETRIES + 1))" | tee -a "$task_log"

            if timeout "$TIMEOUT_SECONDS" bash "$task_file" >> "$task_log" 2>&1; then
                exit_code=0
            else
                exit_code=$?
                if [[ $exit_code -eq 124 ]]; then
                    log "Task timed out on retry after $TIMEOUT_SECONDS seconds" | tee -a "$task_log"
                else
                    log "Task failed on retry with exit code $exit_code" | tee -a "$task_log"
                fi
            fi
        fi
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [[ $exit_code -eq 0 ]]; then
        log "Task completed successfully in ${duration}s (attempt $attempt)" | tee -a "$task_log"
        report_to_gatus "$task_name" "up"
    else
        log "Task failed after ${duration}s (attempt $attempt, exit code $exit_code)" | tee -a "$task_log"
        report_to_gatus "$task_name" "down"
    fi

    log "========================================" | tee -a "$task_log"
    log "" | tee -a "$task_log"
}

# Main execution
main() {
    log "Task runner started"

    if [[ ! -d "$TASKS_DIR" ]]; then
        log "ERROR: Tasks directory $TASKS_DIR not found"
        exit 1
    fi

    # Create log directory if it doesn't exist
    mkdir -p "$LOG_DIR"

    # Find all .sh files in tasks directory
    local task_count=0
    while IFS= read -r -d '' task_file; do
        ((task_count++))
        run_task "$task_file"
    done < <(find "$TASKS_DIR" -maxdepth 1 -name "*.sh" -type f -print0 | sort -z)

    if [[ $task_count -eq 0 ]]; then
        log "No tasks found in $TASKS_DIR"
    else
        log "Task runner completed. Processed $task_count task(s)"
    fi
}

main "$@"

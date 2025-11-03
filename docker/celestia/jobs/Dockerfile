FROM alpine:3.19

# Install required packages
RUN apk add --no-cache \
    bash \
    curl \
    tzdata \
    restic \
    rclone \
    coreutils

# Copy task runner script
COPY run-tasks.sh /usr/local/bin/run-tasks.sh
RUN chmod +x /usr/local/bin/run-tasks.sh

# Create log directory
RUN mkdir -p /var/log/jobs

# Setup cron job for 10 AM daily execution
RUN echo "0 10 * * * /usr/local/bin/run-tasks.sh >> /var/log/jobs/cron.log 2>&1" | crontab -

# Run cron in foreground
CMD ["crond", "-f", "-l", "2"]

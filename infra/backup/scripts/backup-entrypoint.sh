#!/bin/sh

# LMS Backup Service Entrypoint
# This script sets up automated backups for all databases

set -e

echo "Starting LMS Backup Service..."

# Create backup directories
mkdir -p /backups/postgres
mkdir -p /backups/mongodb
mkdir -p /backups/elasticsearch
mkdir -p /backups/redis
mkdir -p /backups/minio

# Install required packages
apk add --no-cache postgresql-client mongodb-tools curl jq gzip

# Set proper permissions
chmod +x /scripts/*.sh

# Create crontab for automated backups
cat > /etc/crontabs/root << EOF
# LMS Automated Backup Schedule
# Minute Hour Day Month DayOfWeek Command

# Daily PostgreSQL backup at 2:00 AM
0 2 * * * /scripts/postgres-backup.sh >> /var/log/backup.log 2>&1

# Daily MongoDB backup at 2:30 AM
30 2 * * * /scripts/mongodb-backup.sh >> /var/log/backup.log 2>&1

# Daily Elasticsearch backup at 3:00 AM
0 3 * * * /scripts/elasticsearch-backup.sh >> /var/log/backup.log 2>&1

# Daily Redis backup at 3:30 AM
30 3 * * * /scripts/redis-backup.sh >> /var/log/backup.log 2>&1

# Weekly cleanup of old backups every Sunday at 4:00 AM
0 4 * * 0 /scripts/cleanup-old-backups.sh >> /var/log/backup.log 2>&1

# Health check every hour
0 * * * * /scripts/backup-health-check.sh >> /var/log/backup.log 2>&1
EOF

# Create log file
touch /var/log/backup.log

# Run initial backup verification
echo "Running initial backup verification..."
/scripts/backup-health-check.sh

echo "Backup service configured successfully. Starting cron daemon..."

# Start cron daemon
exec crond -f -d 8 

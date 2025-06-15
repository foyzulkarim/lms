#!/bin/sh

# PostgreSQL Backup Script
# Creates timestamped backups with compression and rotation

set -e

# Configuration
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
POSTGRES_HOST="postgresql"
POSTGRES_PORT="5432"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting PostgreSQL backup..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Wait for PostgreSQL to be ready
log "Waiting for PostgreSQL to be ready..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER"; do
    log "PostgreSQL is not ready yet, waiting..."
    sleep 5
done

log "PostgreSQL is ready, starting backup..."

# Create backup
BACKUP_FILE="$BACKUP_DIR/lms_db_$DATE.sql"
log "Creating backup: $BACKUP_FILE"

# Perform the backup
if pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --no-password --verbose --format=custom --compress=9 \
    --file="$BACKUP_FILE.custom"; then
    
    log "Backup created successfully: $BACKUP_FILE.custom"
    
    # Also create a plain SQL backup for easier inspection
    pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        --no-password --verbose --format=plain \
        --file="$BACKUP_FILE"
    
    # Compress the plain SQL backup
    gzip "$BACKUP_FILE"
    log "Plain SQL backup created and compressed: $BACKUP_FILE.gz"
    
    # Verify the backup
    log "Verifying backup integrity..."
    if pg_restore --list "$BACKUP_FILE.custom" > /dev/null 2>&1; then
        log "Backup verification successful"
        
        # Calculate and log backup size
        BACKUP_SIZE=$(du -h "$BACKUP_FILE.custom" | cut -f1)
        log "Backup size: $BACKUP_SIZE"
        
        # Create a backup manifest
        cat > "$BACKUP_DIR/backup_$DATE.manifest" << EOF
{
    "timestamp": "$DATE",
    "database": "$POSTGRES_DB",
    "host": "$POSTGRES_HOST",
    "files": {
        "custom_format": "lms_db_$DATE.sql.custom",
        "plain_sql": "lms_db_$DATE.sql.gz"
    },
    "size": "$BACKUP_SIZE",
    "status": "success"
}
EOF
        
    else
        log "ERROR: Backup verification failed!"
        rm -f "$BACKUP_FILE.custom" "$BACKUP_FILE.gz"
        exit 1
    fi
    
else
    log "ERROR: Backup creation failed!"
    exit 1
fi

# Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "lms_db_*.sql*" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "backup_*.manifest" -mtime +$RETENTION_DAYS -delete

# Count remaining backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/lms_db_*.sql.custom 2>/dev/null | wc -l)
log "Backup completed successfully. Total backups: $BACKUP_COUNT"

# Update latest backup symlink
cd "$BACKUP_DIR"
rm -f latest_backup.sql.custom latest_backup.sql.gz
ln -sf "lms_db_$DATE.sql.custom" latest_backup.sql.custom
ln -sf "lms_db_$DATE.sql.gz" latest_backup.sql.gz

log "PostgreSQL backup process completed" 

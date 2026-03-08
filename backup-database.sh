#!/bin/bash
# Budget Tracker - Automated Database Backup Script
# This script backs up the production database and keeps the last 30 days of backups

set -e  # Exit on error

BACKUP_DIR="/home/jwalen/docker/budget-tracker/backups"
CONTAINER_NAME="budget-db-prod"
DB_USER="user"
DB_NAME="budget_db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/budget_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
echo "Starting database backup..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup completed successfully: $BACKUP_FILE ($SIZE)"
    
    # Keep only last 30 days of backups
    find "$BACKUP_DIR" -name "budget_*.sql.gz" -mtime +30 -delete
    echo "✅ Old backups cleaned up (kept last 30 days)"
    
    # Show remaining backups
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "budget_*.sql.gz" | wc -l)
    echo "📦 Total backups: $BACKUP_COUNT"
else
    echo "❌ Backup failed!"
    exit 1
fi

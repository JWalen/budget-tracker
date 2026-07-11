#!/bin/bash
# Budget Tracker - Automated Database Backup Script
# Backs up the production database and keeps the last 30 days of backups.
#
# Credentials are read from INSIDE the Postgres container (POSTGRES_USER /
# POSTGRES_DB), so the script always uses the right values and never drifts from
# whatever the container was started with. Override the container name or backup
# dir via env if needed.

set -euo pipefail   # -o pipefail: a failing pg_dump in the pipe aborts (was silently ignored)

BACKUP_DIR="${BACKUP_DIR:-/home/jwalen/docker/budget-tracker/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-budget-db-prod}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/budget_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup from container '$CONTAINER_NAME'..."

# Run pg_dump inside the container so it uses the container's own credentials.
# Dump to a temp file first; only promote to the final name if the dump succeeded
# and produced non-empty output — never leave a truncated/empty backup behind.
TMP_FILE="${BACKUP_FILE}.partial"
if docker exec "$CONTAINER_NAME" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$TMP_FILE"; then
    # A valid gzip of a real dump is comfortably over a few hundred bytes.
    if [ "$(gzip -dc "$TMP_FILE" | head -c 1 | wc -c)" -eq 0 ]; then
        echo "❌ Backup produced empty output — aborting"
        rm -f "$TMP_FILE"
        exit 1
    fi
    mv "$TMP_FILE" "$BACKUP_FILE"
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup completed successfully: $BACKUP_FILE ($SIZE)"

    # Keep only the last 30 days of backups.
    find "$BACKUP_DIR" -name "budget_*.sql.gz" -mtime +30 -delete
    echo "✅ Old backups cleaned up (kept last 30 days)"

    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "budget_*.sql.gz" | wc -l | tr -d ' ')
    echo "📦 Total backups: $BACKUP_COUNT"
else
    echo "❌ Backup failed!"
    rm -f "$TMP_FILE"
    exit 1
fi

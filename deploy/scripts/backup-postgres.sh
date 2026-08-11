#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_DIR/trace-$timestamp.dump"
sha256sum "$BACKUP_DIR/trace-$timestamp.dump" > "$BACKUP_DIR/trace-$timestamp.dump.sha256"
echo "created $BACKUP_DIR/trace-$timestamp.dump"

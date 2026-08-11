#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
createdb_url="$RESTORE_DATABASE_URL"
dropdb --if-exists "$createdb_url"
createdb "$createdb_url"
pg_restore --exit-on-error --no-owner --dbname="$createdb_url" "$BACKUP_FILE"
psql "$createdb_url" --command='select count(*) from information_schema.tables where table_schema = '\''public'\'';'
echo "restore verification completed; isolated database must be removed by the operator"

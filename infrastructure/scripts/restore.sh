#!/usr/bin/env bash
# VibeGPT – Restore drill (TEST your backups regularly).
#
#   ./infrastructure/scripts/restore.sh <path-to-dump>
#
# Restores into a THROWAWAY database (vibegpt_restore) so production is
# never touched. Verify row counts, then drop the throwaway DB.
set -euo pipefail

DUMP="${1:?usage: restore.sh <path-to-dump>}"
CONTAINER="${POSTGRES_CONTAINER:-vibegpt-postgres}"
DB_USER="${POSTGRES_USER:-vibegpt}"

echo "→ Preparing throwaway database vibegpt_restore"
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS vibegpt_restore;"
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE vibegpt_restore;"
docker exec "$CONTAINER" psql -U "$DB_USER" -d vibegpt_restore -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "→ Restoring $DUMP"
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d vibegpt_restore --no-owner < "$DUMP"

echo "→ Sanity counts"
docker exec "$CONTAINER" psql -U "$DB_USER" -d vibegpt_restore \
  -c "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'documents', count(*) FROM documents UNION ALL SELECT 'document_chunks', count(*) FROM document_chunks UNION ALL SELECT 'question_logs', count(*) FROM question_logs;"

echo "✓ Restore drill succeeded. Drop with:"
echo "  docker exec $CONTAINER psql -U $DB_USER -d postgres -c 'DROP DATABASE vibegpt_restore;'"

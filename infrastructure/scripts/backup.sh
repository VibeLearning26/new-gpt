#!/usr/bin/env bash
# VibeGPT – PostgreSQL + uploads backup (run on the host or via cron).
#
#   ./infrastructure/scripts/backup.sh
#
# Produces a timestamped, compressed dump plus an uploads tarball in
# $BACKUP_DIR (default ~/vibegpt-backups). Retains the last $KEEP (14).
# A backup is NOT verified until you have restored it — see restore.sh.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/vibegpt-backups}"
KEEP="${KEEP:-14}"
CONTAINER="${POSTGRES_CONTAINER:-vibegpt-postgres}"
DB_USER="${POSTGRES_USER:-vibegpt}"
DB_NAME="${POSTGRES_DB:-vibegpt}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "→ Dumping database $DB_NAME from container $CONTAINER"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  > "$BACKUP_DIR/vibegpt-db-$STAMP.dump"

if docker volume inspect vibegpt_uploads >/dev/null 2>&1; then
  echo "→ Archiving uploads volume"
  docker run --rm -v vibegpt_uploads:/data -v "$BACKUP_DIR":/backup alpine \
    tar czf "/backup/vibegpt-uploads-$STAMP.tar.gz" -C /data .
fi

echo "→ Pruning backups older than the last $KEEP"
ls -1t "$BACKUP_DIR"/vibegpt-db-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -1t "$BACKUP_DIR"/vibegpt-uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "✓ Backup complete: $BACKUP_DIR (db + uploads @ $STAMP)"
echo "  Copy off-host now (e.g. rclone/restic) — local backups do not survive disk loss."

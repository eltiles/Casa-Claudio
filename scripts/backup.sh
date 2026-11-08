#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL no esta definida}"

STAMP=$(date +%Y%m%d_%H%M%S)
OUT="backups/gestion_bar_${STAMP}.sql.gz"
mkdir -p backups
pg_dump "$DATABASE_URL" | gzip > "$OUT"

ls -t backups/*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm --
echo "Backup creado: $OUT (retencion: 7 ultimos)"
